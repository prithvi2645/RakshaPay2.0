// Direct port of app/lib/services/sender_reputation.dart.
//
// Indian commercial SMS must go out through a TRAI/DLT-registered header —
// `VM-HDFCBK`, `AD-SBIINB`, `JD-PAYTM` and so on: a 2-character operator
// prefix, a separator, then the registered sender ID. Getting a header requires
// a registered business entity, so fraudsters overwhelmingly send from ordinary
// 10-digit mobile numbers instead.
//
// This is the single most useful non-text signal available: a text model
// trained on general spam over-flags Indian transactional SMS (bank alerts,
// OTPs, recharge offers) because that traffic reads like marketing. Knowing the
// sender is a registered business is what keeps it out of the alert list.

export type SenderTrust = 'registeredBusiness' | 'personalNumber' | 'unknown';

const DLT_HEADER = /^[A-Z]{2}[-_][A-Z0-9]{5,9}$/;
const BARE_HEADER = /^[A-Z]{5,9}$/;
const MOBILE_NUMBER = /^(\+?91)?[6-9]\d{9}$/;

export function classifySender(sender?: string | null): SenderTrust {
  if (!sender || sender.trim().length === 0) return 'unknown';
  const s = sender.trim().toUpperCase().replaceAll(' ', '');

  if (MOBILE_NUMBER.test(s)) return 'personalNumber';
  if (DLT_HEADER.test(s) || BARE_HEADER.test(s)) return 'registeredBusiness';
  return 'unknown';
}

/**
 * Multiplier applied to the model's scam probability. A registered sender is
 * heavily discounted — the header is very hard to forge. A personal number gets
 * a mild boost, since most real UPI fraud arrives that way.
 */
export function senderRiskMultiplier(trust: SenderTrust): number {
  switch (trust) {
    case 'registeredBusiness':
      return 0.25;
    case 'personalNumber':
      return 1.15;
    case 'unknown':
      return 1.0;
  }
}

export function describeSender(trust: SenderTrust): string {
  switch (trust) {
    case 'registeredBusiness':
      return 'Sent from a registered business SMS header';
    case 'personalNumber':
      return 'Sent from a personal mobile number, not a registered business';
    case 'unknown':
      return 'Sender could not be verified';
  }
}
