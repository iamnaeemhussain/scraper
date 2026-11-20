import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../shared/widgets.dart';

class EsimsListScreen extends ConsumerWidget {
  const EsimsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final esimsAsync = ref.watch(myEsimsProvider);
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            PageHeader(
              title: 'esims.title'.tr(),
              subtitle: 'esims.subtitle'.tr(),
            ),
            Expanded(
              child: esimsAsync.when(
                loading: () => const CenteredLoader(),
                error: (e, _) => EmptyState(
                  icon: Icons.cloud_off,
                  title: 'errors.load_failed'.tr(),
                  subtitle: e.toString(),
                  action: AuroraButton(
                    label: 'common.retry'.tr(),
                    onPressed: () => ref.invalidate(myEsimsProvider),
                  ),
                ),
                data: (list) => list.isEmpty
                    ? EmptyState(
                        icon: Icons.sim_card_outlined,
                        title: 'esims.empty'.tr(),
                        subtitle: 'esims.empty_subtitle'.tr(),
                        action: AuroraButton(
                          label: 'esims.browse_plans'.tr(),
                          icon: Icons.arrow_forward,
                          onPressed: () => context.go('/'),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () async => ref.invalidate(myEsimsProvider),
                        color: AppColors.auroraEnd,
                        backgroundColor: AppColors.surface,
                        child: ListView.separated(
                          // Last eSIM card would otherwise sit under the
                          // floating glass nav (extendBody on AppShell).
                          padding: const EdgeInsets.fromLTRB(20, 4, 20, 120),
                          itemCount: list.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 14),
                          itemBuilder: (_, i) => _EsimCard(esim: list[i]),
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EsimCard extends StatelessWidget {
  const _EsimCard({required this.esim});
  final Esim esim;

  ({Color color, String label, IconData icon}) _statusMeta() {
    switch (esim.esimStatus) {
      case 'IN_USE':
        return (
          color: AppColors.success,
          label: 'esim.status.in_use'.tr(),
          icon: Icons.bolt
        );
      case 'USED_UP':
        return (
          color: AppColors.warning,
          label: 'esim.status.used_up'.tr(),
          icon: Icons.error_outline
        );
      case 'USED_EXPIRED':
        return (
          color: AppColors.warning,
          label: 'esim.status.used_expired'.tr(),
          icon: Icons.history
        );
      case 'UNUSED_EXPIRED':
        return (
          color: AppColors.warning,
          label: 'esim.status.unused_expired'.tr(),
          icon: Icons.history
        );
      case 'CANCEL':
      case 'REVOKED':
        return (
          color: AppColors.danger,
          label: 'esim.status.revoked'.tr(),
          icon: Icons.cancel_outlined
        );
      case 'SUSPENDED':
        return (
          color: AppColors.ink3,
          label: 'esim.status.suspended'.tr(),
          icon: Icons.pause_circle_outline
        );
      default:
        return (
          color: AppColors.auroraEnd,
          label: 'esim.status.ready'.tr(),
          icon: Icons.qr_code_2
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final percent = esim.usagePercent;
    final days = esim.daysLeft;
    final meta = _statusMeta();
    final isActive = esim.esimStatus == 'IN_USE';

    return SoftCard(
      onTap: () => context.push('/esims/${esim.id}'),
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          // SIM-card style header with the activation strip on top.
          Container(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppRadii.lg)),
              gradient: isActive
                  ? const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xFF1A2238), Color(0xFF131A2C)],
                    )
                  : null,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: AppGradients.auroraSoft,
                    borderRadius: BorderRadius.circular(AppRadii.sm),
                    border: Border.all(color: AppColors.stroke),
                  ),
                  alignment: Alignment.center,
                  child: const SimChipArtwork(size: 32),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'esims.iccid_short'.tr(args: [
                          esim.iccid.substring(esim.iccid.length - 8)
                        ]),
                        style: TextStyle(
                          color: AppColors.ink,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          fontFamily: 'monospace',
                          letterSpacing: 0.4,
                        ),
                      ),
                      const SizedBox(height: 6),
                      _StatusBadge(
                          color: meta.color,
                          label: meta.label,
                          icon: meta.icon),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: AppColors.ink3),
              ],
            ),
          ),
          Divider(height: 1, color: AppColors.stroke.withValues(alpha: 0.6)),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      '${(percent * 100).toStringAsFixed(0)}%',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'used',
                        style: TextStyle(
                            color: AppColors.ink3,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.2),
                      ),
                    ),
                    const Spacer(),
                    if (days != null) ...[
                      Icon(Icons.schedule,
                          size: 13, color: AppColors.ink3),
                      const SizedBox(width: 4),
                      Text(
                        'esim.days_left'.tr(args: [days.toString()]),
                        style: TextStyle(
                            color: AppColors.ink2,
                            fontSize: 12,
                            fontWeight: FontWeight.w600),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 10),
                UsageBar(
                  value: percent,
                  gradient: percent > 0.85
                      ? const LinearGradient(
                          colors: [AppColors.danger, AppColors.warning])
                      : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge(
      {required this.color, required this.label, required this.icon});
  final Color color;
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        border: Border.all(color: color.withValues(alpha: 0.25)),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.7),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
                color: color, fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
