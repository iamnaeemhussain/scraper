import 'dart:async';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../shared/widgets.dart';
import 'dpay_service.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

enum _Phase { paying, waiting, ready, failed }

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  _Phase _phase = _Phase.paying;
  String? _errorDetail;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  Future<void> _run() async {
    final orders = ref.read(ordersRepoProvider);
    OrderCreatedResponse created;
    try {
      created = await orders.create(slug: widget.slug);
    } catch (_) {
      setState(() {
        _phase = _Phase.failed;
        _errorDetail = 'checkout.create_failed'.tr();
      });
      return;
    }

    try {
      await DpayPaymentService().present(order: created);
    } catch (e) {
      setState(() {
        _phase = _Phase.failed;
        _errorDetail = e.toString();
      });
      return;
    }

    setState(() => _phase = _Phase.waiting);
    await _pollUntilReady(created.orderId);
  }

  Future<void> _pollUntilReady(String orderId) async {
    final orders = ref.read(ordersRepoProvider);
    final deadline = DateTime.now().add(const Duration(seconds: 180));
    while (DateTime.now().isBefore(deadline)) {
      try {
        final s = await orders.status(orderId);
        if (s.status == OrderStatus.provisioned && s.esimIds.isNotEmpty) {
          if (!mounted) return;
          ref.invalidate(myEsimsProvider);
          context.go('/esims/${s.esimIds.first}');
          return;
        }
        if (s.status == OrderStatus.failed) {
          setState(() {
            _phase = _Phase.failed;
            _errorDetail = 'checkout.provision_failed'.tr();
          });
          return;
        }
      } catch (_) {}
      await Future<void>.delayed(const Duration(seconds: 3));
    }
    if (mounted) context.go('/esims');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(title: Text('checkout.title'.tr())),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: switch (_phase) {
              _Phase.paying => const CircularProgressIndicator(),
              _Phase.waiting => Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text(
                      'Waiting for DPay PKR payment confirmation & Yesim QR issuance...',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.ink),
                    ),
                  ],
                ),
              _Phase.ready => const Icon(Icons.check_circle, size: 52),
              _Phase.failed => Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_errorDetail ?? 'Payment failed',
                        style: TextStyle(color: AppColors.ink)),
                    const SizedBox(height: 16),
                    AuroraButton(
                      label: 'Back',
                      onPressed: () => context.go('/'),
                    ),
                  ],
                ),
            },
          ),
        ),
      ),
    );
  }
}
