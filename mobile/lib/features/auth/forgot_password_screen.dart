import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/repositories.dart';
import 'auth_layout.dart';
import '../../shared/widgets.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});

  final String initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  bool _loading = false;
  bool _sent = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.text = widget.initialEmail;
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepoProvider).forgotPassword(_email.text.trim());
      if (mounted) setState(() => _sent = true);
    } catch (_) {
      if (mounted) setState(() => _error = 'auth.reset_failed'.tr());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      child: _sent ? _confirm() : _form(),
    );
  }

  Widget _form() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AuthIntro(
          title: 'auth.forgot_title'.tr(),
          subtitle: 'auth.forgot_subtitle'.tr(),
          trailing: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => context.go('/login'),
          ),
        ),
        const SizedBox(height: 28),
        AuthFormCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) {
                  if (!_loading) _submit();
                },
                autofillHints: const [AutofillHints.email],
                style: TextStyle(
                    color: AppColors.ink, fontWeight: FontWeight.w500),
                decoration: InputDecoration(
                  labelText: 'auth.email'.tr(),
                  prefixIcon: const Icon(Icons.mail_outline),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                AuthErrorBanner(message: _error!),
              ],
              const SizedBox(height: 20),
              AuroraButton(
                label: 'auth.send_reset_link'.tr(),
                icon: Icons.send_outlined,
                loading: _loading,
                onPressed: _loading ? null : _submit,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _confirm() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const BrandMark(),
        const SizedBox(height: 42),
        AuthFormCard(
          child: Column(
            children: [
              Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                  color: AppColors.surfaceHigh.withValues(alpha: 0.82),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.stroke),
                ),
                child: Icon(Icons.mark_email_read_outlined,
                    size: 38, color: AppColors.ink2),
              ),
              const SizedBox(height: 22),
              Text(
                'auth.reset_sent_title'.tr(),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'auth.reset_sent'.tr(),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.ink2,
                  fontSize: 14,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 26),
              AuroraButton(
                label: 'auth.back_to_login'.tr(),
                onPressed: () => context.go('/login'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
