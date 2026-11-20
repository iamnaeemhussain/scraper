import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Midnight surface card with hairline border. The default container.
class SoftCard extends StatelessWidget {
  const SoftCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
    this.gradient,
    this.borderless = false,
    this.glow = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Gradient? gradient;
  final bool borderless;

  /// When true, adds a faint brand bloom under the card. Use sparingly on
  /// hero surfaces — never on list rows.
  final bool glow;

  @override
  Widget build(BuildContext context) {
    final container = Container(
      decoration: BoxDecoration(
        color: gradient == null ? (color ?? AppColors.surface) : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        border: (gradient == null && !borderless)
            ? Border.all(color: AppColors.stroke)
            : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 18,
            offset: const Offset(0, 10),
            spreadRadius: -12,
          ),
          if (glow)
            BoxShadow(
              color: AppColors.auroraStart.withValues(alpha: 0.10),
              blurRadius: 26,
              spreadRadius: -10,
              offset: const Offset(0, 14),
            ),
        ],
      ),
      padding: padding,
      child: child,
    );
    if (onTap == null) return container;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.xl),
        splashColor: AppColors.auroraEnd.withValues(alpha: 0.08),
        highlightColor: AppColors.auroraEnd.withValues(alpha: 0.04),
        child: container,
      ),
    );
  }
}

/// Pill chip with optional leading icon. Tinted bg in the given color.
class TagChip extends StatelessWidget {
  const TagChip(
      {super.key,
      required this.label,
      this.icon,
      this.color,
      this.dense = false});
  final String label;
  final IconData? icon;
  final Color? color;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.auroraEnd;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 8 : 10,
        vertical: dense ? 4 : 5,
      ),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: c.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: dense ? 11 : 13, color: c),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: c,
              fontSize: dense ? 11 : 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.1,
            ),
          ),
        ],
      ),
    );
  }
}

/// Section header used inside content areas.
class PageHeader extends StatelessWidget {
  const PageHeader(
      {super.key, required this.title, this.subtitle, this.trailing});

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.headlineMedium),
                if (subtitle != null) ...[
                  const SizedBox(height: 6),
                  Text(subtitle!,
                      style: TextStyle(
                          color: AppColors.ink2, fontSize: 14, height: 1.4)),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class CenteredLoader extends StatelessWidget {
  const CenteredLoader({super.key});
  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator(strokeWidth: 2.5));
}

/// Friendly empty / error state: brand-tinted icon, headline, optional body + action.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                gradient: AppGradients.auroraSoft,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.stroke),
              ),
              child: ShaderMask(
                blendMode: BlendMode.srcIn,
                shaderCallback: (b) => AppGradients.aurora.createShader(b),
                child: Icon(icon, size: 40, color: Colors.white),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                style: TextStyle(color: AppColors.ink2, height: 1.45),
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: 24),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Slim rounded progress bar with optional gradient fill.
class UsageBar extends StatelessWidget {
  const UsageBar({
    super.key,
    required this.value,
    this.color,
    this.gradient,
    this.height = 8,
    this.trackColor,
  });

  final double value;
  final Color? color;
  final Gradient? gradient;
  final double height;
  final Color? trackColor;

  @override
  Widget build(BuildContext context) {
    final clamped = value.clamp(0.0, 1.0);
    final g = gradient ??
        (color == null
            ? AppGradients.aurora
            : LinearGradient(colors: [color!, color!.withValues(alpha: 0.7)]));
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.pill),
      child: Stack(
        children: [
          Container(height: height, color: trackColor ?? AppColors.stroke),
          FractionallySizedBox(
            widthFactor: clamped,
            child: Container(
                height: height, decoration: BoxDecoration(gradient: g)),
          ),
        ],
      ),
    );
  }
}

/// Tracked all-caps label for sub-sections.
///
/// We deliberately do NOT call `.toUpperCase()` here — Dart's default casing
/// produces wrong glyphs for Turkish ("i" → "I" instead of "İ"). Callers are
/// expected to pass pre-uppercased text (in i18n keys, store the uppercase
/// form directly).
class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key, this.color});
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: TextStyle(
        color: color ?? AppColors.ink3,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.4,
      ),
    );
  }
}

