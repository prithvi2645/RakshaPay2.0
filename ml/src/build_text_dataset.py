"""Build the scam-text training set: real UCI messages + synthetic India/UPI
augmentation.

The UCI corpus is UK/2011 general SMS spam with zero UPI content, so a model
trained on it alone treats any UPI-shaped message as suspicious. These synthetic
rows cover the scam patterns UCI lacks — and, just as important, the LEGITIMATE
UPI notifications UCI also lacks, so the model learns what a normal bank alert
looks like rather than flagging every rupee sign.

Every row is tagged origin=real|synthetic. train_text_model.py holds out real
messages only for evaluation — scoring against synthetic rows generated from
these same templates would measure template inversion, not generalization.
"""
import csv
import random
from pathlib import Path

random.seed(42)

RAW_PATH = Path("ml/data/raw/SMSSpamCollection")
OUT_PATH = Path("ml/data/scam_text_dataset.csv")

# --- Synthetic scam templates: India/UPI-specific patterns UCI has none of ---
SCAM_TEMPLATES = [
    "Dear customer, your {bank} KYC will be blocked in 24 hours. Update now: {link}",
    "URGENT: Your SBI account KYC has expired. Click {link} to avoid suspension.",
    "We noticed suspicious activity on your UPI account. Share the OTP sent to you to secure it.",
    "Your UPI PIN needs verification. Enter your PIN here: {link}",
    "This is {bank} support. Please install AnyDesk and share your screen so we can process your refund.",
    "Download TeamViewer QuickSupport so our engineer can fix your account issue immediately.",
    "Congratulations! You won Rs.{amount} lottery. Send Rs.499 processing fee via UPI to claim.",
    "You've received a cashback of Rs.{amount}. Pay Rs.99 activation fee to unlock it.",
    "I have sent Rs.{amount} to your account by mistake. Please accept the collect request to return it.",
    "Sorry, wrong UPI ID. Please approve the collect request I just sent so I can get my money back.",
    "This is Enforcement Directorate. A case has been registered against your Aadhaar. Call {phone} immediately.",
    "Your parcel is held at customs. Pay Rs.{amount} customs duty via UPI to release it: {link}",
    "Your electricity connection will be disconnected tonight. Pay Rs.{amount} now to avoid disconnection: {link}",
    "Job offer: Earn Rs.{amount}/day from home. Register by paying a refundable Rs.499 deposit.",
]

# --- Legitimate UPI templates: what real bank/app traffic actually looks like ---
LEGIT_TEMPLATES = [
    "Rs.{amount}.00 debited from a/c **{acct} on {date} to VPA {vpa}. Avl bal Rs.{bal}.00. Not you? Call {phone}.",
    "Rs.{amount} credited to your a/c **{acct} on {date} via UPI. Avl bal Rs.{bal}.",
    "Your OTP for {bank} NetBanking login is {otp}. Valid for 10 mins. Do not share this with anyone.",
    "Payment of Rs.{amount} to {merchant} was successful. Txn ID {txnid}.",
    "Your {bank} Credit Card statement of Rs.{amount} is generated. Due date {date}.",
    "Recharge successful! Rs.{amount} plan activated. Enjoy uninterrupted service.",
    "Your UPI Autopay mandate for Rs.{amount} to {merchant} is due on {date}.",
    "Rs.{amount} withdrawn from ATM **{acct} on {date}. Avl bal Rs.{bal}. Not you? Call {phone}.",
]

BANKS = ["HDFC Bank", "SBI", "ICICI Bank", "Axis Bank", "Kotak Bank"]
MERCHANTS = ["Amazon", "Swiggy", "Zomato", "BigBasket", "Netflix", "Airtel"]


def _fill(template: str) -> str:
    return template.format(
        bank=random.choice(BANKS),
        merchant=random.choice(MERCHANTS),
        link=random.choice(["bit.ly/3xK9z", "tinyurl.com/upi-verify", "kyc-update.in/verify"]),
        amount=random.choice([49, 99, 199, 499, 999, 2499, 4999, 50000]),
        phone=f"1800{random.randint(100000, 999999)}",
        acct=random.randint(1000, 9999),
        date=f"{random.randint(1,28):02d}-{random.randint(1,12):02d}-26",
        vpa=f"{random.choice(['merchant','vendor','shop'])}{random.randint(100,999)}@{random.choice(['okaxis','ybl','oksbi'])}",
        bal=random.randint(500, 95000),
        otp=random.randint(100000, 999999),
        txnid=f"T{random.randint(10**9, 10**10-1)}",
    )


def main(synthetic_per_class=600):
    rows = []

    with RAW_PATH.open(encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        for label, text in reader:
            rows.append({
                "text": text,
                "label": 1 if label == "spam" else 0,
                "origin": "real",
            })

    for _ in range(synthetic_per_class):
        rows.append({"text": _fill(random.choice(SCAM_TEMPLATES)), "label": 1, "origin": "synthetic"})
        rows.append({"text": _fill(random.choice(LEGIT_TEMPLATES)), "label": 0, "origin": "synthetic"})

    random.shuffle(rows)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "label", "origin"])
        writer.writeheader()
        writer.writerows(rows)

    real = sum(1 for r in rows if r["origin"] == "real")
    synth = sum(1 for r in rows if r["origin"] == "synthetic")
    print(f"Wrote {len(rows)} rows ({real} real, {synth} synthetic) to {OUT_PATH}")


if __name__ == "__main__":
    main()
