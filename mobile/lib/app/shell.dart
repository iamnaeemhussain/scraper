import 'dart:ui';

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'theme.dart';

/// Midnight bottom-nav scaffold for go_router's StatefulShellRoute. Three
/// top-level tabs: Discover, eSIMs, Profile.
///
/// Stateful so we can subscribe to `AppColors.listenable` — go_router keeps
/// this shell mounted across tab switches and the outer KeyedSubtree
/// rebuild doesn't always propagate here in time. Listening directly makes
/// the toolbar flip palettes in the same frame as everything else.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  @override
  void initState() {
    super.initState();
    AppColors.listenable.addListener(_onPaletteChange);
  }

  @override
  void dispose() {
    AppColors.listenable.removeListener(_onPaletteChange);
    super.dispose();
  }

  void _onPaletteChange() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final keyboardVisible = MediaQuery.of(context).viewInsets.bottom > 0;
    // extendBody lets page content scroll underneath the floating glass
    // bar so the BackdropFilter has something to blur. Without this the
    // bar covers an empty Scaffold slot and the blur is a no-op.
    return Scaffold(
      extendBody: true,
      body: widget.navigationShell,
      bottomNavigationBar: AnimatedSwitcher(
        duration: const Duration(milliseconds: 180),
        switchInCurve: Curves.easeOut,
        switchOutCurve: Curves.easeOut,
        child: keyboardVisible
            ? const SizedBox.shrink()
            : SafeArea(
                minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(AppRadii.xl),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: AppColors.surfaceGlass,
                        borderRadius: BorderRadius.circular(AppRadii.xl),
                        border: Border.all(
                          color: AppColors.strokeStrong,
                          width: 1,
                        ),
                      ),
                      child: NavigationBarTheme(
                        data: NavigationBarThemeData(
                          indicatorShape: const StadiumBorder(),
                          iconTheme: WidgetStateProperty.resolveWith((states) {
                            final selected =
                                states.contains(WidgetState.selected);
                            return IconThemeData(
                              size: 22,
                              color: selected ? AppColors.ink : AppColors.ink3,
                            );
                          }),
                          labelTextStyle:
                              WidgetStateProperty.resolveWith((states) {
                            final selected =
                                states.contains(WidgetState.selected);
                            return TextStyle(
                              fontSize: 11,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w600,
                              letterSpacing: 0.1,
                              color: selected ? AppColors.ink : AppColors.ink3,
                              height: 1.1,
                            );
                          }),
                        ),
                        child: NavigationBar(
                          height: 72,
                          backgroundColor: Colors.transparent,
                          surfaceTintColor: Colors.transparent,
                          indicatorColor: AppColors.ink.withValues(alpha: 0.08),
                          labelBehavior:
                              NavigationDestinationLabelBehavior.alwaysShow,
                          selectedIndex: widget.navigationShell.currentIndex,
                          onDestinationSelected: (i) =>
                              widget.navigationShell.goBranch(
                            i,
                            initialLocation:
                                i == widget.navigationShell.currentIndex,
                          ),
                          destinations: [
                            NavigationDestination(
                              icon: const Icon(Icons.explore_outlined),
                              selectedIcon: const Icon(Icons.explore),
                              label: 'nav.discover'.tr(),
                            ),
                            NavigationDestination(
                              icon: const Icon(Icons.sim_card_outlined),
                              selectedIcon: const Icon(Icons.sim_card),
                              label: 'nav.esims'.tr(),
                            ),
                            NavigationDestination(
                              icon: const Icon(Icons.person_outline),
                              selectedIcon: const Icon(Icons.person),
                              label: 'nav.profile'.tr(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
