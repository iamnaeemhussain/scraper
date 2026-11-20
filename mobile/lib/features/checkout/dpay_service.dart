import 'package:url_launcher/url_launcher.dart';

import '../../data/models.dart';

/// Launches DPay Pakistan's hosted PKR checkout session (Raast / JazzCash /
/// Easypaisa / Bank Cards). Provisioning occurs server-side upon verified
/// DPay HMAC-SHA256 webhook confirmation.
class DpayPaymentService {
  Future<void> present({required OrderCreatedResponse order}) async {
    final uri = Uri.parse(order.checkoutUrl);
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched) {
      throw Exception('Could not launch DPay checkout URL');
    }
  }
}
