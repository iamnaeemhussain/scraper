import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../shared/widgets.dart';
import 'install_actions.dart';

class EsimDetailScreen extends ConsumerWidget {
  const EsimDetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(esimByIdProvider(id));
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, size: 18),
            onPressed: () => context.pop(),
          ),
          title: Text('esim.title'.tr()),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(48),
            child: Container(
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: AppColors.stroke)),
              ),
              child: TabBar(
                indicatorColor: AppColors.auroraEnd,
                indicatorWeight: 2,
                indicatorPadding: const EdgeInsets.symmetric(horizontal: 24),
                labelColor: AppColors.ink,
                unselectedLabelColor: AppColors.ink3,
                labelStyle: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    letterSpacing: 0.2),
                unselectedLabelStyle:
                    const TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
                dividerColor: Colors.transparent,
                tabs: [
                  Tab(text: 'esim.tab_install'.tr()),
                  Tab(text: 'esim.tab_usage'.tr()),
                  Tab(text: 'esim.tab_help'.tr()),
                ],
              ),
            ),
          ),
        ),
        body: async.when(
          loading: () => const CenteredLoader(),
          error: (e, _) => EmptyState(
            icon: Icons.cloud_off,
            title: 'errors.load_failed'.tr(),
            subtitle: e.toString(),
          ),
          data: (e) => TabBarView(children: [
            _InstallTab(esim: e),
            _UsageTab(esim: e, esimId: id),
            _HelpTab(esim: e),
          ]),
        ),
      ),
    );
  }
}

// ─── Install ────────────────────────────────────────────────────────────────

class _InstallTab extends StatelessWidget {
  const _InstallTab({required this.esim});
  final Esim esim;

