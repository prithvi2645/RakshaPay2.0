import 'dart:math';

/// Host features for the link-risk model — the Dart half of
/// ml/src/url_features.py.
///
/// The trained model reads the **host only**. That is a guard, not a
/// simplification: the malicious feeds (URLhaus, OpenPhish) publish full URLs
/// with long paths while the benign reference (Tranco) publishes bare domains,
/// so a path-aware model trained on them learns "has a path => malicious",
/// scores ~99%, and collapses on the first real benign URL with a path.
///
/// What a host cannot show — `.apk` downloads, the `@`-in-authority trick,
/// brand names in the path — is handled by the deterministic rules in
/// url_rules.dart instead. Those need no training data and each one is
/// defensible on its own.
///
/// [kUrlFeatures] order is part of the model artifact: the ONNX graph indexes
/// positionally, so a reordering here silently feeds entropy into the
/// digit-ratio slot. app/test/url_features_test.dart pins every value to the
/// Python implementation via the shared fixture file.
const List<String> kUrlFeatures = [
  'host_len',
  'num_labels',
  'num_hyphens',
  'digit_ratio',
  'max_label_len',
  'domain_entropy',
  'is_ip_literal',
  'has_punycode',
  'is_common_tld',
  'tld_len',
  'brand_token_present',
  'has_suspicious_word',
];

/// Public suffixes that are two labels deep, so "example.co.in" reduces to
/// "example" rather than "co". Not the full Mozilla PSL — the handful that
/// matter for Indian and common international traffic, kept short because it is
/// reimplemented identically in Python and TypeScript.
const Set<String> kTwoLevelSuffixes = {
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'gov.in', 'ac.in',
  'edu.in', 'res.in', 'nic.in', 'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.au',
  'net.au', 'org.au', 'co.jp', 'co.kr', 'com.br', 'com.sg', 'com.my', 'co.za',
  'com.cn', 'com.hk', 'co.id', 'com.pk', 'com.bd', 'com.np',
};

const Set<String> kCommonTlds = {
  'com', 'org', 'net', 'in', 'io', 'gov', 'edu', 'co', 'uk', 'de', 'fr', 'jp',
  'au', 'ca', 'nl', 'se', 'es', 'it', 'br', 'ru', 'info', 'biz', 'app', 'dev',
};

/// Indian bank / UPI brand tokens. A host containing one of these without being
/// that brand's real domain is the classic phishing shape:
/// `sbi.secure-verify.xyz`.
const List<String> kBrandTokens = [
  'sbi', 'hdfc', 'icici', 'axis', 'kotak', 'pnb', 'bob', 'canara', 'unionbank',
  'paytm', 'phonepe', 'gpay', 'googlepay', 'bhim', 'upi', 'npci', 'rbi',
  'amazonpay', 'mobikwik', 'freecharge', 'yesbank', 'idfc', 'indusind',
];

const List<String> kSuspiciousWords = [
  'login', 'signin', 'secure', 'verify', 'verification', 'update', 'account',
  'kyc', 'refund', 'reward', 'cashback', 'wallet', 'recover', 'unlock',
  'confirm', 'support', 'helpdesk',
];

final _ipv4 = RegExp(r'^\d{1,3}(\.\d{1,3}){3}$');
final _digit = RegExp(r'\d');
final _allDigits = RegExp(r'^\d+$');
final _urlInText = RegExp(r'\bhttps?://[^\s<>"' r"')\]]+", caseSensitive: false);
final _trailingPunctuation = RegExp(r'[.,;:!?]+$');

double shannonEntropy(String s) {
  if (s.isEmpty) return 0;
  final freq = <String, int>{};
  for (final ch in s.split('')) {
    freq[ch] = (freq[ch] ?? 0) + 1;
  }
  var entropy = 0.0;
  for (final count in freq.values) {
    final p = count / s.length;
    entropy -= p * (log(p) / ln2);
  }
  return entropy;
}

