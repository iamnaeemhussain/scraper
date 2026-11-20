import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'auth_tokens.dart';
import 'models.dart';

class AuthRepository {
  AuthRepository(this._dio, this._storage);

  final Dio _dio;
  final FlutterSecureStorage _storage;

  Future<void> _persist(Map<String, dynamic> tokens) async {
    await _storage.write(key: kAccessKey, value: tokens['accessToken'] as String?);
    await _storage.write(key: kRefreshKey, value: tokens['refreshToken'] as String?);
  }

  Future<void> register({
    required String email,
    required String password,
    String locale = 'en',
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/auth/register',
      data: {'email': email, 'password': password, 'locale': locale},
      options: Options(extra: {'skipAuth': true}),
    );
    await _persist(res.data!);
  }

  Future<void> login({required String email, required String password}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email, 'password': password},
      options: Options(extra: {'skipAuth': true}),
    );
    await _persist(res.data!);
  }

  Future<void> logout() async {
    try {
      await _dio.post('/auth/logout');
    } catch (_) {}
    await _storage.delete(key: kAccessKey);
    await _storage.delete(key: kRefreshKey);
  }

  Future<bool> isLoggedIn() async => (await _storage.read(key: kAccessKey)) != null;

  Future<Me> me() async {
    final res = await _dio.get<Map<String, dynamic>>('/me');
    return Me.fromJson(res.data!);
  }

  Future<void> forgotPassword(String email) async {
    await _dio.post(
      '/auth/forgot-password',
      data: {'email': email},
      options: Options(extra: {'skipAuth': true}),
    );
  }
}

class CatalogRepository {
  CatalogRepository(this._dio);
  final Dio _dio;

  Future<List<Region>> regions() async {
    final res = await _dio.get<List<dynamic>>('/regions');
    return res.data!.map((e) => Region.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<PackageItem>> packages({String? country}) async {
    final res = await _dio.get<List<dynamic>>(
      '/packages',
      queryParameters: {
        if (country != null) 'region': country,
      },
    );
    return res.data!.map((e) => PackageItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<PackageItem> packageBySlug(String bundleId) async {
    final res = await _dio.get<Map<String, dynamic>>('/packages/$bundleId');
    return PackageItem.fromJson(res.data!);
  }
}

class OrdersRepository {
  OrdersRepository(this._dio);
  final Dio _dio;

  Future<OrderCreatedResponse> create({required String slug, int count = 1}) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/orders',
      data: {
        'bundleId': slug,
        'quantity': count,
      },
    );
    return OrderCreatedResponse.fromJson(res.data!);
  }

  Future<OrderSummary> status(String orderId) async {
    final res = await _dio.get<Map<String, dynamic>>('/orders/$orderId');
    return OrderSummary.fromJson(res.data!);
  }
}

class EsimsRepository {
  EsimsRepository(this._dio);
  final Dio _dio;

  Future<List<Esim>> list() async {
    final res = await _dio.get<List<dynamic>>('/esims');
    return res.data!.map((e) => Esim.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Esim> one(String id) async {
    final res = await _dio.get<Map<String, dynamic>>('/esims/$id');
    return Esim.fromJson(res.data!);
  }

  Future<Esim> refresh(String id) async {
    final res = await _dio.post<Map<String, dynamic>>('/esims/$id/refresh');
    return Esim.fromJson(res.data!);
  }

  Future<List<PackageItem>> topUpsFor(String esimId) async {
    final res = await _dio.get<List<dynamic>>(
      '/bundles',
      queryParameters: {'reloadable': 'true'},
    );
    return res.data!.map((e) => PackageItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<OrderCreatedResponse> orderTopUp(String esimId, String bundleId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/topups',
      data: {'esimId': esimId, 'bundleId': bundleId},
    );
    return OrderCreatedResponse.fromJson(res.data!);
  }
}

final authRepoProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider), ref.watch(secureStorageProvider)),
);
final catalogRepoProvider = Provider<CatalogRepository>(
  (ref) => CatalogRepository(ref.watch(apiClientProvider)),
);
final ordersRepoProvider = Provider<OrdersRepository>(
  (ref) => OrdersRepository(ref.watch(apiClientProvider)),
);
final esimsRepoProvider = Provider<EsimsRepository>(
  (ref) => EsimsRepository(ref.watch(apiClientProvider)),
);

final regionsProvider = FutureProvider<List<Region>>(
  (ref) => ref.watch(catalogRepoProvider).regions(),
);

final packagesByCountryProvider = FutureProvider.family<List<PackageItem>, String>(
  (ref, code) => ref.watch(catalogRepoProvider).packages(country: code),
);

final packageBySlugProvider = FutureProvider.family<PackageItem, String>(
  (ref, slug) => ref.watch(catalogRepoProvider).packageBySlug(slug),
);

final myEsimsProvider = FutureProvider<List<Esim>>(
  (ref) => ref.watch(esimsRepoProvider).list(),
);

final esimByIdProvider = FutureProvider.family<Esim, String>(
  (ref, id) => ref.watch(esimsRepoProvider).one(id),
);

final esimTopUpsProvider = FutureProvider.family<List<PackageItem>, String>(
  (ref, esimId) => ref.watch(esimsRepoProvider).topUpsFor(esimId),
);

final meProvider = FutureProvider<Me>(
  (ref) => ref.watch(authRepoProvider).me(),
);

final authStateProvider = FutureProvider<bool>(
  (ref) => ref.watch(authRepoProvider).isLoggedIn(),
);