  @override
  Widget build(BuildContext context) {
    final lpa = LpaCode.tryParse(esim.activationCode);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 36),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _QrCard(activationCode: esim.activationCode),
          if (InstallActions.canTryOneTap() && lpa != null) ...[
            const SizedBox(height: 16),
            AuroraButton(
              label: 'esim.install_one_tap'.tr(),
              icon: Icons.bolt,
              onPressed: () => InstallActions.tryOneTap(lpa),
            ),
          ],
          const SizedBox(height: 28),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: SectionLabel('esim.manual_setup'.tr()),
          ),
          const SizedBox(height: 10),
          SoftCard(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                _CopyRow(
                    label: 'esim.smdp_address'.tr(),
                    value: lpa?.smdpAddress ?? '—'),
                Divider(
                    height: 1, color: AppColors.stroke.withValues(alpha: 0.6)),
                _CopyRow(
                    label: 'esim.activation_code'.tr(),
                    value: lpa?.matchingId ?? '—'),
                Divider(
                    height: 1, color: AppColors.stroke.withValues(alpha: 0.6)),
                _CopyRow(
                    label: 'esim.iccid'.tr(), value: esim.iccid, isLast: true),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: SectionLabel('esim.install_steps'.tr()),
          ),
          const SizedBox(height: 10),
          SoftCard(
            child: Column(
              children: [
                _step(1, 'esim.step1'.tr()),
                _step(2, 'esim.step2'.tr()),
                _step(3, 'esim.step3'.tr(), isLast: true),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _step(int n, String text, {bool isLast = false}) {
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              gradient: AppGradients.aurora,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppColors.auroraStart.withValues(alpha: 0.35),
                  blurRadius: 12,
                  spreadRadius: -2,
                ),
              ],
            ),
            alignment: Alignment.center,
            child: Text(
              '$n',
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 13),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                text,
                style: TextStyle(
                    color: AppColors.ink,
                    height: 1.45,
                    fontSize: 14,
                    fontWeight: FontWeight.w500),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QrCard extends StatelessWidget {
  const _QrCard({required this.activationCode});
  final String activationCode;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.stroke),
        boxShadow: [
          BoxShadow(
            color: AppColors.auroraStart.withValues(alpha: 0.2),
            blurRadius: 40,
            spreadRadius: -10,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: Stack(
          children: [
            const Positioned.fill(
                child: DecoratedBox(
                    decoration:
                        BoxDecoration(gradient: AppGradients.heroGlow))),
            const Positioned.fill(child: SignalLineBackground()),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
              child: Column(
                children: [
                  Row(
                    children: [
                      const SimChipArtwork(size: 30),
                      const SizedBox(width: 8),
                      Text(
                        'esim.scan_qr'.tr(),
                        style: TextStyle(
                          color: AppColors.ink,
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                          letterSpacing: 0,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                          border: Border.all(
                              color: AppColors.success.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                  color: AppColors.success,
                                  shape: BoxShape.circle),
                            ),
                            const SizedBox(width: 5),
                            Text(
                              'esim.status.ready'.tr(),
                              style: const TextStyle(
                                color: AppColors.success,
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.4,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'esim.scan_qr_hint'.tr(),
                    style: TextStyle(
                        color: AppColors.ink2, fontSize: 13, height: 1.45),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 22),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(AppRadii.md),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.auroraEnd.withValues(alpha: 0.35),
                          blurRadius: 32,
                          spreadRadius: -6,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: QrImageView(
                      data: activationCode,
                      size: 220,
                      version: QrVersions.auto,
                      eyeStyle: QrEyeStyle(
                        eyeShape: QrEyeShape.square,
                        color: AppColors.inkInverse,
                      ),
                      dataModuleStyle: QrDataModuleStyle(
                        dataModuleShape: QrDataModuleShape.square,
                        color: AppColors.inkInverse,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CopyRow extends StatelessWidget {
  const _CopyRow(
      {required this.label, required this.value, this.isLast = false});
  final String label;
  final String value;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: TextStyle(
                  color: AppColors.ink3,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.4),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 13,
                color: AppColors.ink,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          InkWell(
            onTap: () async {
              await InstallActions.copy(value);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('common.copied'.tr()),
                    duration: const Duration(seconds: 1),
                  ),
                );
              }
            },
            borderRadius: BorderRadius.circular(8),
            child: const Padding(
              padding: EdgeInsets.all(6),
              child: Icon(Icons.copy_rounded,
                  size: 18, color: AppColors.auroraEnd),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Usage ─────────────────────────────────────────────────────────────────

class _UsageTab extends StatelessWidget {
  const _UsageTab({required this.esim, required this.esimId});
  final Esim esim;
  final String esimId;

  @override
  Widget build(BuildContext context) {
    final percent = esim.usagePercent;
    final daysLeft = esim.daysLeft;
    final showTopUp =
        esim.esimStatus == 'IN_USE' || esim.esimStatus == 'USED_UP';
    final usedLabel = _humanBytes(esim.orderUsage);
    final totalLabel = _humanBytes(esim.totalVolume);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 36),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
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
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.lg),
              child: Stack(
                children: [
                  const Positioned.fill(
                      child: DecoratedBox(
                          decoration:
                              BoxDecoration(gradient: AppGradients.heroGlow))),
                  const Positioned.fill(child: SignalLineBackground()),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 26, 20, 26),
                    child: Column(
                      children: [
                        CircularMeter(
                          value: percent,
                          label: '${(percent * 100).toStringAsFixed(0)}%',
                          caption: 'esim.data_usage'.tr(),
                        ),
                        const SizedBox(height: 18),
                        Text.rich(
                          TextSpan(
                            style: TextStyle(
                                color: AppColors.ink,
                                fontWeight: FontWeight.w800),
                            children: [
                              TextSpan(
                                text: usedLabel,
                                style: const TextStyle(
                                    fontSize: 22, letterSpacing: 0),
                              ),
                              TextSpan(
                                text: '  /  $totalLabel',
                                style: TextStyle(
                                  color: AppColors.ink2,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  icon: Icons.schedule,
                  label: 'esim.validity'.tr(),
                  value: daysLeft != null
                      ? 'esim.days_left'.tr(args: [daysLeft.toString()])
                      : 'esim.no_expiry'.tr(),
                  iconColor: AppColors.warning,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatTile(
                  icon: Icons.download_outlined,
                  label: 'esim.used'.tr(),
                  value: usedLabel,
                  iconColor: AppColors.auroraEnd,
                ),
              ),
            ],
          ),
          if (showTopUp) ...[
            const SizedBox(height: 24),
            AuroraButton(
              label: 'esim.topup_cta'.tr(),
              icon: Icons.add_circle_outline,
              onPressed: () => context.push('/esims/$esimId/topup'),
            ),
          ],
        ],
      ),
    );
  }

  static String _humanBytes(BigInt b) {
    final v = b.toDouble();
    if (v >= 1 << 30) return '${(v / (1 << 30)).toStringAsFixed(2)} GB';
    if (v >= 1 << 20) return '${(v / (1 << 20)).toStringAsFixed(0)} MB';
    if (v >= 1 << 10) return '${(v / (1 << 10)).toStringAsFixed(0)} KB';
    return '$b B';
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.iconColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(AppRadii.sm),
            ),
            child: Icon(icon, color: iconColor, size: 18),
          ),
          const SizedBox(height: 14),
          Text(
            label,
            style: TextStyle(
                color: AppColors.ink3,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w800,
                fontSize: 16,
                letterSpacing: 0),
          ),
        ],
      ),
    );
  }
}

// ─── Help ──────────────────────────────────────────────────────────────────

class _HelpTab extends StatelessWidget {
  const _HelpTab({required this.esim});
  final Esim esim;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 36),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _helpCard(
            icon: Icons.wifi,
            iconColor: AppColors.success,
            title: 'esim.help_after_install'.tr(),
            body: 'esim.help_data_roaming'.tr(),
          ),
          if (esim.apn != null && esim.apn!.isNotEmpty) ...[
            const SizedBox(height: 12),
            _helpCard(
              icon: Icons.settings_input_antenna,
              iconColor: AppColors.auroraEnd,
              title: 'esim.apn'.tr(),
              body: esim.apn!,
              selectable: true,
            ),
          ],
          const SizedBox(height: 12),
          _helpCard(
            icon: Icons.help_outline,
            iconColor: AppColors.warning,
            title: 'esim.help_troubleshoot'.tr(),
            body: 'esim.help_troubleshoot_body'.tr(),
          ),
        ],
      ),
    );
  }

  Widget _helpCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String body,
    bool selectable = false,
  }) {
    return SoftCard(
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(AppRadii.sm),
              border: Border.all(color: iconColor.withValues(alpha: 0.20)),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 6),
                if (selectable)
                  SelectableText(
                    body,
                    style: TextStyle(
                        color: AppColors.ink2, fontSize: 13, height: 1.5),
                  )
                else
                  Text(
                    body,
                    style: TextStyle(
                        color: AppColors.ink2, fontSize: 13, height: 1.5),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
