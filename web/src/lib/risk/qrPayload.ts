// What a decoded QR actually contains.
//
// A QR is just a container. Most of the ones people photograph are Wi-Fi
// configs, vCards, website links, or a poster's marketing URL — and running a
// UPI payee-risk model over any of those produces a confident-looking number
// about nothing. Worse, "Safe" on a phishing link would be actively harmful,
// because the model was never asked about the link.
//
// So the payload is classified BEFORE it reaches the risk engine, and anything
// that is not a UPI payment intent is refused with a reason rather than scored.
//
// This gate lives in the UI layer, not in RiskEngine: the engine stays a
// character-for-character match with the Dart one (a non-UPI payload there
// still yields "This is not a standard UPI payment QR"), so the parity tests
// keep meaning what they say. The Android scanner should grow the same gate.

export type QrPayloadKind = 'upi' | 'emvco' | 'url' | 'empty' | 'text';

export interface QrPayloadCheck {
  kind: QrPayloadKind;
  /** Only a UPI payment intent can be scored as a payment. */
  scorable: boolean;
  title: string;
  detail: string;
}

// Static EMVCo / Bharat QR payloads are TLV strings that always open with the
// payload-format-indicator tag: "00" length "02" value "01".
const EMVCO_PREFIX = /^000201/;

export function classifyQrPayload(raw: string): QrPayloadCheck {
  const payload = raw.trim();

  if (payload.length === 0) {
    return {
      kind: 'empty',
      scorable: false,
      title: 'Nothing to check',
      detail: 'The QR decoded to an empty string, which no payment app would accept either.',
    };
  }

  if (/^upi:/i.test(payload)) {
    return {
      kind: 'upi',
      scorable: true,
      title: 'UPI payment QR',
      detail: 'A UPI payment intent — this is what RakshaPay scores.',
    };
  }

  if (EMVCO_PREFIX.test(payload)) {
    return {
      kind: 'emvco',
      scorable: false,
      title: 'This is a Bharat QR / EMVCo code, not a UPI intent QR',
      detail:
        'It carries card and account data in a different format. RakshaPay scores UPI payee identifiers, and it has no payee ID to read here — so it will not guess a score for it.',
    };
  }

  if (/^https?:\/\//i.test(payload)) {
    return {
      kind: 'url',
      scorable: false,
      title: 'This QR is a website link, not a payment',
      detail:
        'Nothing is being requested from your UPI account by this code. A link can still be dangerous, but the payee model was never trained to judge one, and a "Safe" verdict here would be a verdict about a question we did not ask.',
    };
  }

  return {
    kind: 'text',
    scorable: false,
    title: 'This QR does not contain a payment',
    detail:
      'It decoded to plain text — Wi-Fi details, a contact card, a tracking code or similar. There is no payee to score.',
  };
}
