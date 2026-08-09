// A QR is just a container, and most QRs in the world are not payments.
// Scoring a Wi-Fi config or a poster URL with a payee-risk model produces a
// confident number about a question nobody asked — and "Safe" on a phishing
// link would be actively harmful. These cases pin the refusal.

import { describe, expect, it } from 'vitest';

import { classifyQrPayload } from '../qrPayload';

describe('classifyQrPayload', () => {
  it('accepts a UPI payment intent', () => {
    const check = classifyQrPayload('upi://pay?pa=chaiwala.store@okaxis&pn=Chai%20Point&cu=INR');
    expect(check.kind).toBe('upi');
    expect(check.scorable).toBe(true);
  });

  it('accepts the opaque-path form and is case-insensitive about the scheme', () => {
    expect(classifyQrPayload('UPI:pay?pa=shop@oksbi').scorable).toBe(true);
  });

  it.each([
    ['a website link', 'https://example.com/offer?ref=poster', 'url'],
    ['an http link', 'http://bit.ly/3xKq2', 'url'],
    ['a Wi-Fi config', 'WIFI:S:CafeGuest;T:WPA;P:latte123;;', 'text'],
    ['a vCard', 'BEGIN:VCARD\nVERSION:3.0\nFN:Ramesh\nEND:VCARD', 'text'],
    ['plain text', 'TABLE 14', 'text'],
    ['an empty payload', '   ', 'empty'],
  ])('refuses %s', (_label, payload, kind) => {
    const check = classifyQrPayload(payload);
    expect(check.kind).toBe(kind);
    expect(check.scorable).toBe(false);
  });

  it('refuses a Bharat QR / EMVCo payload by name rather than mislabelling it', () => {
    // Payload-format-indicator tag 00, length 02, value 01 — the opening of
    // every static EMVCo QR.
    const check = classifyQrPayload('00020101021229180014in.gov.bharatqr');
    expect(check.kind).toBe('emvco');
    expect(check.scorable).toBe(false);
    expect(check.title).toMatch(/Bharat QR/i);
  });

  it('does not mistake a URL that merely mentions upi for a payment', () => {
    expect(classifyQrPayload('https://scam.example/upi/refund').scorable).toBe(false);
  });
});
