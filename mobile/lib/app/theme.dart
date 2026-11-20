import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Calm travel/eSIM design system, available in dark + light variants.
///
/// Brand accents and semantic colors are universal and stay compile-time const.
/// Surface and ink colors swap between themes via
/// `_Palette`, which is selected by `AppColors.setMode(...)` at runtime.
/// Listen on [AppThemeMode.notifier] to rebuild after a switch.

// ─── Mode controller ───────────────────────────────────────────────────────

class AppThemeMode {
  /// Reactive theme mode. Default: system (Flutter resolves dark/light from
  /// the device). Profile toggle writes here.
  static final notifier = ValueNotifier<ThemeMode>(ThemeMode.system);
}

// ─── Brand (universal, const) ──────────────────────────────────────────────

class AppBrand {
  static const auroraStart = Color(0xFF2B8A7E); // muted teal
  static const auroraMid = Color(0xFF477F8F); // blue slate
  static const auroraEnd = Color(0xFF58708E); // steel

  static const success = Color(0xFF2F9B69);
  static const warning = Color(0xFFD89B35);
  static const danger = Color(0xFFD05C67);
}

// ─── Palette ───────────────────────────────────────────────────────────────

@immutable
class _Palette {
  const _Palette({
    required this.bg,
    required this.surface,
    required this.surfaceHigh,
    required this.surfaceMuted,
    required this.surfaceGlass,
    required this.stroke,
    required this.strokeStrong,
    required this.ink,
    required this.ink2,
    required this.ink3,
    required this.inkInverse,
    required this.brightness,
  });

  final Color bg;
  final Color surface;
  final Color surfaceHigh;
  final Color surfaceMuted;
  final Color surfaceGlass;
  final Color stroke;
  final Color strokeStrong;
  final Color ink;
  final Color ink2;
  final Color ink3;
  final Color inkInverse;
  final Brightness brightness;

  static const dark = _Palette(
    bg: Color(0xFF090E11),
    surface: Color(0xFF11181D),
    surfaceHigh: Color(0xFF192329),
    surfaceMuted: Color(0xFF0D1317),
    // Translucent fill for liquid-glass surfaces — combined with a
    // BackdropFilter blur, ~40% opacity lets the canvas + content
    // behind bleed through for the iOS-style frosted glass effect.
    surfaceGlass: Color(0x73151D22),
    stroke: Color(0xFF233038),
    strokeStrong: Color(0xFF34434D),
    ink: Color(0xFFF4F1EA),
    ink2: Color(0xFFB5BBB9),
    ink3: Color(0xFF788581),
    inkInverse: Color(0xFF081012),
    brightness: Brightness.dark,
  );

  static const light = _Palette(
    bg: Color(0xFFF7F6F2),
    surface: Color(0xFFFFFFFF),
    surfaceHigh: Color(0xFFF0F2EE),
    surfaceMuted: Color(0xFFFFFFFF),
    surfaceGlass: Color(0xB8FFFFFF),
    stroke: Color(0xFFDDE3DD),
    strokeStrong: Color(0xFFC2CCC5),
    ink: Color(0xFF172026),
    ink2: Color(0xFF4D5B5E),
    ink3: Color(0xFF828E8B),
    inkInverse: Color(0xFFFFFFFF),
    brightness: Brightness.light,
  );
}

// ─── Active palette + AppColors façade ─────────────────────────────────────

/// Notifies on palette change — wrap `MaterialApp` in a ValueListenableBuilder
/// listening here so the whole tree rebuilds on theme switch.
final ValueNotifier<_Palette> _activePalette = ValueNotifier(_Palette.dark);

