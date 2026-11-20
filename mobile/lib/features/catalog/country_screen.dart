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

/// Sort options for the plan list. Each option has a sensible default
/// direction baked in (you want cheapest first, but most data first).
enum _SortBy { priceAsc, volumeDesc, durationDesc }

class CountryScreen extends ConsumerStatefulWidget {
  const CountryScreen({super.key, required this.code, this.name});
  final String code;
  final String? name;

  @override
  ConsumerState<CountryScreen> createState() => _CountryScreenState();
}

class _CountryScreenState extends ConsumerState<CountryScreen> {
  _SortBy _sortBy = _SortBy.priceAsc;
  // null = "all", any value = exact-match against the package field.
  int? _filterDuration;
  int? _filterVolumeBytes;

  bool get _isRegional =>
      widget.code.startsWith('!') || widget.code.length != 2;

  bool _matchesFilters(PackageItem p) {
    if (_filterDuration != null && p.duration != _filterDuration) return false;
    if (_filterVolumeBytes != null) {
      // `-1` is the sentinel for the "unlimited" chip; any other value is an
      // exact byte match against the package's volume.
      if (_filterVolumeBytes == -1) {
        if (!p.unlimited) return false;
      } else if (p.volumeBytes != _filterVolumeBytes) {
        return false;
      }
    }
    return true;
  }

  bool get _hasActiveFilter =>
      _filterDuration != null || _filterVolumeBytes != null;

  void _clearFilters() {
    setState(() {
      _filterDuration = null;
      _filterVolumeBytes = null;
    });
  }

  List<PackageItem> _processed(List<PackageItem> input) {
    final out = input.where(_matchesFilters).toList();
    switch (_sortBy) {
      case _SortBy.priceAsc:
        out.sort((a, b) => a.price.compareTo(b.price));
      case _SortBy.volumeDesc:
        // volumeSortKey maps unlimited (`-1`) → huge so it lands at the top.
        out.sort((a, b) => b.volumeSortKey.compareTo(a.volumeSortKey));
      case _SortBy.durationDesc:
        out.sort((a, b) => b.duration.compareTo(a.duration));
    }
    return out;
  }

  /// Distinct durations present in the result set, ordered ascending.
  /// Returns null when there's nothing meaningful to filter on (≤ 1 value).
  List<int>? _distinctDurations(List<PackageItem> input) {
    final set = <int>{for (final p in input) p.duration};
    if (set.length < 2) return null;
    return set.toList()..sort();
  }

  /// Distinct data volumes from the result set, ordered as the filter chips
  /// should render them: byte buckets ascending, then `-1` (Unlimited) last
  /// when any unlimited rows exist. The `-1` sentinel is intercepted by
  /// [_matchesFilters].
  List<int>? _distinctVolumes(List<PackageItem> input) {
    final bytes = <int>{
      for (final p in input)
        if (!p.unlimited && p.volumeBytes > 0) p.volumeBytes,
    };
    final hasUnlimited = input.any((p) => p.unlimited);
    if (bytes.length < 2 && !hasUnlimited) return null;
    final sorted = bytes.toList()..sort();
    if (hasUnlimited) sorted.add(-1);
    return sorted;
  }

  int get _activeFilterCount {
    var n = 0;
    if (_filterDuration != null) n++;
    if (_filterVolumeBytes != null) n++;
    return n;
  }

  String _sortLabel(_SortBy s) {
    switch (s) {
      case _SortBy.priceAsc:
        return 'catalog.sort_price'.tr();
      case _SortBy.volumeDesc:
        return 'catalog.sort_data'.tr();
      case _SortBy.durationDesc:
        return 'catalog.sort_duration'.tr();
    }
  }

