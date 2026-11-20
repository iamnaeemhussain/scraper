import 'package:country_flags/country_flags.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/country_names.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../shared/widgets.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

enum _Scope { all, local, regional }

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  _Scope _scope = _Scope.all;

  static const _popularCodes = [
    'TR',
    'US',
    'GB',
    'DE',
    'FR',
    'IT',
    'ES',
    'JP',
    'AE',
    'TH',
    'GR',
    'NL',
  ];

  @override
  Widget build(BuildContext context) {
    final regions = ref.watch(regionsProvider);
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: regions.when(
        loading: () => const CenteredLoader(),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off,
          title: 'errors.load_failed'.tr(),
          subtitle: e.toString(),
          action: AuroraButton(
            label: 'common.retry'.tr(),
            onPressed: () => ref.invalidate(regionsProvider),
          ),
        ),
        data: (all) => _build(all),
      ),
    );
  }

  Widget _build(List<Region> all) {
    final media = MediaQuery.of(context);
    final keyboardVisible = media.viewInsets.bottom > 0;
    final bottomPadding = keyboardVisible
        ? media.viewInsets.bottom + 48
        : media.padding.bottom + 154;
    final scoped = all.where((r) {
      final isRegional = _isRegional(r);
      switch (_scope) {
        case _Scope.local:
          return !isRegional;
        case _Scope.regional:
          return isRegional;
        case _Scope.all:
          return true;
      }
    }).toList();

    final lang = context.locale.languageCode;
    final filtered = _query.isEmpty
        ? scoped
            .where((r) => _scope != _Scope.all
                ? true
                : _popularCodes.contains(r.locationCode))
            .toList()
        : scoped.where((r) {
            final localized = localizedCountryName(
              code: r.locationCode,
              locale: lang,
              fallback: r.locationName,
            ).toLowerCase();
            // Search both the localized name and the backend name, so users
            // typing in either language find a hit.
            return localized.contains(_query) ||
                r.locationName.toLowerCase().contains(_query);
          }).toList();

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      child: RefreshIndicator(
        onRefresh: () async => ref.invalidate(regionsProvider),
        color: AppColors.auroraEnd,
        backgroundColor: AppColors.surface,
        child: CustomScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
                child: _Hero(
              controller: _searchCtrl,
              query: _query,
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
              onClear: () {
                _searchCtrl.clear();
                setState(() => _query = '');
              },
              destinationCount: all.length,
            )),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: _ScopeChips(
                  scope: _scope,
                  onChange: (s) => setState(() => _scope = s),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
                child: Row(
                  children: [
                    SectionLabel(_query.isEmpty
                        ? (_scope == _Scope.regional
                            ? 'home.regional'.tr()
                            : 'home.popular'.tr())
                        : 'home.results'.tr()),
                    const Spacer(),
                    if (_query.isEmpty && _scope == _Scope.all)
                      Text(
                        '${filtered.length}',
                        style: TextStyle(
                            color: AppColors.ink3,
                            fontSize: 11,
                            fontWeight: FontWeight.w700),
                      ),
                  ],
                ),
              ),
            ),
            if (filtered.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Icons.search_off,
                  title: 'home.no_results'.tr(),
                ),
              )
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(20, 0, 20, bottomPadding),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: 0.96,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (_, i) => _CountryCard(region: filtered[i]),
                    childCount: filtered.length,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static bool _isRegional(Region r) =>
      r.locationCode.startsWith('!') || r.locationCode.length != 2;
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.controller,
    required this.query,
    required this.onChanged,
    required this.onClear,
    required this.destinationCount,
  });

  final TextEditingController controller;
  final String query;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final int destinationCount;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    final width = MediaQuery.of(context).size.width;
    final searching = query.isNotEmpty;
    final titleSize = width < 390 ? 25.0 : 27.0;
    return Stack(
      children: [
        const Positioned.fill(
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: AppGradients.heroGlow,
              ),
            ),
          ),
        ),
        Positioned(
          top: top + 8,
          right: -148,
          child: const IgnorePointer(
            child: _HeroGlobeWatermark(size: 344),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(20, top + 10, 20, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const BrandMark(),
                  const Spacer(),
                  _PillBadge(
                    icon: Icons.public,
                    label: 'home.destinations_count'
                        .tr(args: ['$destinationCount']),
                  ),
                ],
              ),
              ClipRect(
                child: AnimatedAlign(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  heightFactor: searching ? 0.0 : 1.0,
                  child: IgnorePointer(
                    ignoring: searching,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 140),
                      curve: Curves.easeOut,
                      opacity: searching ? 0 : 1,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 22),
                          Text(
                            'home.welcome_line1'.tr(),
                            style: TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w700,
                              fontSize: titleSize,
                              letterSpacing: 0,
                              height: 1.08,
                            ),
                          ),
                          GradientText(
                            'home.welcome_line2'.tr(),
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: titleSize,
                              letterSpacing: 0,
                              height: 1.08,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            'home.subtitle'.tr(),
                            style: TextStyle(
                                color: AppColors.ink2,
                                fontSize: 14,
                                height: 1.5),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                height: searching ? 10 : 18,
              ),
              _SearchField(
                controller: controller,
                query: query,
                onChanged: onChanged,
                onClear: onClear,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _HeroGlobeWatermark extends StatelessWidget {
  const _HeroGlobeWatermark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: AppColors.brightness == Brightness.dark ? 0.50 : 0.34,
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _HeroGlobePainter()),
      ),
    );
  }
}

