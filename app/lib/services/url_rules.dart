import 'url_features.dart';

/// Deterministic link rules — the second half of the link-risk design, and the
/// Dart mirror of web/src/lib/risk/urlRules.ts.
///
/// The trained model only sees the host (see url_features.dart for why). These
/// rules read the WHOLE URL and cover what a host cannot show. They are not
/// learned, which is the point: each one is a stated fact about the URL that a
/// person can check by hand, and none of them depends on a training corpus that
/// ages.
enum LinkRuleSeverity {
  /// A legitimate Indian bank or UPI app never does this.
  severe,

  /// Overwhelmingly associated with fraud, occasionally innocent.
  strong,

  /// Worth mentioning, never enough on its own.
  mild,
}

class LinkRule {
  final String id;
  final LinkRuleSeverity severity;
  final String explanation;

  const LinkRule({
    required this.id,
    required this.severity,
    required this.explanation,
  });
}

const Set<String> _shorteners = {
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy',
  'shorturl.at', 'ow.ly', 'buff.ly', 't.ly', 'rebrand.ly', 'shorte.st',
  'tiny.cc', 'bl.ink', 'linktr.ee', 'wa.link',
};

/// TLDs that are free or near-free to register, and consequently dominate
/// throwaway phishing infrastructure.
const Set<String> _throwawayTlds = {
  'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click', 'link', 'rest', 'zip',
  'mov', 'country', 'kim', 'work', 'quest', 'cyou', 'sbs', 'icu',
};

const List<String> _dynamicDns = [
  'duckdns.org', 'no-ip.org', 'no-ip.com', 'ddns.net', 'hopto.org',
  'serveo.net', 'ngrok.io', 'trycloudflare.com', 'loca.lt',
];

final _apkDownload = RegExp(r'\.apk([?#]|$)', caseSensitive: false);
final _executable = RegExp(r'\.(exe|msi|scr|bat)([?#]|$)', caseSensitive: false);
final _ipv4Host = RegExp(r'^\d{1,3}(\.\d{1,3}){3}$');
final _httpScheme = RegExp(r'^http://', caseSensitive: false);
final _allDigits = RegExp(r'^\d+$');

List<LinkRule> detectLinkRules(String rawUrl) {
  final url = rawUrl.trim();
  final lower = url.toLowerCase();
  final host = hostOf(url);
  final parts = registrableParts(host);
  final rules = <LinkRule>[];

  // --- severe ---------------------------------------------------------------

  // The end state of the "download our bank app" call. A real bank app comes
  // from the Play Store, never from a link in a message.
  if (_apkDownload.hasMatch(lower)) {
    rules.add(const LinkRule(
      id: 'apk_download',
      severity: LinkRuleSeverity.severe,
      explanation:
          'This link downloads an Android app (.apk) directly. No bank or UPI app is ever distributed this way — installing it hands over your device.',
    ));
  }

  if (_executable.hasMatch(lower)) {
    rules.add(const LinkRule(
      id: 'executable_download',
      severity: LinkRuleSeverity.severe,
      explanation: 'This link downloads a program file, not a web page.',
    ));
  }

  // https://sbi.co.in@evil.tld — everything before the '@' is ignored by the
  // browser, so the visible "brand" is decoration.
  if (_authorityOf(url).contains('@')) {
    rules.add(LinkRule(
      id: 'userinfo_trick',
      severity: LinkRuleSeverity.severe,
      explanation:
          'The part before the "@" is ignored by your phone — this link actually goes to $host, not to what appears in front of it.',
    ));
  }

  // --- strong ---------------------------------------------------------------

  if (_ipv4Host.hasMatch(host) || host.startsWith('[')) {
    rules.add(const LinkRule(
      id: 'ip_literal_host',
      severity: LinkRuleSeverity.strong,
      explanation:
          'The link points at a raw IP address instead of a domain name. Legitimate services use a name.',
    ));
  }

  if (host.contains('xn--')) {
    rules.add(const LinkRule(
      id: 'punycode_host',
      severity: LinkRuleSeverity.strong,
      explanation:
          'The address uses look-alike characters from another alphabet, a technique for imitating a real domain.',
    ));
  }

  final brand = kBrandTokens
      .cast<String?>()
      .firstWhere((t) => lower.contains(t!) && parts.domain != t, orElse: () => null);
  if (brand != null) {
    rules.add(LinkRule(
      id: 'brand_mismatch',
      severity: LinkRuleSeverity.strong,
      explanation:
          'The link mentions "$brand" but the actual site is ${parts.domain.isEmpty ? host : parts.domain}, which is not that brand\'s domain.',
    ));
  }

  if (_dynamicDns.any((s) => host == s || host.endsWith('.$s'))) {
    rules.add(const LinkRule(
      id: 'dynamic_dns',
      severity: LinkRuleSeverity.strong,
      explanation:
          'Hosted on a free dynamic-DNS service, which is how throwaway phishing pages are usually served.',
    ));
  }

  // --- mild -----------------------------------------------------------------

  if (_shorteners.contains(host)) {
    rules.add(const LinkRule(
      id: 'shortener',
      severity: LinkRuleSeverity.mild,
      explanation:
          'This is a shortened link, so its real destination is hidden. We will not open it to find out — that would tell the sender you received the message.',
    ));
  }

  if (_throwawayTlds.contains(parts.tld.split('.').last)) {
    rules.add(LinkRule(
      id: 'throwaway_tld',
      severity: LinkRuleSeverity.mild,
      explanation:
          '".${parts.tld}" domains are free or near-free to register and are heavily used for short-lived scam pages.',
    ));
  }

  if (_httpScheme.hasMatch(lower)) {
    rules.add(const LinkRule(
      id: 'no_https',
      severity: LinkRuleSeverity.mild,
      explanation: 'The link is not encrypted (http, not https).',
    ));
  }

  final port = _portOf(url);
  if (port != null && port != '80' && port != '443') {
    rules.add(LinkRule(
      id: 'nonstandard_port',
      severity: LinkRuleSeverity.mild,
      explanation:
          'The link connects on port $port rather than a normal web port.',
    ));
  }

  return rules;
}

/// Whether the destination is unknowable without following the link.
bool isOpaqueDestination(List<LinkRule> rules) =>
    rules.any((rule) => rule.id == 'shortener');

String _authorityOf(String url) {
  var value = url.trim();
  final scheme = value.indexOf('://');
  if (scheme != -1) value = value.substring(scheme + 3);
  for (final terminator in ['/', '?', '#']) {
    final cut = value.indexOf(terminator);
    if (cut != -1) value = value.substring(0, cut);
  }
  return value;
}

String? _portOf(String url) {
  final authority = _authorityOf(url);
  final afterUserinfo = authority.substring(authority.lastIndexOf('@') + 1);

  if (afterUserinfo.startsWith('[')) {
    final end = afterUserinfo.indexOf(']');
    final rest = end == -1 ? '' : afterUserinfo.substring(end + 1);
    if (rest.startsWith(':') && _allDigits.hasMatch(rest.substring(1))) {
      return rest.substring(1);
    }
    return null;
  }

  final colon = afterUserinfo.lastIndexOf(':');
  if (colon == -1) return null;
  final candidate = afterUserinfo.substring(colon + 1);
  return _allDigits.hasMatch(candidate) ? candidate : null;
}
