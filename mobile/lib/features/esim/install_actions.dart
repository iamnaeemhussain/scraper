import 'dart:io';

import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// LPA activation codes look like:
///   "LPA:1$smdp.example.com$ABC123MATCHING"
class LpaCode {
  LpaCode({required this.smdpAddress, required this.matchingId, required this.raw});

  /// SM-DP+ server address (e.g. "smdp.example.com").
  final String smdpAddress;

  /// One-time matching ID for the eSIM profile.
  final String matchingId;

  /// Raw "LPA:1$..." string, as returned by the provider.
  final String raw;

  static LpaCode? tryParse(String input) {
    final s = input.trim();
    if (!s.startsWith('LPA:')) return null;
    final parts = s.split(r'$');
    if (parts.length < 3) return null;
    return LpaCode(smdpAddress: parts[1], matchingId: parts[2], raw: s);
  }
}

class InstallActions {
  /// True iff the device may support one-tap eSIM install:
  ///  - iOS 17.4+ Universal Link
  ///  - Android: we don't probe RSP capability; users with non-supporting
  ///    phones fall back to QR.
  static bool canTryOneTap() => Platform.isIOS || Platform.isAndroid;

  /// Build the iOS 17.4+ Universal Link that opens Settings → Cellular →
  /// Add Cellular Plan with the activation code prefilled.
  static Uri iosUniversalLink(LpaCode lpa) {
    final encoded = Uri.encodeQueryComponent(lpa.raw);
    return Uri.parse(
      'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=$encoded',
    );
  }

  /// Best-effort one-tap install. Returns true if a system handler accepted
  /// the request; callers should fall back to QR if false.
  static Future<bool> tryOneTap(LpaCode lpa) async {
    if (Platform.isIOS) {
      return launchUrl(iosUniversalLink(lpa), mode: LaunchMode.externalApplication);
    }
    // Android: deep-link to the system eSIM settings; not a true one-tap but
    // it gets the user one screen closer than a fully manual flow.
    final uri = Uri.parse('android.settings.MANAGE_ESIM_SETTINGS');
    try {
      return await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      return false;
    }
  }

  static Future<void> copy(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
  }
}