/// Façade used by screens — kept as `AppColors.X` so existing code paths
/// don't need to plumb BuildContext for theming. Brand colors are forwarded
/// from [AppBrand] for backwards compatibility.
class AppColors {
  // Brand (const)
  static const auroraStart = AppBrand.auroraStart;
  static const auroraMid = AppBrand.auroraMid;
  static const auroraEnd = AppBrand.auroraEnd;
  static const primary = AppBrand.auroraStart;
  static const accent = AppBrand.auroraEnd;
  static const success = AppBrand.success;
  static const warning = AppBrand.warning;
  static const danger = AppBrand.danger;

  // Surface / ink (dynamic)
  static Color get bg => _activePalette.value.bg;
  static Color get surface => _activePalette.value.surface;
  static Color get surfaceHigh => _activePalette.value.surfaceHigh;
  static Color get surfaceMuted => _activePalette.value.surfaceMuted;
  static Color get surfaceGlass => _activePalette.value.surfaceGlass;
  // Alias kept for older call sites that use `AppColors.card`.
  static Color get card => _activePalette.value.surface;
  static Color get stroke => _activePalette.value.stroke;
  static Color get strokeStrong => _activePalette.value.strokeStrong;
  static Color get ink => _activePalette.value.ink;
  static Color get ink2 => _activePalette.value.ink2;
  static Color get ink3 => _activePalette.value.ink3;
  static Color get inkInverse => _activePalette.value.inkInverse;

  /// Brightness of the currently active palette — useful for assertions /
  /// conditional decorations that can't reach Theme.of(context).
  static Brightness get brightness => _activePalette.value.brightness;

  /// Listenable for widgets that want to rebuild when the palette flips.
  static Listenable get listenable => _activePalette;

  /// Internal: swap the active palette. Don't call directly — use
  /// `AppThemeMode.notifier.value = ThemeMode.{light,dark,system}` and let
  /// `EsimApp` apply it via [_syncPalette].
  static void _setBrightness(Brightness b) {
    _activePalette.value =
        b == Brightness.light ? _Palette.light : _Palette.dark;
  }
}

/// Called by the root app when MediaQuery or user toggle changes effective
/// brightness — keeps the dynamic palette in sync.
void syncAppPalette(Brightness effective) {
  if (AppColors.brightness != effective) {
    AppColors._setBrightness(effective);
  }
}

// ─── Gradients (brand; const) ─────────────────────────────────────────────

class AppGradients {
  static const aurora = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppBrand.auroraStart, AppBrand.auroraMid],
  );
  static const auroraSoft = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0x242B8A7E), Color(0x1A58708E)],
  );
  static const heroGlow = RadialGradient(
    center: Alignment(-0.65, -0.95),
    radius: 1.15,
    colors: [Color(0x242B8A7E), Color(0x00090E11)],
  );
}

class AppRadii {
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 20.0;
  static const xl = 28.0;
  static const pill = 999.0;
}

class BorderRadii {
  static final medium = BorderRadius.circular(AppRadii.md);
}

// ─── Theme factories ──────────────────────────────────────────────────────

ThemeData buildDarkTheme() => _buildTheme(_Palette.dark);
ThemeData buildLightTheme() => _buildTheme(_Palette.light);

