import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/format.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../shared/widgets.dart';
import '../checkout/dpay_service.dart';

class TopUpScreen extends ConsumerStatefulWidget {
  const TopUpScreen({super.key, required this.esimId});
  final String esimId;

  @override
  ConsumerState<TopUpScreen> createState() => _TopUpScreenState();
}

class _TopUpScreenState extends ConsumerState<TopUpScreen> {
  String? _busySlug;

  Future<void> _buy(PackageItem pkg) async {
    setState(() => _busySlug = pkg.slug);
    try {
      final created =
          await ref.read(esimsRepoProvider).orderTopUp(widget.esimId, pkg.slug);
      await DpayPaymentService().present(order: created);
      if (!mounted) return;
      ref.invalidate(esimByIdProvider(widget.esimId));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complete DPay payment to finish reload')),
      );
      context.go('/esims/${widget.esimId}');
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('topup.failed'.tr())),
      );
    } finally {
      if (mounted) setState(() => _busySlug = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final topups = ref.watch(esimTopUpsProvider(widget.esimId));
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18),
          onPressed: () => context.pop(),
        ),
        title: Text('topup.title'.tr()),
      ),
      body: topups.when(
        loading: () => const CenteredLoader(),
        error: (e, _) => EmptyState(
            icon: Icons.cloud_off,
            title: 'errors.load_failed'.tr(),
            subtitle: e.toString()),
        data: (list) => list.isEmpty
            ? EmptyState(
                icon: Icons.inbox_outlined, title: 'topup.no_plans'.tr())
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (_, i) => _row(list[i]),
              ),
      ),
    );
  }

  Widget _row(PackageItem p) {
    final busy = _busySlug == p.slug;
    return SoftCard(
      onTap: _busySlug != null ? null : () => _buy(p),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  style: TextStyle(
                    color: AppColors.ink,
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${p.volumeLabel} • ${formatDuration(p.duration, p.durationUnit, 'en')}',
                  style: TextStyle(color: AppColors.ink2, fontSize: 12),
                ),
              ],
            ),
          ),
          if (busy)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.2),
            )
          else
            Text(
              formatPricePkr(p.pricePkr),
              style: TextStyle(
                  color: AppColors.auroraEnd,
                  fontWeight: FontWeight.w800,
                  fontSize: 16),
            ),
        ],
      ),
    );
  }
}
