// Direct port of ml/src/url_features.py.
//
// The trained link model reads the HOST only. That is a guard, not a
// simplification: the malicious feeds (URLhaus, OpenPhish) supply full URLs with
// long paths while the benign reference (Tranco) supplies bare domains, so a
// path-aware model trained on them learns "has a path => malicious", scores
// ~99%, and collapses on the first real benign URL with a path.
//
// Path-level signals — .apk downloads, `@` authority tricks, brand names in the
// path — live in urlRules.ts as deterministic rules instead. They need no
// training data and each is defensible on its own.
//
// FEATURES order is part of the model artifact. __tests__/urlFeatures.test.ts
// pins every value here to ml/src/export_url_fixtures.py output.

export const URL_FEATURES = [
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
] as const;

export type UrlFeatureName = (typeof URL_FEATURES)[number];
export type UrlFeatures = Record<UrlFeatureName, number>;

// Not the full Mozilla public suffix list — the handful that matter for Indian
// and common international traffic, kept short because it is reimplemented
// identically in Python and Dart.
const TWO_LEVEL_SUFFIXES = new Set([
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'gov.in', 'ac.in',
  'edu.in', 'res.in', 'nic.in', 'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.au',
  'net.au', 'org.au', 'co.jp', 'co.kr', 'com.br', 'com.sg', 'com.my', 'co.za',
  'com.cn', 'com.hk', 'co.id', 'com.pk', 'com.bd', 'com.np',
]);

const COMMON_TLDS = new Set([
  'com', 'org', 'net', 'in', 'io', 'gov', 'edu', 'co', 'uk', 'de', 'fr', 'jp',
  'au', 'ca', 'nl', 'se', 'es', 'it', 'br', 'ru', 'info', 'biz', 'app', 'dev',
]);

export const BRAND_TOKENS = [
  'sbi', 'hdfc', 'icici', 'axis', 'kotak', 'pnb', 'bob', 'canara', 'unionbank',
  'paytm', 'phonepe', 'gpay', 'googlepay', 'bhim', 'upi', 'npci', 'rbi',
  'amazonpay', 'mobikwik', 'freecharge', 'yesbank', 'idfc', 'indusind',
];

const SUSPICIOUS_WORDS = [
  'login', 'signin', 'secure', 'verify', 'verification', 'update', 'account',
  'kyc', 'refund', 'reward', 'cashback', 'wallet', 'recover', 'unlock',
  'confirm', 'support', 'helpdesk',
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of text.split('')) counts.set(ch, (counts.get(ch) ?? 0) + 1);

  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    entropy -= p * (Math.log(p) / Math.LN2);
  }
  return entropy;
}

/**
 * Host portion of a URL — lowercased, no scheme, userinfo, or port.
 *
 * Hand-rolled rather than using `URL`, because Python, Dart and JS URL parsers
 * disagree on malformed input, and malformed input is most of what a phishing
 * feed contains. All three ports implement exactly these steps.
 */
export function hostOf(url: string): string {
  let value = url.trim();

  const scheme = value.indexOf('://');
  if (scheme !== -1) value = value.slice(scheme + 3);

  for (const terminator of ['/', '?', '#']) {
    const cut = value.indexOf(terminator);
    if (cut !== -1) value = value.slice(0, cut);
  }

  // The host is what follows the LAST '@' — precisely the trick
  // "https://sbi.co.in@evil.tld" depends on.
  const at = value.lastIndexOf('@');
  if (at !== -1) value = value.slice(at + 1);

  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end !== -1) return value.slice(0, end + 1).toLowerCase();
  }

  const colon = value.lastIndexOf(':');
  if (colon !== -1 && value.slice(colon + 1).length > 0 && /^\d+$/.test(value.slice(colon + 1))) {
    value = value.slice(0, colon);
  }

  return stripDots(value.toLowerCase());
}

function stripDots(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '.') start++;
  while (end > start && value[end - 1] === '.') end--;
  return value.slice(start, end);
}

/** `shop.example.co.in` → `['example', 'co.in']`. */
export function registrableParts(host: string): [string, string] {
  const labels = host.split('.').filter((label) => label.length > 0);
  if (labels.length < 2) return [labels[0] ?? '', ''];

  const lastTwo = labels.slice(-2).join('.');
  if (labels.length >= 3 && TWO_LEVEL_SUFFIXES.has(lastTwo)) {
    return [labels[labels.length - 3], lastTwo];
  }
  return [labels[labels.length - 2], labels[labels.length - 1]];
}

export function extractUrlFeatures(url: string): UrlFeatures {
  const host = hostOf(url);
  const labels = host.split('.').filter((label) => label.length > 0);
  const [domain, tld] = registrableParts(host);

  const isIp = IPV4.test(host) || host.startsWith('[');
  const digits = (host.match(/\d/g) ?? []).length;

  // A brand token counts only when the host is NOT that brand's own domain:
  // `sbi.co.in` must not fire, `sbi.secure-verify.xyz` must.
  const brandPresent = BRAND_TOKENS.some((token) => host.includes(token) && domain !== token);

  return {
    host_len: host.length,
    num_labels: labels.length,
    num_hyphens: (host.match(/-/g) ?? []).length,
    digit_ratio: host.length > 0 ? digits / host.length : 0,
    max_label_len: labels.reduce((max, label) => Math.max(max, label.length), 0),
    domain_entropy: shannonEntropy(domain),
    is_ip_literal: isIp ? 1 : 0,
    has_punycode: host.includes('xn--') ? 1 : 0,
    is_common_tld: COMMON_TLDS.has(tld.split('.').slice(-1)[0]) ? 1 : 0,
    tld_len: tld.length,
    brand_token_present: brandPresent ? 1 : 0,
    has_suspicious_word: SUSPICIOUS_WORDS.some((word) => host.includes(word)) ? 1 : 0,
  };
}

export function urlFeaturesToModelInput(features: UrlFeatures): number[] {
  return URL_FEATURES.map((name) => features[name]);
}

/** Pulls http(s) URLs out of free text — an SMS body, a QR payload. */
export function extractUrls(text: string): string[] {
  const matches = text.match(/\bhttps?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return matches.map((url) => url.replace(/[.,;:!?]+$/, ''));
}