  Future<void> _openFilterSheet(List<PackageItem> all) async {
    final durations = _distinctDurations(all);
    final volumes = _distinctVolumes(all);
    if (durations == null && volumes == null) return;

    final unit = all.isNotEmpty ? all.first.durationUnit : 'DAY';
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (sheetCtx) => SafeArea(
        top: false,
        child: _FilterSheetBody(
          durations: durations,
          volumes: volumes,
          initialDuration: _filterDuration,
          initialVolume: _filterVolumeBytes,
          durationUnit: unit,
          onChange: (d, v) {
            setState(() {
              _filterDuration = d;
              _filterVolumeBytes = v;
            });
          },
          onClear: _clearFilters,
        ),
      ),
    );
  }

  Future<void> _openSortSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
      ),
      builder: (sheetCtx) => _SortSheet(
        current: _sortBy,
        onSelect: (s) {
          setState(() => _sortBy = s);
          Navigator.pop(sheetCtx);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final packages = ref.watch(packagesByCountryProvider(widget.code));
    final displayName = localizedCountryName(
      code: widget.code,
      locale: context.locale.languageCode,
      fallback: widget.name ?? widget.code,
    );

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text(displayName, overflow: TextOverflow.ellipsis),
      ),
      body: packages.when(
        loading: () => const CenteredLoader(),
        error: (e, _) => EmptyState(
          icon: Icons.cloud_off,
          title: 'errors.load_failed'.tr(),
          subtitle: e.toString(),
        ),
        data: (list) => _body(context, list),
      ),
    );
  }

  Widget _body(BuildContext context, List<PackageItem> list) {
    final bottomPadding = MediaQuery.of(context).padding.bottom + 128;
    final minPrice = list.isEmpty
        ? null
        : list.map((p) => p.priceUsd).reduce((a, b) => a < b ? a : b);
    final processed = _processed(list);
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: _CountryHero(
            code: widget.code,
            name: localizedCountryName(
              code: widget.code,
              locale: context.locale.languageCode,
              fallback: widget.name ?? widget.code,
            ),
            isRegional: _isRegional,
            planCount: list.length,
            minPrice: minPrice,
          ),
        ),
        if (list.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
                icon: Icons.inbox_outlined, title: 'catalog.no_packages'.tr()),
          )
        else ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: _Toolbar(
                activeFilterCount: _activeFilterCount,
                sortLabel: _sortLabel(_sortBy),
                onFilter: () => _openFilterSheet(list),
                onSort: _openSortSheet,
              ),
            ),
          ),
          if (processed.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(
                icon: Icons.filter_alt_off,
                title: 'catalog.no_matches'.tr(),
                subtitle: 'catalog.no_matches_hint'.tr(),
                action: GhostButton(
                  label: 'catalog.clear_filter'.tr(),
                  onPressed: _clearFilters,
                ),
              ),
            )
          else
            SliverPadding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, bottomPadding),
              sliver: SliverList.separated(
                itemCount: processed.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, i) => _PlanCard(
                  pkg: processed[i],
                  featured: i == 0 && processed.length > 1,
                ),
              ),
            ),
        ],
      ],
    );
  }
}

/// Compact toolbar above the plan list — left filter button (with active
/// count), right sort button (showing current sort). Both open bottom sheets.
class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.activeFilterCount,
    required this.sortLabel,
    required this.onFilter,
    required this.onSort,
  });

  final int activeFilterCount;
  final String sortLabel;
  final VoidCallback onFilter;
  final VoidCallback onSort;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _ToolbarButton(
          icon: Icons.tune,
          label: 'catalog.filter'.tr(),
          badge: activeFilterCount > 0 ? '$activeFilterCount' : null,
          onTap: onFilter,
        ),
        const Spacer(),
        _ToolbarButton(
          icon: Icons.sort,
          label: '${'catalog.sort_by'.tr()}: $sortLabel',
          onTap: onSort,
        ),
      ],
    );
  }
}