ThemeData _buildTheme(_Palette p) {
  final brightness = p.brightness;
  final scheme = ColorScheme.fromSeed(
    seedColor: AppBrand.auroraStart,
    brightness: brightness,
  ).copyWith(
    primary: AppBrand.auroraStart,
    secondary: AppBrand.auroraEnd,
    surface: p.surface,
    surfaceContainerHighest: p.surfaceHigh,
    error: AppBrand.danger,
    onPrimary: Colors.white,
    onSecondary: p.inkInverse,
    onSurface: p.ink,
    onError: Colors.white,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: p.bg,
    brightness: brightness,
  );

  final overlayStyle = brightness == Brightness.dark
      ? const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          statusBarBrightness: Brightness.dark,
        )
      : const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.dark,
          statusBarBrightness: Brightness.light,
        );

  return base.copyWith(
    textTheme: base.textTheme
        .apply(bodyColor: p.ink, displayColor: p.ink)
        .copyWith(
          displayLarge: TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: -1.4,
              height: 1.0,
              fontSize: 44,
              color: p.ink),
          displayMedium: TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: -1.0,
              height: 1.02,
              fontSize: 38,
              color: p.ink),
          displaySmall: TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.8,
              height: 1.05,
              fontSize: 32,
              color: p.ink),
          headlineLarge: TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
              height: 1.1,
              fontSize: 28,
              color: p.ink),
          headlineMedium: TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
              height: 1.15,
              fontSize: 24,
              color: p.ink),
          headlineSmall: TextStyle(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
              height: 1.2,
              fontSize: 20,
              color: p.ink),
          titleLarge: TextStyle(
              fontWeight: FontWeight.w700, fontSize: 18, color: p.ink),
          titleMedium: TextStyle(
              fontWeight: FontWeight.w700, fontSize: 15, color: p.ink),
          bodyLarge: TextStyle(fontSize: 16, height: 1.5, color: p.ink),
          bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: p.ink2),
          bodySmall: TextStyle(fontSize: 12, color: p.ink3, height: 1.4),
          labelLarge:
              const TextStyle(fontWeight: FontWeight.w600, letterSpacing: 0.2),
        ),
    appBarTheme: AppBarTheme(
      backgroundColor: p.bg,
      foregroundColor: p.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: overlayStyle,
      titleTextStyle: TextStyle(
        color: p.ink,
        fontWeight: FontWeight.w700,
        fontSize: 17,
      ),
      iconTheme: IconThemeData(color: p.ink, size: 22),
    ),
    cardTheme: CardThemeData(
      color: p.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.lg),
        side: BorderSide(color: p.stroke),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      hintStyle: TextStyle(color: p.ink3, fontWeight: FontWeight.w500),
      labelStyle: TextStyle(color: p.ink2, fontWeight: FontWeight.w500),
      floatingLabelStyle: const TextStyle(
          color: AppBrand.auroraEnd, fontWeight: FontWeight.w600),
      prefixIconColor: p.ink3,
      suffixIconColor: p.ink3,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: BorderSide(color: p.stroke),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: BorderSide(color: p.stroke),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppBrand.auroraEnd, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.md),
        borderSide: const BorderSide(color: AppBrand.danger, width: 1.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.ink,
        foregroundColor: p.inkInverse,
        minimumSize: const Size.fromHeight(56),
        padding: const EdgeInsets.symmetric(horizontal: 24),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md)),
        textStyle: const TextStyle(
            fontWeight: FontWeight.w700, fontSize: 15, letterSpacing: 0.2),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.ink,
        minimumSize: const Size.fromHeight(54),
        side: BorderSide(color: p.strokeStrong, width: 1.2),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppBrand.auroraEnd,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.surfaceMuted,
      indicatorColor: AppBrand.auroraStart.withValues(alpha: 0.12),
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 72,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          fontSize: 12,
          letterSpacing: 0.2,
          color: selected ? p.ink : p.ink3,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? AppBrand.auroraEnd : p.ink3,
          size: 24,
        );
      }),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: p.surfaceMuted,
      selectedItemColor: AppBrand.auroraEnd,
      unselectedItemColor: p.ink3,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: AppBrand.auroraEnd,
      linearMinHeight: 6,
      linearTrackColor: p.stroke,
    ),
    dividerTheme: DividerThemeData(color: p.stroke, thickness: 1, space: 1),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.surfaceHigh,
      contentTextStyle: TextStyle(color: p.ink, fontWeight: FontWeight.w500),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg)),
    ),
    iconTheme: IconThemeData(color: p.ink2),
    tabBarTheme: TabBarThemeData(
      labelColor: p.ink,
      unselectedLabelColor: p.ink3,
      indicatorColor: AppBrand.auroraEnd,
      labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      unselectedLabelStyle:
          const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
      dividerColor: p.stroke,
    ),
    splashFactory: InkSparkle.splashFactory,
  );
}
