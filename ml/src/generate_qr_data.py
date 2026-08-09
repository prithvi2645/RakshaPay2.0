"""Synthetic training data for the QR/VPA structural risk model.

No public dataset of fraudulent UPI QR payloads or VPA strings exists — the
Kaggle "UPI fraud" sets are transaction-level (amount, timestamp, merchant
category) for post-transaction anomaly detection, not the pre-transaction
QR/VPA string this model scores. This generator is disclosed as a limitation:
it teaches the model the same structural heuristics a human analyst would use
(entropy, known PSP suffixes, digit ratio), not real fraud examples.
"""
import csv
import math
import random
from pathlib import Path

random.seed(42)

KNOWN_PSP_SUFFIXES = [
    "okaxis", "oksbi", "okhdfcbank", "okicici", "ybl", "ibl", "axl",
    "paytm", "apl", "upi", "jio", "idfcbank", "kotak", "hdfcbank",
]
UNKNOWN_SUFFIXES = ["pay-verify", "refund-upi", "kyc-update", "secure-pay", "xn--upi"]
SUSPICIOUS_KEYWORDS = ["kyc", "refund", "reward", "cashback", "lottery", "winner", "urgent", "blocked", "suspend", "verify-now"]
MERCHANT_NAMES = ["Sharma Kirana Store", "City Cafe", "Auto Rickshaw Stand", "Om Traders", "Green Grocers"]


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    freq = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1
    entropy = 0.0
    for count in freq.values():
        p = count / len(s)
        entropy -= p * math.log2(p)
    return entropy


def random_alnum(n):
    import string
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def make_legit_vpa():
    style = random.choice(["name", "phone", "merchant_code"])
    suffix = random.choice(KNOWN_PSP_SUFFIXES)
    if style == "name":
        local = random.choice(["rahul.sharma", "priya123", "amit.kumar", "sunita.devi", "vendor.shop"])
    elif style == "phone":
        local = str(random.randint(6000000000, 9999999999))
    else:
        local = f"merchant.{random.randint(100, 9999)}"
    return f"{local}@{suffix}"


def make_fraud_vpa():
    style = random.choice(["random", "unknown_suffix", "digit_heavy", "lookalike"])
    if style == "random":
        return f"{random_alnum(random.randint(10, 16))}@{random.choice(KNOWN_PSP_SUFFIXES)}"
    if style == "unknown_suffix":
        return f"{random.choice(['support', 'refund', 'kyc-team', 'cashback'])}{random.randint(1,99)}@{random.choice(UNKNOWN_SUFFIXES)}"
    if style == "digit_heavy":
        return f"{random.randint(100000, 999999999)}{random.randint(0,9)}@{random.choice(KNOWN_PSP_SUFFIXES)}"
    return f"{random.choice(['paytrn', 'phcnpe', 'goog1e-pay'])}{random.randint(1,999)}@{random.choice(KNOWN_PSP_SUFFIXES)}"


def build_payload(vpa, name, amount=None, extra_keyword=None):
    params = [f"pa={vpa}", f"pn={name.replace(' ', '%20')}", "cu=INR"]
    if amount is not None:
        params.append(f"am={amount}")
    if extra_keyword:
        params.append(f"tn={extra_keyword.replace(' ', '%20')}")
    return "upi://pay?" + "&".join(params)


def make_row(is_fraud: bool):
    if is_fraud:
        vpa = make_fraud_vpa()
        name = random.choice(["Refund Team", "KYC Support", "Cashback Desk", "Prize Center", "Verify Account"])
        amount = random.choice([None, None, round(random.uniform(1, 5), 2)])
        keyword = random.choice(SUSPICIOUS_KEYWORDS + [None])
    else:
        vpa = make_legit_vpa()
        name = random.choice(MERCHANT_NAMES + ["Rahul Sharma", "Priya Singh"])
        amount = random.choice([None, None, round(random.uniform(20, 5000), 2)])
        keyword = None

    payload = build_payload(vpa, name, amount, keyword)
    local_part = vpa.split("@")[0]
    suffix = vpa.split("@")[1] if "@" in vpa else ""

    return {
        "payload": payload,
        "vpa": vpa,
        "known_psp_suffix": int(suffix in KNOWN_PSP_SUFFIXES),
        "entropy": round(shannon_entropy(local_part), 3),
        "digit_ratio": round(sum(c.isdigit() for c in local_part) / max(len(local_part), 1), 3),
        "local_part_len": len(local_part),
        "has_amount": int(amount is not None),
        "amount": amount or 0.0,
        "has_suspicious_keyword": int(keyword is not None),
        "label": int(is_fraud),
    }


def main(n_per_class=4000, out_path="ml/data/qr_risk_dataset.csv"):
    rows = [make_row(False) for _ in range(n_per_class)] + [make_row(True) for _ in range(n_per_class)]
    random.shuffle(rows)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {out}")


if __name__ == "__main__":
    main()
