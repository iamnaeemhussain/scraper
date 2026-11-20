/// ISO 3166-1 Alpha-2 → localized country name.
///
/// The provider returns names in English only; this map gives us Turkish
/// fallbacks. For codes we don't know (including the provider's regional
/// pseudo-codes like "!RG" / "!GL"), the caller's backend-supplied name is
/// used as-is.
///
/// Coverage: every ISO 3166-1 assigned country. Kept compile-time const so
/// it's free at runtime (no Map allocation per lookup).

const Map<String, String> _tr = {
  'AD': 'Andorra', 'AE': 'Birleşik Arap Emirlikleri', 'AF': 'Afganistan',
  'AG': 'Antigua ve Barbuda', 'AI': 'Anguilla', 'AL': 'Arnavutluk',
  'AM': 'Ermenistan', 'AO': 'Angola', 'AQ': 'Antarktika', 'AR': 'Arjantin',
  'AS': 'Amerikan Samoası', 'AT': 'Avusturya', 'AU': 'Avustralya',
  'AW': 'Aruba', 'AX': 'Åland Adaları', 'AZ': 'Azerbaycan',
  'BA': 'Bosna-Hersek', 'BB': 'Barbados', 'BD': 'Bangladeş', 'BE': 'Belçika',
  'BF': 'Burkina Faso', 'BG': 'Bulgaristan', 'BH': 'Bahreyn', 'BI': 'Burundi',
  'BJ': 'Benin', 'BL': 'Saint Barthélemy', 'BM': 'Bermuda', 'BN': 'Brunei',
  'BO': 'Bolivya', 'BQ': 'Karayip Hollandası', 'BR': 'Brezilya', 'BS': 'Bahamalar',
  'BT': 'Bhutan', 'BV': 'Bouvet Adası', 'BW': 'Botsvana', 'BY': 'Belarus',
  'BZ': 'Belize', 'CA': 'Kanada', 'CC': 'Cocos Adaları', 'CD': 'Kongo (DRC)',
  'CF': 'Orta Afrika Cumhuriyeti', 'CG': 'Kongo Cumhuriyeti', 'CH': 'İsviçre',
  'CI': 'Fildişi Sahili', 'CK': 'Cook Adaları', 'CL': 'Şili', 'CM': 'Kamerun',
  'CN': 'Çin', 'CO': 'Kolombiya', 'CR': 'Kosta Rika', 'CU': 'Küba',
  'CV': 'Cape Verde', 'CW': 'Curaçao', 'CX': 'Christmas Adası', 'CY': 'Kıbrıs',
  'CZ': 'Çekya', 'DE': 'Almanya', 'DJ': 'Cibuti', 'DK': 'Danimarka',
  'DM': 'Dominika', 'DO': 'Dominik Cumhuriyeti', 'DZ': 'Cezayir',
  'EC': 'Ekvador', 'EE': 'Estonya', 'EG': 'Mısır', 'EH': 'Batı Sahra',
  'ER': 'Eritre', 'ES': 'İspanya', 'ET': 'Etiyopya', 'FI': 'Finlandiya',
  'FJ': 'Fiji', 'FK': 'Falkland Adaları', 'FM': 'Mikronezya', 'FO': 'Faroe Adaları',
  'FR': 'Fransa', 'GA': 'Gabon', 'GB': 'Birleşik Krallık', 'GD': 'Grenada',
  'GE': 'Gürcistan', 'GF': 'Fransız Guyanası', 'GG': 'Guernsey', 'GH': 'Gana',
  'GI': 'Cebelitarık', 'GL': 'Grönland', 'GM': 'Gambiya', 'GN': 'Gine',
  'GP': 'Guadeloupe', 'GQ': 'Ekvator Ginesi', 'GR': 'Yunanistan',
  'GS': 'Güney Georgia ve Sandwich Adaları', 'GT': 'Guatemala', 'GU': 'Guam',
  'GW': 'Gine-Bissau', 'GY': 'Guyana', 'HK': 'Hong Kong', 'HM': 'Heard Adası',
  'HN': 'Honduras', 'HR': 'Hırvatistan', 'HT': 'Haiti', 'HU': 'Macaristan',
  'ID': 'Endonezya', 'IE': 'İrlanda', 'IL': 'İsrail', 'IM': 'Man Adası',
  'IN': 'Hindistan', 'IO': 'Britanya Hint Okyanusu Toprakları', 'IQ': 'Irak',
  'IR': 'İran', 'IS': 'İzlanda', 'IT': 'İtalya', 'JE': 'Jersey', 'JM': 'Jamaika',
  'JO': 'Ürdün', 'JP': 'Japonya', 'KE': 'Kenya', 'KG': 'Kırgızistan',
  'KH': 'Kamboçya', 'KI': 'Kiribati', 'KM': 'Komorlar', 'KN': 'Saint Kitts ve Nevis',
  'KP': 'Kuzey Kore', 'KR': 'Güney Kore', 'KW': 'Kuveyt', 'KY': 'Cayman Adaları',
  'KZ': 'Kazakistan', 'LA': 'Laos', 'LB': 'Lübnan', 'LC': 'Saint Lucia',
  'LI': 'Lihtenştayn', 'LK': 'Sri Lanka', 'LR': 'Liberya', 'LS': 'Lesotho',
  'LT': 'Litvanya', 'LU': 'Lüksemburg', 'LV': 'Letonya', 'LY': 'Libya',
  'MA': 'Fas', 'MC': 'Monako', 'MD': 'Moldova', 'ME': 'Karadağ',
  'MF': 'Saint Martin', 'MG': 'Madagaskar', 'MH': 'Marshall Adaları',
  'MK': 'Kuzey Makedonya', 'ML': 'Mali', 'MM': 'Myanmar', 'MN': 'Moğolistan',
  'MO': 'Makao', 'MP': 'Kuzey Mariana Adaları', 'MQ': 'Martinik',
  'MR': 'Moritanya', 'MS': 'Montserrat', 'MT': 'Malta', 'MU': 'Mauritius',
  'MV': 'Maldivler', 'MW': 'Malavi', 'MX': 'Meksika', 'MY': 'Malezya',
  'MZ': 'Mozambik', 'NA': 'Namibya', 'NC': 'Yeni Kaledonya', 'NE': 'Nijer',
  'NF': 'Norfolk Adası', 'NG': 'Nijerya', 'NI': 'Nikaragua', 'NL': 'Hollanda',
  'NO': 'Norveç', 'NP': 'Nepal', 'NR': 'Nauru', 'NU': 'Niue',
  'NZ': 'Yeni Zelanda', 'OM': 'Umman', 'PA': 'Panama', 'PE': 'Peru',
  'PF': 'Fransız Polinezyası', 'PG': 'Papua Yeni Gine', 'PH': 'Filipinler',
  'PK': 'Pakistan', 'PL': 'Polonya', 'PM': 'Saint Pierre ve Miquelon',
  'PN': 'Pitcairn Adaları', 'PR': 'Porto Riko', 'PS': 'Filistin',
  'PT': 'Portekiz', 'PW': 'Palau', 'PY': 'Paraguay', 'QA': 'Katar',
  'RE': 'Réunion', 'RO': 'Romanya', 'RS': 'Sırbistan', 'RU': 'Rusya',
  'RW': 'Ruanda', 'SA': 'Suudi Arabistan', 'SB': 'Solomon Adaları',
  'SC': 'Seyşeller', 'SD': 'Sudan', 'SE': 'İsveç', 'SG': 'Singapur',
  'SH': 'Saint Helena', 'SI': 'Slovenya', 'SJ': 'Svalbard ve Jan Mayen',
  'SK': 'Slovakya', 'SL': 'Sierra Leone', 'SM': 'San Marino', 'SN': 'Senegal',
  'SO': 'Somali', 'SR': 'Surinam', 'SS': 'Güney Sudan',
  'ST': 'São Tomé ve Príncipe', 'SV': 'El Salvador', 'SX': 'Sint Maarten',
  'SY': 'Suriye', 'SZ': 'Esvatini', 'TC': 'Turks ve Caicos Adaları',
  'TD': 'Çad', 'TF': 'Fransız Güney Toprakları', 'TG': 'Togo', 'TH': 'Tayland',
  'TJ': 'Tacikistan', 'TK': 'Tokelau', 'TL': 'Doğu Timor', 'TM': 'Türkmenistan',
  'TN': 'Tunus', 'TO': 'Tonga', 'TR': 'Türkiye', 'TT': 'Trinidad ve Tobago',
  'TV': 'Tuvalu', 'TW': 'Tayvan', 'TZ': 'Tanzanya', 'UA': 'Ukrayna',
  'UG': 'Uganda', 'UM': 'ABD Küçük Dış Adaları', 'US': 'ABD', 'UY': 'Uruguay',
  'UZ': 'Özbekistan', 'VA': 'Vatikan', 'VC': 'Saint Vincent ve Grenadinler',
  'VE': 'Venezuela', 'VG': 'Britanya Virjin Adaları',
  'VI': 'ABD Virjin Adaları', 'VN': 'Vietnam', 'VU': 'Vanuatu',
  'WF': 'Wallis ve Futuna', 'WS': 'Samoa', 'XK': 'Kosova', 'YE': 'Yemen',
  'YT': 'Mayotte', 'ZA': 'Güney Afrika', 'ZM': 'Zambiya', 'ZW': 'Zimbabve',
};

