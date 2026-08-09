"""Emit reference probabilities from the Python pipeline for the Dart port to
assert against.

scam_text_matcher.dart reimplements sklearn's TfidfVectorizer (word n-grams,
sublinear tf, idf, L2 norm) plus the logistic link. A threshold test ("scam
scores above 0.7") would not catch subtle drift — a wrong ngram boundary or a
missing sublinear-tf still lands on the right side of 0.7. These fixtures pin
the exact probabilities so any divergence fails loudly.
"""
import json
from pathlib import Path

import joblib

MODEL_PATH = Path("ml/models/scam_text_model.joblib")
OUT_PATH = Path("app/test/fixtures/text_model_parity.json")

CASES = [
    "Rs.500 debited from a/c **1234 for UPI txn to City Cafe. Avl bal Rs.4200. -HDFC Bank",
    "Dear customer, your SBI KYC will be blocked in 24 hours. Update now: http://bit.ly/1234",
    "We noticed suspicious activity on your UPI account. Share the OTP sent to you to secure it.",
    "This is HDFC Bank support. Please install AnyDesk and share your screen so we can process your refund.",
    "Hi Priya, are we still meeting for lunch tomorrow at 1pm?",
    "Congratulations! You won Rs.50000 lottery. Send Rs.499 processing fee via UPI to claim.",
    "Your OTP for SBI login is 481920. Do not share this with anyone.",
    "I have sent Rs.2000 to your account by mistake. Please accept the collect request to return it.",
    "",
    "!!! ??? ...",
    "zzzz qqqq xxxx wwww",
]


def main():
    pipeline = joblib.load(MODEL_PATH)
    probabilities = pipeline.predict_proba(CASES)[:, 1]

    fixtures = [
        {"text": text, "scam_probability": float(p)}
        for text, p in zip(CASES, probabilities)
    ]

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(fixtures, indent=2), encoding="utf-8")

    print(f"Wrote {len(fixtures)} parity fixtures to {OUT_PATH}")
    for f in fixtures:
        label = f["text"][:55] or "(empty)"
        print(f"  {f['scam_probability']:.6f}  {label}")


if __name__ == "__main__":
    main()
