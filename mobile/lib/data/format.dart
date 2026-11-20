/// PKR whole-rupee formatter for Pak-Tel bundles.
String formatPricePkr(num pkr, {String prefix = 'Rs. '}) {
  return '$prefix${pkr.round()}';
}

/// Alias kept so existing UI call sites compile cleanly while rendering PKR.
String formatPriceUsd(double amountPkr, {String prefix = 'Rs. '}) {
  return formatPricePkr(amountPkr, prefix: prefix);
}

String formatDuration(num count, String unit, String locale) {
  final n = count.toString();
  final u = unit.toUpperCase();
  switch (u) {
    case 'DAY':
      return count == 1 ? '1 day' : '$n days';
    case 'HOUR':
      return '$n hours';
    case 'WEEK':
      return '$n weeks';
    case 'MONTH':
      return '$n months';
  }
  return '$n ${unit.toLowerCase()}';
}

String formatDurationShort(num count, String unit, String locale) {
  return '${count}d';
}