/// Primary call-to-action. Brand gradient fill, white ink. Use one per screen.
class AuroraButton extends StatelessWidget {
  const AuroraButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || loading;
    final btn = AnimatedOpacity(
      duration: const Duration(milliseconds: 180),
      opacity: disabled ? 0.55 : 1,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: AppGradients.aurora,
          borderRadius: BorderRadius.circular(AppRadii.md),
          boxShadow: disabled
              ? null
              : [
                  BoxShadow(
                    color: AppColors.auroraStart.withValues(alpha: 0.16),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                    spreadRadius: -6,
                  ),
                ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: disabled ? null : onPressed,
            borderRadius: BorderRadius.circular(AppRadii.md),
            child: Container(
              height: 56,
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 22),
              child: loading
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        valueColor: AlwaysStoppedAnimation(Colors.white),
                      ),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          label,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.2,
                          ),
                        ),
                        if (icon != null) ...[
                          const SizedBox(width: 10),
                          Icon(icon, color: Colors.white, size: 18),
                        ],
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: btn) : btn;
  }
}

/// Outlined ghost button used as secondary action on dark surfaces.
class GhostButton extends StatelessWidget {
  const GhostButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final child = OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        side: BorderSide(color: AppColors.strokeStrong, width: 1.2),
        backgroundColor: AppColors.surface,
        minimumSize: const Size.fromHeight(54),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadii.md)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: AppColors.ink),
            const SizedBox(width: 8),
          ],
          Text(label,
              style: TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w700,
                  fontSize: 15)),
        ],
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: child) : child;
  }
}

/// Bone-white text with a muted brand-gradient overlay. Use for headline accents
/// like the first word of a hero — never for body copy.
class GradientText extends StatelessWidget {
  const GradientText(
    this.text, {
    super.key,
    required this.style,
    this.gradient = AppGradients.aurora,
    this.textAlign,
  });

  final String text;
  final TextStyle style;
  final Gradient gradient;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    return ShaderMask(
      blendMode: BlendMode.srcIn,
      shaderCallback: (b) => gradient.createShader(b),
      child: Text(text,
          style: style.copyWith(color: Colors.white), textAlign: textAlign),
    );
  }
}

/// Compact brand mark for app-bar use: brand dot + "esim" wordmark.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.dense = false});
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: dense ? 10 : 12,
          height: dense ? 10 : 12,
          decoration: BoxDecoration(
            gradient: AppGradients.aurora,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: AppColors.auroraStart.withValues(alpha: 0.24),
                blurRadius: 8,
                spreadRadius: -1,
              ),
            ],
          ),
        ),
        SizedBox(width: dense ? 8 : 10),
        Text(
          'esim',
          style: TextStyle(
            color: AppColors.ink,
            fontWeight: FontWeight.w800,
            fontSize: dense ? 14 : 16,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

/// Subtle line-work background for hero surfaces.
///
/// The low-contrast arcs and routes give cards a connected/travel feel while
/// keeping the surface calm.
class SignalLineBackground extends StatelessWidget {
  const SignalLineBackground({super.key, this.color, this.opacity = 0.1});
  final Color? color;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _SignalLinePainter(
        color: color ?? AppColors.ink,
        opacity: opacity,
      ),
      size: Size.infinite,
    );
  }
}

class _SignalLinePainter extends CustomPainter {
  _SignalLinePainter({required this.color, required this.opacity});
  final Color color;
  final double opacity;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = color.withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1
      ..strokeCap = StrokeCap.round;
    final softStroke = Paint()
      ..color = color.withValues(alpha: opacity * 0.52)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    final routeA = Path()
      ..moveTo(-size.width * 0.08, size.height * 0.28)
      ..quadraticBezierTo(
        size.width * 0.34,
        size.height * 0.08,
        size.width * 0.72,
        size.height * 0.34,
      )
      ..quadraticBezierTo(
        size.width * 0.98,
        size.height * 0.52,
        size.width * 1.12,
        size.height * 0.24,
      );

