// Deterministic link rules — the second half of the link-risk design.
//
// The trained model only sees the host (see urlFeatures.ts for why). These rules
// read the WHOLE URL and cover what a host cannot show. They are not learned,
// which is the point: each one is a stated fact about the URL that can be
// checked by hand, and none of them depends on a training corpus that ages.
//
// The severities are what the engine acts on:
//   severe  a legitimate Indian bank or UPI app never does this
//   strong  overwhelmingly associated with fraud, occasionally innocent
//   mild    worth mentioning, never enough on its own

export type LinkRuleSeverity = 'severe' | 'strong' | 'mild';

export interface LinkRule {
  id: string;
  severity: LinkRuleSeverity;
  explanation: string;
}

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy',
  'shorturl.at', 'ow.ly', 'buff.ly', 't.ly', 'rebrand.ly', 'shorte.st',
  'tiny.cc', 'bl.ink', 'linktr.ee', 'wa.link',
]);

// TLDs that are free or near-free to register and consequently dominate
// throwaway phishing infrastructure.
const THROWAWAY_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'click', 'link', 'rest', 'zip',
  'mov', 'country', 'kim', 'work', 'quest', 'cyou', 'sbs', 'icu',
]);

const DYNAMIC_DNS = [
  'duckdns.org', 'no-ip.org', 'no-ip.com', 'ddns.net', 'hopto.org',
  'serveo.net', 'ngrok.io', 'trycloudflare.com', 'loca.lt',
];

import { BRAND_TOKENS, hostOf, registrableParts } from './urlFeatures';

export function detectLinkRules(rawUrl: string): LinkRule[] {
  const url = rawUrl.trim();
  const lower = url.toLowerCase();
  const host = hostOf(url);
  const [domain, tld] = registrableParts(host);
  const rules: LinkRule[] = [];

  // --- severe --------------------------------------------------------------

  // The end state of the "download our bank app" call. A real bank app comes
  // from the Play Store, never from a link in a message.
  if (/\.apk([?#]|$)/i.test(lower)) {
    rules.push({
      id: 'apk_download',
      severity: 'severe',
      explanation:
        'This link downloads an Android app (.apk) directly. No bank or UPI app is ever distributed this way — installing it hands over your device.',
    });
  }

  if (/\.(exe|msi|scr|bat|apk\.\w+)([?#]|$)/i.test(lower)) {
    rules.push({
      id: 'executable_download',
      severity: 'severe',
      explanation: 'This link downloads a program file, not a web page.',
    });
  }

  // https://sbi.co.in@evil.tld — everything before the '@' is ignored by the
  // browser, so the visible "brand" is decoration.
  const authority = authorityOf(url);
  if (authority.includes('@')) {
    rules.push({
      id: 'userinfo_trick',
      severity: 'severe',
      explanation: `The part before the "@" is ignored by your browser — this link actually goes to ${host}, not to what appears in front of it.`,
    });
  }

  // --- strong --------------------------------------------------------------

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
    rules.push({
      id: 'ip_literal_host',
      severity: 'strong',
      explanation:
        'The link points at a raw IP address instead of a domain name. Legitimate services use a name.',
    });
  }

  if (host.includes('xn--')) {
    rules.push({
      id: 'punycode_host',
      severity: 'strong',
      explanation:
        'The address uses look-alike characters from another alphabet, a technique for imitating a real domain.',
    });
  }

  const brand = BRAND_TOKENS.find((token) => lower.includes(token) && domain !== token);
  if (brand) {
    rules.push({
      id: 'brand_mismatch',
      severity: 'strong',
      explanation: `The link mentions "${brand}" but the actual site is ${domain || host}, which is not that brand's domain.`,
    });
  }

  if (DYNAMIC_DNS.some((suffix) => host === suffix || host.endsWith('.' + suffix))) {
    rules.push({
      id: 'dynamic_dns',
      severity: 'strong',
      explanation:
        'Hosted on a free dynamic-DNS service, which is how throwaway phishing pages are usually served.',
    });
  }

  // --- mild ----------------------------------------------------------------

  if (SHORTENERS.has(host)) {
    rules.push({
      id: 'shortener',
      severity: 'mild',
      explanation:
        'This is a shortened link, so its real destination is hidden. We will not open it to find out — that would tell the sender you received the message.',
    });
  }

  if (THROWAWAY_TLDS.has(tld.split('.').slice(-1)[0])) {
    rules.push({
      id: 'throwaway_tld',
      severity: 'mild',
      explanation: `".${tld}" domains are free or near-free to register and are heavily used for short-lived scam pages.`,
    });
  }

  if (/^http:\/\//i.test(lower)) {
    rules.push({
      id: 'no_https',
      severity: 'mild',
      explanation: 'The link is not encrypted (http, not https).',
    });
  }

  const port = portOf(url);
  if (port && port !== '80' && port !== '443') {
    rules.push({
      id: 'nonstandard_port',
      severity: 'mild',
      explanation: `The link connects on port ${port} rather than a normal web port.`,
    });
  }

  return rules;
}

/** Whether the destination is unknowable without following the link. */
export function isOpaqueDestination(rules: LinkRule[]): boolean {
  return rules.some((rule) => rule.id === 'shortener');
}

function authorityOf(url: string): string {
  let value = url.trim();
  const scheme = value.indexOf('://');
  if (scheme !== -1) value = value.slice(scheme + 3);
  for (const terminator of ['/', '?', '#']) {
    const cut = value.indexOf(terminator);
    if (cut !== -1) value = value.slice(0, cut);
  }
  return value;
}

function portOf(url: string): string | null {
  const authority = authorityOf(url);
  const afterUserinfo = authority.slice(authority.lastIndexOf('@') + 1);
  if (afterUserinfo.startsWith('[')) {
    const end = afterUserinfo.indexOf(']');
    const rest = end === -1 ? '' : afterUserinfo.slice(end + 1);
    return rest.startsWith(':') && /^\d+$/.test(rest.slice(1)) ? rest.slice(1) : null;
  }
  const colon = afterUserinfo.lastIndexOf(':');
  if (colon === -1) return null;
  const candidate = afterUserinfo.slice(colon + 1);
  return /^\d+$/.test(candidate) ? candidate : null;
}