/// Region names from the provider are free-form English ("Europe (40+ areas)",
/// "Singapore & Malaysia & Thailand", "Caribbean (20+ areas)"). Exact-match
/// dictionaries don't cover this — we run ordered substring replaces instead.
///
/// ORDER MATTERS: longer/composite phrases must come before their substrings
/// (e.g. "South America" before "America"; "Central Asia" before "Asia").
const List<List<String>> _regionReplacements = [
  // Composite geographic phrases (must precede their parts).
  ['Middle East & North Africa', 'Orta Doğu ve Kuzey Afrika'],
  ['Middle East and North Africa', 'Orta Doğu ve Kuzey Afrika'],
  ['Sub-Saharan Africa', 'Sahra Altı Afrika'],
  ['North America', 'Kuzey Amerika'],
  ['South America', 'Güney Amerika'],
  ['Latin America', 'Latin Amerika'],
  ['Central America', 'Orta Amerika'],
  ['Central Asia', 'Orta Asya'],
  ['Southeast Asia', 'Güneydoğu Asya'],
  ['South Asia', 'Güney Asya'],
  ['East Asia', 'Doğu Asya'],
  ['Asia Pacific', 'Asya Pasifik'],
  ['North Africa', 'Kuzey Afrika'],
  ['South Korea', 'Güney Kore'],
  ['North Korea', 'Kuzey Kore'],
  ['New Zealand', 'Yeni Zelanda'],
  ['South Africa', 'Güney Afrika'],
  ['Middle East', 'Orta Doğu'],
  ['Gulf Region', 'Körfez Bölgesi'],
  ['Hong Kong', 'Hong Kong'],

  // Single geographic terms.
  ['Europe', 'Avrupa'],
  ['Africa', 'Afrika'],
  ['Asia', 'Asya'],
  ['Americas', 'Amerika kıtaları'],
  ['America', 'Amerika'],
  ['Caribbean', 'Karayipler'],
  ['Oceania', 'Okyanusya'],
  ['Balkans', 'Balkanlar'],
  ['Nordic', 'İskandinavya'],
  ['Scandinavia', 'İskandinavya'],
  ['Baltic', 'Baltık'],
  ['Gulf', 'Körfez'],
  ['Global', 'Küresel'],
  ['Regional', 'Bölgesel'],
  ['Worldwide', 'Dünya geneli'],

  // Country tokens that appear in composite regional names.
  ['Ireland', 'İrlanda'],
  ['Slovenia', 'Slovenya'],
  ['Singapore', 'Singapur'],
  ['Malaysia', 'Malezya'],
  ['Thailand', 'Tayland'],
  ['Vietnam', 'Vietnam'],
  ['Indonesia', 'Endonezya'],
  ['Philippines', 'Filipinler'],
  ['Australia', 'Avustralya'],
  ['Canada', 'Kanada'],
  ['Japan', 'Japonya'],
  ['China', 'Çin'],
  ['Morocco', 'Fas'],
  ['Macao', 'Makao'],
  ['Macau', 'Makao'],
  ['USA', 'ABD'],
  ['UK', 'İngiltere'],

  // Counts and connectors.
  ['mainland', 'anakara'],
  ['areas', 'ülke'],
  ['countries', 'ülke'],
  ['country', 'ülke'],
];

/// Returns the localized country/region name. Falls back to the backend's
/// English name when we don't have a translation.
///
/// `locale` accepts a language code ('tr', 'en') — pass `context.locale.languageCode`.
String localizedCountryName({
  required String code,
  required String locale,
  required String fallback,
}) {
  if (locale != 'tr') return fallback;
  // Country: 2-letter ISO code.
  if (code.length == 2 && !code.startsWith('!')) {
    return _tr[code.toUpperCase()] ?? fallback;
  }
  // Region: apply ordered substring replacements over the provider's label.
  // Anything not in the dictionary passes through verbatim ("AUKUS", country
  // codes inside parens, numbers, etc.).
  var s = fallback.trim();
  for (final pair in _regionReplacements) {
    s = s.replaceAll(pair[0], pair[1]);
  }
  return s;
}