class _ToolbarButton extends StatelessWidget {
  const _ToolbarButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final hasBadge = badge != null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(
              color: hasBadge ? AppColors.auroraEnd : AppColors.stroke,
              width: hasBadge ? 1.2 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: AppColors.ink),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  letterSpacing: 0.1,
                ),
              ),
              if (hasBadge) ...[
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(
                    gradient: AppGradients.aurora,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: Text(
                    badge!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
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

/// Human-friendly volume label from bytes. "500 MB" / "1 GB" / "1.5 GB".
/// `-1` is the sentinel for "Unlimited" — yields the localized label.
String _humanVolume(int bytes) {
  if (bytes < 0) return 'catalog.unlimited'.tr();
  final gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return gb == gb.roundToDouble()
        ? '${gb.toInt()} GB'
        : '${gb.toStringAsFixed(1)} GB';
  }
  final mb = bytes / (1024 * 1024);
  return '${mb.toInt()} MB';
}

// ─── Bottom sheets ────────────────────────────────────────────────────────

/// Top drag handle shared by both sheets.
class _SheetGrip extends StatelessWidget {
  const _SheetGrip();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 6),
      child: Container(
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: AppColors.strokeStrong,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _FilterSheetBody extends StatefulWidget {
  const _FilterSheetBody({
    required this.durations,
    required this.volumes,
    required this.initialDuration,
    required this.initialVolume,
    required this.durationUnit,
    required this.onChange,
    required this.onClear,
  });

  final List<int>? durations;
  final List<int>? volumes;
  final int? initialDuration;
  final int? initialVolume;
  final String durationUnit;
  final void Function(int? duration, int? volume) onChange;
  final VoidCallback onClear;

  @override
  State<_FilterSheetBody> createState() => _FilterSheetBodyState();
}

class _FilterSheetBodyState extends State<_FilterSheetBody> {
  late int? _duration = widget.initialDuration;
  late int? _volume = widget.initialVolume;

  void _apply() {
    widget.onChange(_duration, _volume);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Align(alignment: Alignment.center, child: _SheetGrip()),
          Padding(
            padding: const EdgeInsets.only(top: 6, bottom: 18),
            child: Row(
              children: [
                Icon(Icons.tune, size: 18, color: AppColors.ink),
                const SizedBox(width: 8),
                Text(
                  'catalog.filter'.tr(),
                  style: TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                    letterSpacing: -0.3,
                  ),
                ),
                const Spacer(),
                if (_duration != null || _volume != null)
                  TextButton(
                    onPressed: () {
                      setState(() {
                        _duration = null;
                        _volume = null;
                      });
                      widget.onClear();
                    },
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.ink2,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                    child: Text('catalog.clear_filter'.tr()),
                  ),
              ],
            ),
          ),
          if (widget.durations != null) ...[
            _SheetSectionLabel(label: 'catalog.filter_duration'.tr()),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _SheetChip(
                  selected: _duration == null,
                  label: 'catalog.filter_all'.tr(),
                  onTap: () {
                    setState(() => _duration = null);
                    _apply();
                  },
                ),
                for (final d in widget.durations!)
                  _SheetChip(
                    selected: _duration == d,
                    label: formatDuration(
                      d,
                      widget.durationUnit,
                      context.locale.languageCode,
                    ),
                    onTap: () {
                      setState(() => _duration = d);
                      _apply();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 22),
          ],
          if (widget.volumes != null) ...[
            _SheetSectionLabel(label: 'catalog.filter_volume'.tr()),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _SheetChip(
                  selected: _volume == null,
                  label: 'catalog.filter_all'.tr(),
                  onTap: () {
                    setState(() => _volume = null);
                    _apply();
                  },
                ),
                for (final v in widget.volumes!)
                  _SheetChip(
                    selected: _volume == v,
                    label: _humanVolume(v),
                    onTap: () {
                      setState(() => _volume = v);
                      _apply();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 14),
          ],
          const SizedBox(height: 4),
          AuroraButton(
            label: 'common.done'.tr(),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }
}

class _SheetSectionLabel extends StatelessWidget {
  const _SheetSectionLabel({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: TextStyle(
        color: AppColors.ink3,
        fontWeight: FontWeight.w700,
        fontSize: 11,
        letterSpacing: 1.0,
      ),
    );
  }
}

class _SheetChip extends StatelessWidget {
  const _SheetChip({
    required this.selected,
    required this.label,
    required this.onTap,
  });

  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? AppColors.ink : AppColors.surfaceHigh,
          borderRadius: BorderRadius.circular(AppRadii.pill),
          border: Border.all(
            color: selected ? AppColors.ink : AppColors.stroke,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AppColors.inkInverse : AppColors.ink,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

class _SortSheet extends StatelessWidget {
  const _SortSheet({required this.current, required this.onSelect});
  final _SortBy current;
  final ValueChanged<_SortBy> onSelect;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, 0, 0, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _SheetGrip(),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 14),
              child: Row(
                children: [
                  Icon(Icons.sort, size: 18, color: AppColors.ink),
                  const SizedBox(width: 8),
                  Text(
                    'catalog.sort_by'.tr(),
                    style: TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                      letterSpacing: -0.3,
                    ),
                  ),
                ],
              ),
            ),
            _SortRow(
              icon: Icons.attach_money,
              label: 'catalog.sort_price'.tr(),
              hint: 'catalog.sort_price_hint'.tr(),
              selected: current == _SortBy.priceAsc,
              onTap: () => onSelect(_SortBy.priceAsc),
            ),
            _SortRow(
              icon: Icons.cloud_outlined,
              label: 'catalog.sort_data'.tr(),
              hint: 'catalog.sort_data_hint'.tr(),
              selected: current == _SortBy.volumeDesc,
              onTap: () => onSelect(_SortBy.volumeDesc),
            ),
            _SortRow(
              icon: Icons.schedule,
              label: 'catalog.sort_duration'.tr(),
              hint: 'catalog.sort_duration_hint'.tr(),
              selected: current == _SortBy.durationDesc,
              onTap: () => onSelect(_SortBy.durationDesc),
            ),
          ],
        ),
      ),
    );
  }
}

