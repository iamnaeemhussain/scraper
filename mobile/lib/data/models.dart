class Me {
  final String id;
  final String email;
  final bool emailVerified;
  final String locale;
  final String role;

  Me({
    required this.id,
    required this.email,
    required this.emailVerified,
    required this.locale,
    this.role = 'USER',
  });

  factory Me.fromJson(Map<String, dynamic> j) => Me(
        id: j['id'] as String,
        email: j['email'] as String,
        emailVerified: j['emailVerified'] as bool? ?? false,
        locale: j['locale'] as String? ?? 'en',
        role: j['role'] as String? ?? 'USER',
      );
}

class Region {
  final String locationCode;
  final String locationName;
  final String? locationLogo;
  final String? type;

  Region({
    required this.locationCode,
    required this.locationName,
    this.locationLogo,
    this.type,
  });

  factory Region.fromJson(Map<String, dynamic> j) => Region(
        locationCode: (j['code'] ?? j['locationCode'] ?? 'PK') as String,
        locationName: (j['name'] ?? j['locationName'] ?? 'Pakistan') as String,
        locationLogo: j['locationLogo'] as String?,
        type: j['type'] as String?,
      );
}

class PackageItem {
  final String id;
  final String packageCode;
  final String slug;
  final String name;
  final int pricePkr;
  final int? actualPricePkr;
  final int? discountPct;
  final int volumeBytes;
  final String dataLabel;
  final int duration;
  final String durationUnit;
  final String location;
  final String description;
  final bool unlimited;
  final bool isReloadable;
  final bool isMostPopular;
  final String? speed;
  final String? fupPolicy;
  final String? tier;
  final String? provider;

  PackageItem({
    required this.id,
    required this.packageCode,
    required this.slug,
    required this.name,
    required this.pricePkr,
    this.actualPricePkr,
    this.discountPct,
    required this.volumeBytes,
    required this.dataLabel,
    required this.duration,
    required this.durationUnit,
    required this.location,
    required this.description,
    this.unlimited = false,
    this.isReloadable = true,
    this.isMostPopular = false,
    this.speed,
    this.fupPolicy,
    this.tier,
    this.provider = 'yesim',
  });

  factory PackageItem.fromJson(Map<String, dynamic> j) {
    final rawBytes = int.tryParse((j['dataBytes'] ?? j['volume'] ?? '0').toString()) ?? 0;
    final unlim = (j['isUnlimited'] as bool?) ?? (j['unlimited'] as bool?) ?? rawBytes < 0;
    final idStr = (j['id'] ?? j['slug'] ?? '') as String;
    return PackageItem(
      id: idStr,
      packageCode: (j['providerCode'] ?? j['yesimPlanId'] ?? idStr) as String,
      slug: idStr,
      name: (j['name'] as String?) ?? '',
      pricePkr: (j['pricePkr'] as num?)?.toInt() ?? 0,
      actualPricePkr: (j['actualPricePkr'] as num?)?.toInt(),
      discountPct: (j['discountPct'] as num?)?.toInt(),
      volumeBytes: rawBytes,
      dataLabel: (j['dataLabel'] as String?) ?? (unlim ? 'Unlimited Data' : ''),
      duration: ((j['validityDays'] ?? j['duration']) as num?)?.toInt() ?? 30,
      durationUnit: 'DAY',
      location: (j['regionCode'] ?? j['countryCode'] ?? 'PK') as String,
      description: (j['message'] ?? '') as String,
      unlimited: unlim,
      isReloadable: j['isReloadable'] as bool? ?? true,
      isMostPopular: j['isMostPopular'] as bool? ?? false,
      speed: '5G/4G/LTE',
      provider: 'yesim',
    );
  }

  bool get isPlus => tier == 'plus';
  double get priceUsd => pricePkr.toDouble();
  double get retailUsd => pricePkr.toDouble();

  String get volumeLabel => dataLabel.isNotEmpty
      ? dataLabel
      : (unlimited ? 'Unlimited Data' : 'Data Plan');

  int get volumeSortKey => unlimited ? 1 << 62 : volumeBytes;
}

enum OrderStatus { created, paid, provisioned, failed, refunded, unknown }

