import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/repositories.dart';
import '../features/auth/forgot_password_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/catalog/country_screen.dart';
import '../features/catalog/package_detail_screen.dart';
import '../features/checkout/checkout_screen.dart';
import '../features/esim/esim_detail_screen.dart';
import '../features/esim/esims_list_screen.dart';
import '../features/home/home_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/topup/topup_screen.dart';
import 'shell.dart';

final _rootKey = GlobalKey<NavigatorState>();
final _homeKey = GlobalKey<NavigatorState>();
final _esimsKey = GlobalKey<NavigatorState>();
final _profileKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/',
    redirect: (context, state) async {
      final authed = await ref.read(authRepoProvider).isLoggedIn();
      final loc = state.matchedLocation;
      final isAuthScreen =
          loc == '/login' || loc == '/register' || loc == '/forgot-password';
      if (!authed && !isAuthScreen) return '/login';
      if (authed && isAuthScreen) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(
        path: '/forgot-password',
        builder: (_, state) => ForgotPasswordScreen(
          initialEmail: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => AppShell(navigationShell: shell),
        branches: [
          // Tab 1: Discover (home + catalog flow)
          StatefulShellBranch(
            navigatorKey: _homeKey,
            routes: [
              GoRoute(
                path: '/',
                builder: (_, __) => const HomeScreen(),
                routes: [
                  GoRoute(
                    path: 'country/:code',
                    builder: (_, s) => CountryScreen(
                      code: s.pathParameters['code']!,
                      name: s.extra as String?,
                    ),
                  ),
                  GoRoute(
                    path: 'package/:slug',
                    builder: (_, s) => PackageDetailScreen(slug: s.pathParameters['slug']!),
                  ),
                  GoRoute(
                    path: 'checkout/:slug',
                    parentNavigatorKey: _rootKey,
                    builder: (_, s) => CheckoutScreen(slug: s.pathParameters['slug']!),
                  ),
                ],
              ),
            ],
          ),
          // Tab 2: My eSIMs
          StatefulShellBranch(
            navigatorKey: _esimsKey,
            routes: [
              GoRoute(
                path: '/esims',
                builder: (_, __) => const EsimsListScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (_, s) => EsimDetailScreen(id: s.pathParameters['id']!),
                    routes: [
                      GoRoute(
                        path: 'topup',
                        parentNavigatorKey: _rootKey,
                        builder: (_, s) => TopUpScreen(
                          esimId: s.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          // Tab 3: Profile
          StatefulShellBranch(
            navigatorKey: _profileKey,
            routes: [
              GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
            ],
          ),
        ],
      ),
    ],
    errorBuilder: (_, state) => Scaffold(
      body: Center(child: Text('Sayfa bulunamadı: ${state.uri}')),
    ),
  );
});