    final routeB = Path()
      ..moveTo(size.width * 0.06, size.height * 0.88)
      ..cubicTo(
        size.width * 0.28,
        size.height * 0.58,
        size.width * 0.58,
        size.height * 0.96,
        size.width * 0.94,
        size.height * 0.64,
      );

    canvas.drawPath(routeA, stroke);
    canvas.drawPath(routeB, softStroke);

    final radius = math.max(size.width, size.height) * 0.34;
    canvas.drawCircle(
      Offset(size.width * 0.86, size.height * 0.2),
      radius,
      softStroke,
    );
    canvas.drawCircle(
      Offset(size.width * 0.14, size.height * 0.96),
      radius * 0.82,
      softStroke,
    );

    canvas.drawLine(
      Offset(size.width * 0.62, 0),
      Offset(size.width * 0.98, size.height),
      softStroke,
    );
  }

  @override
  bool shouldRepaint(covariant _SignalLinePainter old) =>
      old.color != color || old.opacity != opacity;
}

/// Decorative chip artwork mimicking a SIM contact pad. Use inside dark cards
/// as visual flavor — never load-bearing.
class SimChipArtwork extends StatelessWidget {
  const SimChipArtwork({super.key, this.size = 36, this.color});
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.auroraEnd;
    return SizedBox(
      width: size,
      height: size * 0.78,
      child: CustomPaint(painter: _SimChipPainter(c)),
    );
  }
}

class _SimChipPainter extends CustomPainter {
  _SimChipPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.75)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    final fill = Paint()..color = color.withValues(alpha: 0.10);

    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, size.width, size.height),
      const Radius.circular(6),
    );
    canvas.drawRRect(rrect, fill);
    canvas.drawRRect(rrect, paint);

    // Internal contacts: cross + two side lanes.
    final cx = size.width / 2;
    final cy = size.height / 2;
    const pad = 4.0;
    canvas.drawLine(Offset(cx, pad), Offset(cx, size.height - pad), paint);
    canvas.drawLine(Offset(pad, cy), Offset(size.width - pad, cy), paint);
  }

  @override
  bool shouldRepaint(covariant _SimChipPainter old) => old.color != color;
}

/// Circular percentage meter with aurora sweep. Used on the eSIM usage tab.
class CircularMeter extends StatelessWidget {
  const CircularMeter({
    super.key,
    required this.value,
    required this.label,
    required this.caption,
    this.size = 168,
    this.strokeWidth = 12,
    this.gradient,
  });

  final double value;
  final String label;
  final String caption;
  final double size;
  final double strokeWidth;
  final Gradient? gradient;

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0.0, 1.0);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size.square(size),
            painter: _MeterPainter(
              value: v,
              strokeWidth: strokeWidth,
              track: AppColors.stroke,
              gradient: gradient ?? AppGradients.aurora,
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: AppColors.ink,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                caption,
                style: TextStyle(
                    color: AppColors.ink2,
                    fontSize: 12,
                    fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MeterPainter extends CustomPainter {
  _MeterPainter({
    required this.value,
    required this.strokeWidth,
    required this.track,
    required this.gradient,
  });

  final double value;
  final double strokeWidth;
  final Color track;
  final Gradient gradient;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(
      strokeWidth / 2,
      strokeWidth / 2,
      size.width - strokeWidth,
      size.height - strokeWidth,
    );

    final trackPaint = Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, -math.pi / 2, 2 * math.pi, false, trackPaint);

    if (value <= 0) return;
    final progressPaint = Paint()
      ..shader = gradient.createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
        rect, -math.pi / 2, 2 * math.pi * value, false, progressPaint);
  }

  @override
  bool shouldRepaint(covariant _MeterPainter old) =>
      old.value != value ||
      old.strokeWidth != strokeWidth ||
      old.track != track;
}
