import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../data/api_client.dart';
import '../../data/repositories.dart';
import '../../shared/widgets.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider);
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: me.when(
          loading: () => const CenteredLoader(),
          error: (e, _) => EmptyState(
            icon: Icons.cloud_off,
            title: 'errors.load_failed'.tr(),
            subtitle: e.toString(),
          ),
          // Bottom padding leaves clearance for the floating glass bar
          // (extendBody = true in AppShell). 28 alone left the last row
          // partially hidden behind the bar; ~120 covers bar height +
          // safe-area margin.
          data: (u) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
            children: [
              _Header(email: u.email, emailVerified: u.emailVerified),
              const SizedBox(height: 28),
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 10),
                child: SectionLabel('profile.preferences'.tr()),
              ),
              SoftCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _SettingsRow(
                      icon: Icons.language,
                      label: 'profile.language'.tr(),
                      trailing: DropdownButtonHideUnderline(
                        child: DropdownButton<Locale>(
                          value: context.locale,
                          dropdownColor: AppColors.surfaceHigh,
                          style: TextStyle(
                              color: AppColors.ink,
                              fontWeight: FontWeight.w600),
                          iconEnabledColor: AppColors.ink3,
                          onChanged: (l) {
                            if (l != null) context.setLocale(l);
                          },
                          items: const [
                            DropdownMenuItem(
                                value: Locale('tr'), child: Text('Türkçe')),
                            DropdownMenuItem(
                                value: Locale('en'), child: Text('English')),
                          ],
                        ),
                      ),
                    ),
                    Divider(
                        indent: 16,
                        endIndent: 16,
                        height: 0,
                        color: AppColors.stroke.withValues(alpha: 0.6)),
                    _ThemeRow(),
                    Divider(
                        indent: 16,
                        endIndent: 16,
                        height: 0,
                        color: AppColors.stroke.withValues(alpha: 0.6)),
                    _SettingsRow(
                        icon: Icons.policy_outlined,
                        label: 'profile.privacy'.tr(),
                        onTap: () {}),
                    Divider(
                        indent: 16,
                        endIndent: 16,
                        height: 0,
                        color: AppColors.stroke.withValues(alpha: 0.6)),
                    _SettingsRow(
                        icon: Icons.support_agent,
                        label: 'profile.support'.tr(),
                        onTap: () {},
                        isLast: true),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 10),
                child: SectionLabel('profile.account'.tr()),
              ),
              SoftCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _SettingsRow(
                      icon: Icons.logout,
                      label: 'profile.logout'.tr(),
                      onTap: () async {
                        await ref.read(authRepoProvider).logout();
                        ref.invalidate(authStateProvider);
                        if (context.mounted) context.go('/login');
                      },
                    ),
                    Divider(
                        indent: 16,
                        endIndent: 16,
                        height: 0,
                        color: AppColors.stroke.withValues(alpha: 0.6)),
                    _SettingsRow(
                      icon: Icons.delete_forever,
                      label: 'profile.delete_account'.tr(),
                      destructive: true,
                      isLast: true,
                      onTap: () => _confirmDelete(context, ref),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Center(
                child: Text(
                  'v0.1.0',
                  style: TextStyle(
                      color: AppColors.ink3,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.4),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.lg),
          side: BorderSide(color: AppColors.stroke),
        ),
        title: Text('profile.delete_confirm_title'.tr(),
            style:
                TextStyle(color: AppColors.ink, fontWeight: FontWeight.w800)),
        content: Text('profile.delete_confirm_body'.tr(),
            style: TextStyle(color: AppColors.ink2, height: 1.5)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: Text('common.cancel'.tr())),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(c, true),
            child: Text('profile.delete_confirm_yes'.tr()),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final dio = ref.read(apiClientProvider);
    try {
      await dio.delete('/me');
    } catch (_) {}
    await ref.read(authRepoProvider).logout();
    ref.invalidate(authStateProvider);
    if (context.mounted) context.go('/login');
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.email, required this.emailVerified});
  final String email;
  final bool emailVerified;

  @override
  Widget build(BuildContext context) {
    return SoftCard(
      padding: EdgeInsets.zero,
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
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      gradient: AppGradients.aurora,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.auroraStart.withValues(alpha: 0.5),
                          blurRadius: 22,
                          spreadRadius: -4,
                        ),
                      ],
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      email.substring(0, 1).toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 22,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          email,
                          style: TextStyle(
                            color: AppColors.ink,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            letterSpacing: 0,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        if (emailVerified)
                          TagChip(
                            icon: Icons.verified,
                            label: 'profile.email_verified_short'.tr(),
                            color: AppColors.success,
                            dense: true,
                          )
                        else
                          TagChip(
                            icon: Icons.warning_amber_rounded,
                            label: 'profile.email_not_verified_short'.tr(),
                            color: AppColors.warning,
                            dense: true,
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
    );
  }
}

/// Row that drives the global theme switch. Listens to [AppThemeMode] so the
/// trailing label updates immediately after a selection.
class _ThemeRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: AppThemeMode.notifier,
      builder: (context, mode, _) {
        return _SettingsRow(
          icon: Icons.brightness_6,
          label: 'profile.theme'.tr(),
          trailing: DropdownButtonHideUnderline(
            child: DropdownButton<ThemeMode>(
              value: mode,
              dropdownColor: AppColors.surfaceHigh,
              style:
                  TextStyle(color: AppColors.ink, fontWeight: FontWeight.w600),
              iconEnabledColor: AppColors.ink3,
              onChanged: (m) {
                if (m != null) AppThemeMode.notifier.value = m;
              },
              items: [
                DropdownMenuItem(
                  value: ThemeMode.system,
                  child: Text('profile.theme_system'.tr()),
                ),
                DropdownMenuItem(
                  value: ThemeMode.light,
                  child: Text('profile.theme_light'.tr()),
                ),
                DropdownMenuItem(
                  value: ThemeMode.dark,
                  child: Text('profile.theme_dark'.tr()),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.label,
    this.onTap,
    this.trailing,
    this.destructive = false,
    this.isLast = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool destructive;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.danger : AppColors.ink;
    final iconColor = destructive ? AppColors.danger : AppColors.auroraEnd;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: isLast
            ? const BorderRadius.vertical(bottom: Radius.circular(AppRadii.lg))
            : BorderRadius.zero,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
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
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                      color: color, fontWeight: FontWeight.w600, fontSize: 14),
                ),
              ),
              if (trailing != null)
                trailing!
              else if (onTap != null)
                Icon(Icons.chevron_right, color: AppColors.ink3),
            ],
          ),
        ),
      ),
    );
  }
}
