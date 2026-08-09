// Direct port of app/lib/services/fraud_signals.dart.
//
// Concrete fraud "asks" — the things a scam needs you to actually *do*.
//
// The text model alone conflates marketing with fraud, because promotional
// language and scam language overlap heavily. A recharge offer and a fake
// refund read similarly; what separates them is that the scam asks you to hand
// over a PIN, act on a threat, or install remote-access software.
//
// RakshaPay is a fraud shield, not a spam filter. A message with no ask is at
// most noise, and noise must not raise an alert — every false alarm makes the
// next real warning easier to ignore.
//
// The patterns below must stay character-for-character equivalent to the Dart
// ones; src/lib/risk/__tests__/engine.test.ts pins the two implementations to
// the same shared expectations.

export type FraudSignalKind = 'credentialRequest' | 'threat' | 'remoteAccess' | 'paymentTrap';

export interface FraudSignal {
  kind: FraudSignalKind;
  phrase: string;
  explanation: string;
}

// Patterns, not literal substrings. Scam wording varies constantly — "share
// your OTP", "share the OTP", "send me OTP" are the same ask, and a literal
// list misses all but the exact phrasing it was written for.
const CREDENTIAL_ASKS = [
  /\b(share|send|tell|give|provide|forward)\b.{0,25}\b(otp|pin|cvv|password|code)\b/,
  /\b(otp|pin|cvv|password)\b.{0,25}\b(share|send|tell|give|provide|forward)\b/,
  /\bupi\s*pin\b/,
  /\benter\b.{0,20}\b(pin|otp|cvv|password)\b/,
  /\b(atm|debit|credit)\s*card\s*(number|pin|details)\b/,
  /\bnet\s*banking\s*password\b/,
];

const THREATS = [
  /\b(account|card|sim|kyc|service)\b.{0,30}\b(block|suspend|deactivat|clos|expir|terminat)/,
  /\b(block|suspend|deactivat|clos|expir)\w*\b.{0,30}\b(account|card|sim|kyc|service)\b/,
  /\b(update|complete|verify|renew)\b.{0,20}\bkyc\b/,
  /\bkyc\b.{0,25}\b(pending|expire|update|required|incomplete)/,
  /\b(enforcement directorate|cbi|police case|arrest|digital arrest)\b/,
];

const REMOTE_ACCESS = [
  /\b(anydesk|teamviewer|quicksupport|quick\s*support|airdroid|vysor)\b/,
  /\b(share|mirror|show)\b.{0,15}\bscreen\b/,
  /\bscreen\s*(share|sharing|mirror)\b/,
];

const PAYMENT_TRAPS = [
  /\baccept\b.{0,30}\b(collect|payment)?\s*request\b/,
  /\bscan\b.{0,25}\b(receive|get|claim|collect)\b/,
  /\b(pay|send|transfer)\b.{0,30}\b(to\s+)?(receive|claim|unlock|release)\b/,
  /\bprocessing\s*fee\b/,
  /\bsent\b.{0,25}\bby\s*mistake\b/,
  /\brefund\b.{0,30}\b(pay|fee|charge)\b/,
  /\bcustoms\s*duty\b/,
];

const GROUPS: Array<{ patterns: RegExp[]; kind: FraudSignalKind; explanation: string }> = [
  {
    patterns: CREDENTIAL_ASKS,
    kind: 'credentialRequest',
    explanation: 'Asks for a PIN, OTP or card detail — no genuine service ever does',
  },
  {
    patterns: THREATS,
    kind: 'threat',
    explanation: 'Threatens to block your account or invokes legal authority to rush you',
  },
  {
    patterns: REMOTE_ACCESS,
    kind: 'remoteAccess',
    explanation: 'Wants you to install remote-access software that hands over your phone',
  },
  {
    patterns: PAYMENT_TRAPS,
    kind: 'paymentTrap',
    explanation: 'Asks you to pay or approve a request in order to *receive* money',
  },
];

/** At most one signal per kind, in the same order as the Dart implementation. */
export function detectFraudSignals(text: string): FraudSignal[] {
  const lower = text.toLowerCase();
  const found: FraudSignal[] = [];

  for (const group of GROUPS) {
    for (const pattern of group.patterns) {
      const match = pattern.exec(lower);
      if (match) {
        found.push({ kind: group.kind, phrase: match[0] ?? '', explanation: group.explanation });
        break;
      }
    }
  }

  return found;
}

export function hasActionableAsk(text: string): boolean {
  return detectFraudSignals(text).length > 0;
}

export const SIGNAL_LABEL: Record<FraudSignalKind, string> = {
  credentialRequest: 'Credential request',
  threat: 'Threat / urgency',
  remoteAccess: 'Remote access',
  paymentTrap: 'Payment trap',
};
