import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/repositories.dart';
import 'auth_layout.dart';
import '../../shared/widgets.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  bool _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepoProvider).login(
            email: _email.text.trim(),
            password: _password.text,
          );
      ref.invalidate(authStateProvider);
      if (mounted) context.go('/');
    } catch (_) {
      setState(() => _error = 'auth.invalid_credentials'.tr());
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
            title: 'auth.welcome_back'.tr(),
            subtitle: 'auth.login_subtitle'.tr(),
          ),
          const SizedBox(height: 28),
          AuthFormCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
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
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) {
                    if (!_loading) _submit();
                  },
                  autofillHints: const [AutofillHints.password],
                  style: TextStyle(
                      color: AppColors.ink, fontWeight: FontWeight.w500),
                  decoration: InputDecoration(
                    labelText: 'auth.password'.tr(),
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
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  AuthErrorBanner(message: _error!),
                ],
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () {
                      final email = _email.text.trim();
                      context.go(Uri(
                        path: '/forgot-password',
                        queryParameters:
                            email.isEmpty ? null : {'email': email},
                      ).toString());
                    },
                    child: Text('auth.forgot_password'.tr()),
                  ),
                ),
                const SizedBox(height: 8),
                AuroraButton(
                  label: 'auth.login'.tr(),
                  icon: Icons.arrow_forward,
                  loading: _loading,
                  onPressed: _loading ? null : _submit,
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('auth.no_account_q'.tr(),
                  style: TextStyle(color: AppColors.ink2, fontSize: 13)),
              TextButton(
                onPressed: () => context.go('/register'),
                child: Text('auth.register'.tr()),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
