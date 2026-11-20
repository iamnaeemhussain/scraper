import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/repositories.dart';
import 'auth_layout.dart';
import '../../shared/widgets.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordConfirm = TextEditingController();
  bool _loading = false;
  bool _showPassword = false;
  bool _showPasswordConfirm = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _passwordConfirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_password.text.length < 8) {
      setState(() => _error = 'auth.password_too_short'.tr());
      return;
    }
    if (_password.text != _passwordConfirm.text) {
      setState(() => _error = 'auth.passwords_do_not_match'.tr());
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepoProvider).register(
            email: _email.text.trim(),
            password: _password.text,
            locale: context.locale.languageCode,
          );
      ref.invalidate(authStateProvider);
      if (mounted) context.go('/');
    } catch (_) {
      setState(() => _error = 'auth.register_failed'.tr());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AuthIntro(
            title: 'auth.create_account'.tr(),
            subtitle: 'auth.register_subtitle'.tr(),
            trailing: AuthModeBadge(
              icon: Icons.person_add_alt_1_outlined,
              label: 'auth.register_badge'.tr(),
            ),
          ),
          const SizedBox(height: 28),
          AuthFormCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AuthFormHeader(
                  icon: Icons.person_add_alt_1_outlined,
                  label: 'auth.register_form_title'.tr(),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  style: TextStyle(
                      color: AppColors.ink, fontWeight: FontWeight.w500),
                  decoration: InputDecoration(
                    labelText: 'auth.email'.tr(),
                    prefixIcon: const Icon(Icons.mail_outline),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: !_showPassword,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.newPassword],
                  style: TextStyle(
                      color: AppColors.ink, fontWeight: FontWeight.w500),
                  decoration: InputDecoration(
                    labelText: 'auth.password'.tr(),
                    helperText: 'auth.password_hint'.tr(),
                    helperStyle: TextStyle(color: AppColors.ink3, fontSize: 12),
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(_showPassword
                          ? Icons.visibility_off
                          : Icons.visibility),
                      onPressed: () =>
                          setState(() => _showPassword = !_showPassword),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passwordConfirm,
                  obscureText: !_showPasswordConfirm,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) {
                    if (!_loading) _submit();
                  },
                  autofillHints: const [AutofillHints.newPassword],
                  style: TextStyle(
                      color: AppColors.ink, fontWeight: FontWeight.w500),
                  decoration: InputDecoration(
                    labelText: 'auth.password_confirm'.tr(),
                    prefixIcon: const Icon(Icons.lock_reset_outlined),
                    suffixIcon: IconButton(
                      icon: Icon(_showPasswordConfirm
                          ? Icons.visibility_off
                          : Icons.visibility),
                      onPressed: () => setState(
                          () => _showPasswordConfirm = !_showPasswordConfirm),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  AuthErrorBanner(message: _error!),
                ],
                const SizedBox(height: 20),
                AuroraButton(
                  label: 'auth.register'.tr(),
                  icon: Icons.person_add_alt_1,
                  loading: _loading,
                  onPressed: _loading ? null : _submit,
                ),
                const SizedBox(height: 14),
                Text(
                  'auth.legal_hint'.tr(),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: AppColors.ink3, fontSize: 11, height: 1.4),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('auth.have_account_q'.tr(),
                  style: TextStyle(color: AppColors.ink2, fontSize: 13)),
              TextButton(
                onPressed: () => context.go('/login'),
                child: Text('auth.login'.tr()),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