class _SortRow extends StatelessWidget {
  const _SortRow({
    required this.icon,
    required this.label,
    required this.hint,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String hint;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: selected ? AppGradients.aurora : null,
                  color: selected ? null : AppColors.surfaceHigh,
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                  border: Border.all(
                    color: selected ? Colors.transparent : AppColors.stroke,
                  ),
                ),
                child: Icon(
                  icon,
                  color: selected ? Colors.white : AppColors.ink2,
                  size: 18,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: AppColors.ink,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      hint,
                      style: TextStyle(
                        color: AppColors.ink3,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                const Icon(Icons.check_circle,
                    color: AppColors.auroraEnd, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _CountryHero extends StatelessWidget {
  const _CountryHero({
    required this.code,
    required this.name,
    required this.isRegional,
    required this.planCount,
    required this.minPrice,
  });

  final String code;
  final String name;
  final bool isRegional;
  final int planCount;
  final double? minPrice;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 18),
      child: SoftCard(
        color: AppColors.surfaceGlass,
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (isRegional)
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.surfaceHigh,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.stroke),
                ),
                child: Icon(Icons.public, color: AppColors.ink2, size: 26),
              )
            else
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.stroke, width: 2),
                ),
                child: ClipOval(
                  child:
                      CountryFlag.fromCountryCode(code, height: 52, width: 52),
                ),
              ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 20,
                      letterSpacing: 0,
                      height: 1.15,
                    ),
                  ),
                  if (planCount > 0) ...[
                    const SizedBox(height: 5),
                    Text(
                      'catalog.plans_count'.tr(args: ['$planCount']),
                      style: TextStyle(
                        color: AppColors.ink2,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (planCount > 0 && minPrice != null) ...[
              const SizedBox(width: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.surfaceHigh.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  border: Border.all(color: AppColors.stroke),
                ),
                child: Text(
                  'catalog.from_price'.tr(args: [formatPriceUsd(minPrice!)]),
                  style: TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.pkg, this.featured = false});
  final PackageItem pkg;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        SoftCard(
          onTap: () => context.push('/package/${pkg.slug}'),
          padding: const EdgeInsets.fromLTRB(18, 16, 16, 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Wrap(
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    if (pkg.unlimited)
                      Text(
                        'catalog.unlimited'.tr(),
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                          height: 1.0,
                          color: AppColors.ink,
                        ),
                      ),
                    if (pkg.unlimited && pkg.isPlus)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceHigh,
                          borderRadius: BorderRadius.circular(AppRadii.sm),
                          border: Border.all(color: AppColors.stroke),
                        ),
                        child: Text(
                          'PLUS',
                          style: TextStyle(
                            color: AppColors.ink2,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                    if (!pkg.unlimited)
                      Text(
                        pkg.volumeLabel,
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                          height: 1.0,
                          color: AppColors.ink,
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        '· ${formatDuration(pkg.duration, pkg.durationUnit, context.locale.languageCode)}',
                        style: TextStyle(
                          color: AppColors.ink2,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surfaceHigh,
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                  border: Border.all(color: AppColors.stroke),
                ),
                child: Text(
                  formatPriceUsd(pkg.priceUsd),
                  style: TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    letterSpacing: 0,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (featured)
          Positioned(
            top: -1,
            right: 14,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.surfaceHigh,
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(6),
                  bottomRight: Radius.circular(6),
                ),
                border: Border(
                  left: BorderSide(color: AppColors.stroke),
                  right: BorderSide(color: AppColors.stroke),
                  bottom: BorderSide(color: AppColors.stroke),
                ),
              ),
              child: Text(
                'BEST',
                style: TextStyle(
                  color: AppColors.ink3,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
// ─── Helpers ──────────────────────────────────────────────────────────────

/// "/Day" in the name is the provider's marker for daily-quota plans: the
/// user gets a fresh allowance each day but is throttled to FUP speed once
/// the day's quota is consumed. dataType also encodes this but isn't
/// reliably set in the catalog feed.
bool _isDaily(PackageItem p) => p.name.contains('/Day') || p.dataType == 2;

/// Surfaces the FUP throttle speed for plans that have one. Prefers the
/// dedicated `fupPolicy` field (most reliable), falling back to parsing the
/// name (e.g. "Turkey 1GB/Day FUP1Mbps").
String? _extractFup(PackageItem p) {
  final policy = p.fupPolicy?.trim();
  if (policy != null && policy.isNotEmpty) {
    // Take just the speed cap, dropping any prose around it.
    final m = RegExp(r'(\d+\.?\d*\s*[KMGkmg]?bps)').firstMatch(policy);
    return (m?.group(1) ?? policy).replaceAll(' ', '');
  }
  final m = RegExp(r'FUP\s*([\d.]+\s*[KMGkmg]?bps)', caseSensitive: false)
      .firstMatch(p.name);
  return m?.group(1)?.replaceAll(' ', '');
}

/// Produces a short locale-aware subtitle that complements the chip row.
String _cleanPackageName(PackageItem pkg) {
  final fup = _extractFup(pkg);
  if (pkg.unlimited) {
    if (pkg.isPlus) {
      return fup != null
          ? 'catalog.subtitle_unlimited_plus_fup'.tr(args: [fup])
          : 'catalog.subtitle_unlimited_plus'.tr();
    }
    return fup != null
        ? 'catalog.subtitle_unlimited_fup'.tr(args: [fup])
        : 'catalog.subtitle_unlimited'.tr();
  }
  final daily = _isDaily(pkg);
  if (daily && fup != null) {
    return 'catalog.subtitle_daily_fup'.tr(args: [fup]);
  }
  if (fup != null) return 'catalog.subtitle_fup'.tr(args: [fup]);
  if (daily) return 'catalog.subtitle_daily'.tr();
  return 'catalog.subtitle_total'.tr();
}
