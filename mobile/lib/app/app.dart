import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'router.dart';
import 'theme.dart';

class EsimApp extends ConsumerWidget {
  const EsimApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return ValueListenableBuilder<ThemeMode>(
      valueListenable: AppThemeMode.notifier,
      builder: (context, mode, _) {
        // Resolve effective brightness for the dynamic AppColors palette so
        // static getters return matching values. `ThemeMode.system` defers
        // to the platform setting.
        final platformBrightness =
            MediaQuery.platformBrightnessOf(context);
        final effective = switch (mode) {
          ThemeMode.dark => Brightness.dark,
          ThemeMode.light => Brightness.light,
          ThemeMode.system => platformBrightness,
        };
        // Mutating during build is normally a Flutter no-no, but
        // `ValueNotifier.value = ...` is a simple field write whose listener
        // notification we route below through `MaterialApp.builder`. The
        // post-frame guard avoids "set state during build" complaints on the
        // first paint when defaults already match.
        if (AppColors.brightness != effective) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            syncAppPalette(effective);
          });
        }

        return MaterialApp.router(
          title: 'eSIM',
          theme: buildLightTheme(),
          darkTheme: buildDarkTheme(),
          themeMode: mode,
          routerConfig: router,
          // Screens read `AppColors.X` as static getters — those bypass
          // Flutter's InheritedWidget dependency tracking, so a theme swap
          // alone wouldn't rebuild them.
          //
          // Strategy: subscribe the wrapper to `AppColors.listenable`, and
          // keyed-subtree the child on the current brightness. A different
          // key forces Flutter to discard the cached element subtree and
          // rebuild from scratch — descendants then re-read AppColors and
          // pick up the new palette. Navigation state survives because the
          // router holds the Navigator via `GlobalKey` (router.dart).
          builder: (ctx, child) => ListenableBuilder(
            listenable: AppColors.listenable,
            builder: (_, __) => KeyedSubtree(
              key: ValueKey(AppColors.brightness),
              child: child ?? const SizedBox.shrink(),
            ),
          ),
          localizationsDelegates: context.localizationDelegates,
          supportedLocales: context.supportedLocales,
          locale: context.locale,
          debugShowCheckedModeBanner: false,
        );
      },
    );
  }
}