class _HeroGlobePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = size.shortestSide / 2 - 10;
    final stroke = Paint()
      ..color = AppColors.ink.withValues(alpha: 0.06)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    final softStroke = Paint()
      ..color = AppColors.ink.withValues(alpha: 0.032)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;
    final landStroke = Paint()
      ..color = AppColors.ink.withValues(alpha: 0.05)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final routeStroke = Paint()
      ..color = AppColors.auroraStart.withValues(alpha: 0.11)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, stroke);
    canvas.drawOval(
      Rect.fromCenter(center: center, width: radius * 0.78, height: radius * 2),
      softStroke,
    );
    canvas.drawOval(
      Rect.fromCenter(center: center, width: radius * 1.45, height: radius * 2),
      softStroke,
    );
    canvas.drawOval(
      Rect.fromCenter(center: center, width: radius * 2, height: radius * 0.70),
      softStroke,
    );
    canvas.drawOval(
      Rect.fromCenter(center: center, width: radius * 2, height: radius * 1.34),
      softStroke,
    );
    canvas.drawLine(
      Offset(center.dx - radius, center.dy),
      Offset(center.dx + radius, center.dy),
      softStroke,
    );

    final europeAfrica = Path()
      ..moveTo(center.dx - radius * 0.18, center.dy - radius * 0.55)
      ..cubicTo(
        center.dx + radius * 0.12,
        center.dy - radius * 0.68,
        center.dx + radius * 0.36,
        center.dy - radius * 0.38,
        center.dx + radius * 0.12,
        center.dy - radius * 0.18,
      )
      ..cubicTo(
        center.dx - radius * 0.06,
        center.dy - radius * 0.04,
        center.dx + radius * 0.16,
        center.dy + radius * 0.10,
        center.dx + radius * 0.03,
        center.dy + radius * 0.42,
      )
      ..cubicTo(
        center.dx - radius * 0.10,
        center.dy + radius * 0.28,
        center.dx - radius * 0.24,
        center.dy + radius * 0.02,
        center.dx - radius * 0.18,
        center.dy - radius * 0.22,
      );
    final americas = Path()
      ..moveTo(center.dx - radius * 0.62, center.dy - radius * 0.36)
      ..cubicTo(
        center.dx - radius * 0.44,
        center.dy - radius * 0.48,
        center.dx - radius * 0.30,
        center.dy - radius * 0.20,
        center.dx - radius * 0.45,
        center.dy - radius * 0.03,
      )
      ..cubicTo(
        center.dx - radius * 0.60,
        center.dy + radius * 0.12,
        center.dx - radius * 0.30,
        center.dy + radius * 0.26,
        center.dx - radius * 0.38,
        center.dy + radius * 0.58,
      );
    canvas.drawPath(europeAfrica, landStroke);
    canvas.drawPath(americas, landStroke);

    final route = Path()
      ..moveTo(center.dx - radius * 0.62, center.dy + radius * 0.22)
      ..quadraticBezierTo(
        center.dx - radius * 0.08,
        center.dy - radius * 0.38,
        center.dx + radius * 0.55,
        center.dy - radius * 0.18,
      );
    final secondRoute = Path()
      ..moveTo(center.dx - radius * 0.12, center.dy + radius * 0.50)
      ..quadraticBezierTo(
        center.dx + radius * 0.22,
        center.dy + radius * 0.18,
        center.dx + radius * 0.68,
        center.dy + radius * 0.26,
      );
    canvas.drawPath(route, routeStroke);
    canvas.drawPath(secondRoute,
        routeStroke..color = AppColors.ink.withValues(alpha: 0.045));
  }

  @override
  bool shouldRepaint(covariant _HeroGlobePainter oldDelegate) => false;
}

