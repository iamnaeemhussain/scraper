import 'dart:async';

import 'package:country_flags/country_flags.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/country_names.dart';
import '../../data/format.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../shared/widgets.dart';

class PackageDetailScreen extends ConsumerWidget {
  const PackageDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pkgAsync = ref.watch(packageBySlugProvider(slug));
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text('catalog.package'.tr()),
      ),
      body: pkgAsync.when(
        loading: () => const CenteredLoader(),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off,
          title: 'errors.load_failed'.tr(),
          subtitle: e.toString(),
        ),
        data: (p) => _body(context, p),
      ),
    );
  }

  Widget _body(BuildContext context, PackageItem p) {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _HeroCard(pkg: p),
                const SizedBox(height: 24),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: SectionLabel('catalog.details'.tr()),
                ),
                const SizedBox(height: 10),
                SoftCard(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    children: [
                      if (p.speed != null)
                        _DetailRow(
                            icon: Icons.speed,
                            label: 'catalog.speed'.tr(),
                            value: p.speed!),
                      _DetailRow(
                        icon: Icons.public,
                        label: 'catalog.coverage'.tr(),
                        value: _coverageLabel(p.location),
                        isLast: p.fupPolicy == null,
                      ),
                      if (p.fupPolicy != null)
                        _DetailRow(
                          icon: Icons.info_outline,
                          label: 'catalog.fup'.tr(),
                          value: p.fupPolicy!,
                          isLast: true,
                        ),
                    ],
                  ),
                ),
                if (p.location.contains(',')) ...[
                  const SizedBox(height: 24),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: SectionLabel('catalog.countries'.tr()),
                  ),
                  const SizedBox(height: 10),
                  _CoverageGrid(
                      codes:
                          p.location.split(',').map((s) => s.trim()).toList()),
                ],
                if (p.description.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: SectionLabel('catalog.about'.tr()),
                  ),
                  const SizedBox(height: 10),
                  SoftCard(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      p.description,
                      style: TextStyle(
                          color: AppColors.ink2, height: 1.6, fontSize: 14),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                _Reassurance(),
              ],
            ),
          ),
        ),
        _StickyCta(pkg: p),
      ],
    );
  }

  String _coverageLabel(String raw) {
    if (raw.isEmpty) return '—';
    final codes = raw.split(',').map((s) => s.trim()).toList();
    if (codes.length <= 3) return codes.join(', ');
    return '${codes.take(3).join(', ')} +${codes.length - 3}';
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.pkg});
  final PackageItem pkg;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.stroke),
        boxShadow: [
          BoxShadow(
            color: AppColors.auroraStart.withValues(alpha: 0.18),
            blurRadius: 40,
            spreadRadius: -10,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.lg),
              child: const DecoratedBox(
                  decoration: BoxDecoration(gradient: AppGradients.heroGlow)),
            ),
          ),
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.lg),
              child: const SignalLineBackground(opacity: 0.12),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: AppColors.surfaceHigh,
                        borderRadius: BorderRadius.circular(AppRadii.sm),
                        border: Border.all(color: AppColors.stroke),
                      ),
                      child: Icon(
                        Icons.sim_card_outlined,
                        size: 18,
                        color: AppColors.ink2,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        pkg.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: AppColors.ink,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          height: 1.3,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    GradientText(
                      pkg.volumeLabel,
                      style: const TextStyle(
                        fontSize: 44,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                        height: 1.0,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '/ ${formatDurationShort(pkg.duration, pkg.durationUnit, context.locale.languageCode)}',
                        style: TextStyle(
                          color: AppColors.ink2,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    _Stat(
                      icon: Icons.cloud_outlined,
                      label: 'catalog.data'.tr(),
                      value: pkg.volumeLabel,
                    ),
                    Container(width: 1, height: 36, color: AppColors.stroke),
                    _Stat(
                      icon: Icons.schedule,
                      label: 'catalog.duration'.tr(),
                      value: formatDuration(
                        pkg.duration,
                        pkg.durationUnit,
                        context.locale.languageCode,
                      ),
                    ),
                    if (pkg.speed != null) ...[
                      Container(width: 1, height: 36, color: AppColors.stroke),
                      _Stat(
                        icon: Icons.bolt,
                        label: 'catalog.speed'.tr(),
                        value: pkg.speed!,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppColors.auroraEnd, size: 16),
            const SizedBox(height: 6),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w800,
                fontSize: 14,
                height: 1.1,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: AppColors.ink3,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.isLast = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        border: Border(
          bottom:
              BorderSide(color: isLast ? Colors.transparent : AppColors.stroke),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              gradient: AppGradients.auroraSoft,
              borderRadius: BorderRadius.circular(AppRadii.sm),
              border: Border.all(color: AppColors.stroke),
            ),
            child: Icon(icon, size: 15, color: AppColors.auroraEnd),
          ),
          const SizedBox(width: 12),
          SizedBox(
            width: 88,
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(label,
                  style: TextStyle(
                      color: AppColors.ink3,
                      fontSize: 12,
                      fontWeight: FontWeight.w600)),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                value,
                style: TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    height: 1.4),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CoverageGrid extends StatelessWidget {
  const _CoverageGrid({required this.codes});
  final List<String> codes;

  @override
  Widget build(BuildContext context) {
    final visibleCodes = codes.where((c) => c.length == 2).take(40).toList();
    return SoftCard(
      padding: const EdgeInsets.all(16),
      child: SizedBox(
        width: double.infinity,
        child: Wrap(
          alignment: WrapAlignment.center,
          runAlignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 10,
          children: visibleCodes.map((c) => _CoverageFlag(code: c)).toList(),
        ),
      ),
    );
  }
}

class _CoverageFlag extends StatefulWidget {
  const _CoverageFlag({required this.code});
  final String code;

  @override
  State<_CoverageFlag> createState() => _CoverageFlagState();
}

class _CoverageFlagState extends State<_CoverageFlag> {
  bool _selected = false;
  Timer? _hideTimer;

  @override
  void dispose() {
    _hideTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final name = localizedCountryName(
      code: widget.code,
      locale: context.locale.languageCode,
      fallback: widget.code,
    );
    return Tooltip(
      message: name,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {
          _hideTimer?.cancel();
          setState(() => _selected = true);
          _hideTimer = Timer(const Duration(milliseconds: 1600), () {
            if (mounted) setState(() => _selected = false);
          });
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          constraints: const BoxConstraints(minWidth: 38),
          padding: EdgeInsets.fromLTRB(2, 2, 2, _selected ? 6 : 2),
          decoration: BoxDecoration(
            color: _selected
                ? AppColors.surfaceHigh.withValues(alpha: 0.70)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadii.sm),
            border: _selected ? Border.all(color: AppColors.stroke) : null,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 34,
                height: 34,
                padding: const EdgeInsets.all(1),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.stroke),
                ),
                child: ClipOval(
                  child: CountryFlag.fromCountryCode(
                    widget.code,
                    height: 32,
                    width: 32,
                  ),
                ),
              ),
              if (_selected) ...[
                const SizedBox(height: 5),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 96),
                  child: Text(
                    name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.ink,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      height: 1.15,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Reassurance extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    Widget item(IconData icon, String text) {
      return Expanded(
        child: Column(
          children: [
            Icon(icon, color: AppColors.auroraEnd, size: 18),
            const SizedBox(height: 6),
            Text(
              text,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.ink2,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                height: 1.35,
              ),
            ),
          ],
        ),
      );
    }

    return SoftCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 18),
      child: Row(
        children: [
          item(Icons.bolt, 'catalog.reassure_instant'.tr()),
          item(Icons.shield_outlined, 'catalog.reassure_safe'.tr()),
          item(Icons.support_agent, 'catalog.reassure_support'.tr()),
        ],
      ),
    );
  }
}

class _StickyCta extends StatelessWidget {
  const _StickyCta({required this.pkg});
  final PackageItem pkg;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        border: Border(top: BorderSide(color: AppColors.stroke)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 14),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'catalog.total'.tr(),
                    style: TextStyle(
                      color: AppColors.ink3,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    formatPriceUsd(pkg.priceUsd),
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 28,
                      color: AppColors.ink,
                      letterSpacing: 0,
                      height: 1.0,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 16),
              Expanded(
                child: AuroraButton(
                  label: 'catalog.buy_now'.tr(),
                  icon: Icons.arrow_forward,
                  onPressed: () => context.push('/checkout/${pkg.slug}'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