OrderStatus _orderStatus(String? s) {
  switch (s) {
    case 'PENDING_PAYMENT':
      return OrderStatus.created;
    case 'PROVISIONING':
      return OrderStatus.paid;
    case 'PROVISIONED':
      return OrderStatus.provisioned;
    case 'FAILED':
      return OrderStatus.failed;
    case 'REFUNDED':
      return OrderStatus.refunded;
    default:
      return OrderStatus.unknown;
  }
}

class OrderCreatedResponse {
  final String orderId;
  final String orderNumber;
  final int amountPkr;
  final int amountPaisa;
  final String currency;
  final String dpaySessionId;
  final String checkoutUrl;

  OrderCreatedResponse({
    required this.orderId,
    required this.orderNumber,
    required this.amountPkr,
    required this.amountPaisa,
    required this.currency,
    required this.dpaySessionId,
    required this.checkoutUrl,
  });

  factory OrderCreatedResponse.fromJson(Map<String, dynamic> j) => OrderCreatedResponse(
        orderId: (j['id'] ?? j['orderId']) as String,
        orderNumber: (j['orderNumber'] ?? j['reference'] ?? '') as String,
        amountPkr: (j['amountPkr'] as num?)?.toInt() ?? 0,
        amountPaisa: (j['amountPaisa'] as num?)?.toInt() ?? 0,
        currency: (j['currency'] as String?) ?? 'PKR',
        dpaySessionId: (j['dpaySessionId'] as String?) ?? '',
        checkoutUrl: (j['checkoutUrl'] as String?) ?? '',
      );
}

class OrderSummary {
  final String id;
  final OrderStatus status;
  final int amountPkr;
  final List<String> esimIds;

  OrderSummary({
    required this.id,
    required this.status,
    required this.amountPkr,
    required this.esimIds,
  });

  factory OrderSummary.fromJson(Map<String, dynamic> j) => OrderSummary(
        id: j['id'] as String,
        status: _orderStatus(j['status'] as String?),
        amountPkr: (j['amountPkr'] as num?)?.toInt() ?? 0,
        esimIds: ((j['esims'] as List?) ?? const [])
            .map((e) => (e as Map<String, dynamic>)['id'] as String)
            .toList(),
      );
}

class Esim {
  final String id;
  final String iccid;
  final String activationCode;
  final String qrCodeUrl;
  final String? iosTapLink;
  final String esimStatus;
  final String smdpStatus;
  final BigInt totalVolume;
  final BigInt orderUsage;
  final BigInt? remainVolume;
  final DateTime? expiredTime;
  final String? apn;

  Esim({
    required this.id,
    required this.iccid,
    required this.activationCode,
    required this.qrCodeUrl,
    required this.iosTapLink,
    required this.esimStatus,
    required this.smdpStatus,
    required this.totalVolume,
    required this.orderUsage,
    required this.remainVolume,
    required this.expiredTime,
    required this.apn,
  });

  factory Esim.fromJson(Map<String, dynamic> j) {
    const mbToBytes = 1024 * 1024;
    final pkgMb = (j['dataPackageMb'] as num?)?.toDouble() ?? 0;
    final usedMb = (j['dataUsedMb'] as num?)?.toDouble() ?? 0;
    final leftMb = (j['dataLeftMb'] as num?)?.toDouble();

    return Esim(
      id: j['id'] as String,
      iccid: j['iccid'] as String,
      activationCode: j['activationCode'] as String,
      qrCodeUrl: (j['qrCodeDataUrl'] ?? j['qrCodeUrl'] ?? '') as String,
      iosTapLink: j['iosTapLink'] as String?,
      esimStatus: (j['statusQr'] ?? 'Released') as String,
      smdpStatus: (j['statusQr'] ?? 'Released') as String,
      totalVolume: BigInt.from((pkgMb * mbToBytes).round()),
      orderUsage: BigInt.from((usedMb * mbToBytes).round()),
      remainVolume: leftMb == null ? null : BigInt.from((leftMb * mbToBytes).round()),
      expiredTime: j['planExpiredAt'] is String
          ? DateTime.tryParse(j['planExpiredAt'] as String)
          : null,
      apn: j['apn'] as String?,
    );
  }

  bool get isReady => true;

  double get usagePercent {
    if (totalVolume == BigInt.zero) return 0;
    return (orderUsage.toDouble() / totalVolume.toDouble()).clamp(0.0, 1.0);
  }

  int? get daysLeft {
    if (expiredTime == null) return null;
    final diff = expiredTime!.difference(DateTime.now()).inHours;
    return (diff / 24).ceil();
  }
}