class _PillBadge extends StatelessWidget {
  const _PillBadge({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceGlass,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: AppColors.stroke),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppColors.ink3),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: AppColors.ink2,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.query,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final String query;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceGlass,
        borderRadius: BorderRadius.circular(22),
        border:
            Border.all(color: AppColors.strokeStrong.withValues(alpha: 0.72)),
        boxShadow: [
          BoxShadow(
            color: AppColors.ink.withValues(alpha: 0.08),
            blurRadius: 28,
            spreadRadius: -18,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: TextStyle(
            color: AppColors.ink, fontSize: 15, fontWeight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: 'home.search_country'.tr(),
          hintStyle:
              TextStyle(color: AppColors.ink3, fontWeight: FontWeight.w500),
          prefixIcon: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 10, 8),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: AppColors.surfaceHigh.withValues(alpha: 0.82),
                borderRadius: BorderRadius.circular(AppRadii.md),
                border: Border.all(color: AppColors.stroke),
              ),
              child: Icon(Icons.search, color: AppColors.ink2, size: 20),
            ),
          ),
          prefixIconConstraints:
              const BoxConstraints(minWidth: 64, minHeight: 56),
          filled: true,
          fillColor: Colors.transparent,
          contentPadding: const EdgeInsets.symmetric(vertical: 18),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          suffixIcon: query.isNotEmpty
              ? IconButton(
                  icon: Icon(Icons.close, color: AppColors.ink3, size: 18),
                  onPressed: onClear,
                )
              : null,
        ),
      ),
    );
  }
}

class _ScopeChips extends StatelessWidget {
  const _ScopeChips({required this.scope, required this.onChange});
  final _Scope scope;
  final ValueChanged<_Scope> onChange;

  @override
  Widget build(BuildContext context) {
    Widget chip(_Scope s, String label) {
      final selected = scope == s;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChange(s),
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeOut,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: selected
                  ? AppColors.surfaceHigh.withValues(alpha: 0.92)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadii.md),
              border: Border.all(
                color: selected
                    ? AppColors.strokeStrong.withValues(alpha: 0.72)
                    : Colors.transparent,
              ),
            ),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: selected ? AppColors.ink : AppColors.ink3,
                fontWeight: FontWeight.w700,
                fontSize: 12,
                letterSpacing: 0,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceGlass,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.stroke),
      ),
      child: Row(
        children: [
          chip(_Scope.all, 'home.scope_all'.tr()),
          const SizedBox(width: 4),
          chip(_Scope.local, 'home.scope_local'.tr()),
          const SizedBox(width: 4),
          chip(_Scope.regional, 'home.scope_regional'.tr()),
        ],
      ),
    );
  }
}

class _CountryCard extends StatelessWidget {
  const _CountryCard({required this.region});
  final Region region;

  bool get _isRegional =>
      region.locationCode.startsWith('!') || region.locationCode.length != 2;

  @override
  Widget build(BuildContext context) {
    final localizedName = localizedCountryName(
      code: region.locationCode,
      locale: context.locale.languageCode,
      fallback: region.locationName,
    );
    final metaLabel =
        _isRegional ? 'home.regional_esim'.tr() : 'home.local_esim'.tr();
    return SoftCard(
      onTap: () =>
          context.push('/country/${region.locationCode}', extra: localizedName),
      padding: const EdgeInsets.all(14),
      color: AppColors.surfaceGlass,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (_isRegional)
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceHigh,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.stroke),
                  ),
                  child: Icon(Icons.public, color: AppColors.ink2, size: 20),
                )
              else
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.stroke, width: 2),
                  ),
                  child: ClipOval(
                    child: CountryFlag.fromCountryCode(
                      region.locationCode,
                      height: 40,
                      width: 40,
                    ),
                  ),
                ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.surfaceHigh.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  border: Border.all(color: AppColors.stroke),
                ),
                child: Text(
                  _isRegional ? 'REG' : region.locationCode.toUpperCase(),
                  style: TextStyle(
                    color: AppColors.ink3,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.7,
                  ),
                ),
              ),
            ],
          ),
          const Spacer(),
          const SizedBox(height: 10),
          Text(
            localizedName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14,
              color: AppColors.ink,
              height: 1.2,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            metaLabel,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: AppColors.ink3,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  'home.view_plans'.tr(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: AppColors.ink2,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: AppColors.ink.withValues(alpha: 0.06),
                  shape: BoxShape.circle,
                ),
                child:
                    Icon(Icons.arrow_forward, size: 13, color: AppColors.ink2),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