/// Host portion of a URL — lowercased, without scheme, userinfo, or port.
///
/// Hand-rolled rather than using [Uri], because Python, Dart and JavaScript URL
/// parsers disagree on malformed input, and malformed input is most of what a
/// phishing feed contains. All three ports implement exactly these steps.
String hostOf(String url) {
  var value = url.trim();

  final scheme = value.indexOf('://');
  if (scheme != -1) value = value.substring(scheme + 3);

  for (final terminator in ['/', '?', '#']) {
    final cut = value.indexOf(terminator);
    if (cut != -1) value = value.substring(0, cut);
  }

  // The host is what follows the LAST '@' — exactly the trick
  // "https://sbi.co.in@evil.tld" relies on.
  final at = value.lastIndexOf('@');
  if (at != -1) value = value.substring(at + 1);

  if (value.startsWith('[')) {
    final end = value.indexOf(']');
    if (end != -1) return value.substring(0, end + 1).toLowerCase();
  }

  final colon = value.lastIndexOf(':');
  if (colon != -1 && _allDigits.hasMatch(value.substring(colon + 1))) {
    value = value.substring(0, colon);
  }

  return _stripDots(value.toLowerCase());
}

String _stripDots(String value) {
  var start = 0;
  var end = value.length;
  while (start < end && value[start] == '.') {
    start++;
  }
  while (end > start && value[end - 1] == '.') {
    end--;
  }
  return value.substring(start, end);
}

/// `shop.example.co.in` -> `('example', 'co.in')`.
({String domain, String tld}) registrableParts(String host) {
  final labels = host.split('.').where((l) => l.isNotEmpty).toList();
  if (labels.length < 2) {
    return (domain: labels.isEmpty ? '' : labels.first, tld: '');
  }

  final lastTwo = labels.sublist(labels.length - 2).join('.');
  if (labels.length >= 3 && kTwoLevelSuffixes.contains(lastTwo)) {
    return (domain: labels[labels.length - 3], tld: lastTwo);
  }
  return (domain: labels[labels.length - 2], tld: labels.last);
}

/// Host-only features, keyed by the names in [kUrlFeatures].
Map<String, double> extractUrlFeatures(String url) {
  final host = hostOf(url);
  final labels = host.split('.').where((l) => l.isNotEmpty).toList();
  final parts = registrableParts(host);

  final isIp = _ipv4.hasMatch(host) || host.startsWith('[');
  final digits = _digit.allMatches(host).length;

  // A brand token counts only when the host is NOT that brand's own domain:
  // `sbi.co.in` must not fire, `sbi.secure-verify.xyz` must.
  final brandPresent =
      kBrandTokens.any((token) => host.contains(token) && parts.domain != token);

  return {
    'host_len': host.length.toDouble(),
    'num_labels': labels.length.toDouble(),
    'num_hyphens': '-'.allMatches(host).length.toDouble(),
    'digit_ratio': host.isEmpty ? 0 : digits / host.length,
    'max_label_len':
        labels.isEmpty ? 0 : labels.map((l) => l.length).reduce(max).toDouble(),
    'domain_entropy': shannonEntropy(parts.domain),
    'is_ip_literal': isIp ? 1 : 0,
    'has_punycode': host.contains('xn--') ? 1 : 0,
    'is_common_tld': kCommonTlds.contains(parts.tld.split('.').last) ? 1 : 0,
    'tld_len': parts.tld.length.toDouble(),
    'brand_token_present': brandPresent ? 1 : 0,
    'has_suspicious_word':
        kSuspiciousWords.any((word) => host.contains(word)) ? 1 : 0,
  };
}

/// Feature vector in [kUrlFeatures] order — the model input.
List<double> urlFeaturesToModelInput(Map<String, double> features) =>
    kUrlFeatures.map((name) => features[name] ?? 0).toList();

/// Pulls http(s) URLs out of free text — an SMS body, a QR payload.
List<String> extractUrls(String text) => _urlInText
    .allMatches(text)
    .map((m) => m[0]!.replaceAll(_trailingPunctuation, ''))
    .toList();
