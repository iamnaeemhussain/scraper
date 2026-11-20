import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../app/env.dart';
import 'auth_tokens.dart';

final secureStorageProvider = Provider<FlutterSecureStorage>(
  (_) => const FlutterSecureStorage(),
);

final apiClientProvider = Provider<Dio>((ref) {
  final storage = ref.watch(secureStorageProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      contentType: 'application/json',
    ),
  );

  dio.interceptors.add(_AuthInterceptor(storage, dio));
  return dio;
});

class _AuthInterceptor extends QueuedInterceptor {
  _AuthInterceptor(this._storage, this._dio);

  final FlutterSecureStorage _storage;
  final Dio _dio;
  bool _refreshing = false;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.extra['skipAuth'] != true) {
      final access = await _storage.read(key: kAccessKey);
      if (access != null && access.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $access';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final status = err.response?.statusCode;
    final isAuthCall = err.requestOptions.path.startsWith('/auth/');
    if (status != 401 || isAuthCall || _refreshing) {
      return handler.next(err);
    }

    final refresh = await _storage.read(key: kRefreshKey);
    if (refresh == null || refresh.isEmpty) {
      await _storage.delete(key: kAccessKey);
      return handler.next(err);
    }

    _refreshing = true;
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refresh},
        options: Options(extra: {'skipAuth': true}),
      );
      final body = res.data;
      if (body == null) return handler.next(err);

      await _storage.write(key: kAccessKey, value: body['accessToken'] as String?);
      await _storage.write(key: kRefreshKey, value: body['refreshToken'] as String?);

      // Retry the original request with the new token.
      final retried = await _dio.fetch<dynamic>(
        err.requestOptions
          ..headers['Authorization'] = 'Bearer ${body['accessToken']}',
      );
      return handler.resolve(retried);
    } on DioException {
      await _storage.delete(key: kAccessKey);
      await _storage.delete(key: kRefreshKey);
      return handler.next(err);
    } finally {
      _refreshing = false;
    }
  }
}
