"""Emit reference host-feature vectors from the Python extractor.

The link model ships as one ONNX file that both clients run, so the model itself
cannot drift. What CAN drift is feature extraction, which is reimplemented in
Dart and in TypeScript — and a wrong value there produces a plausible score
rather than an error.

These fixtures pin every feature of every case to the Python implementation, so
both ports fail loudly on any divergence. The URLs deliberately include the
awkward shapes real feeds are full of: userinfo '@' tricks, ports, punycode,
IPv4 and IPv6 literals, two-level public suffixes, and hosts carrying a bank
brand token.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from url_features import FEATURES, extract, host_of  # noqa: E402

CASES = [
    "https://www.sbi.co.in/personal-banking",
    "http://sbi.secure-verify-kyc.xyz/login",
    "https://sbi.co.in@evil-domain.tk/steal",
    "http://192.168.14.201:8080/gate.php",
    "https://[2001:db8::1]/payload",
    "https://xn--80ak6aa92e.com/",
    "https://amazon.in/orders",
    "http://bit.ly/3xKq2",
    "https://rbi-refund-portal.online/claim",
    "https://update-account-paytm.duckdns.org/verify",
    "https://a1b2c3d4e5f6g7.top/",
    "https://mail.google.com/mail/u/0",
    "https://phonepe.com",
    "http://download.apk-bank-update.info/sbi-secure.apk",
    "https://shop.example.co.in/checkout",
    "https://example.com",
    "not a url at all",
    "",
]


def main(out_path="app/test/fixtures/url_feature_parity.json"):
    fixtures = [
        {
            "url": url,
            "host": host_of(url),
            "features": {name: extract(url)[name] for name in FEATURES},
            "vector": [float(extract(url)[name]) for name in FEATURES],
        }
        for url in CASES
    ]

    payload = {"feature_order": FEATURES, "cases": fixtures}

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(json.dumps(payload, indent=2))
    print(f"Wrote {len(fixtures)} url feature fixtures to {out_path}")


if __name__ == "__main__":
    main()
