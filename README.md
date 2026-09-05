# RakshaPay

**A fraud shield for the ten seconds before you pay.**

RakshaPay checks a UPI QR, a payee ID, a suspicious message or a link and gives you a
verdict — with its reasoning — before you enter your PIN. Everything is scored on your own
device, so nothing you check is ever uploaded.

**Live → [rakshapay2-0.onrender.com](https://rakshapay2-0.onrender.com)**

```bash
# The threat-intel API is open, no key needed:
curl "https://rakshapay2-0.onrender.com/api/v1/lookup?vpa=someone@okaxis"
```

---

## The problem

₹1,750 crore lost to UPI fraud in FY26, up 31%. One in five users targeted. **UPI has no
chargeback.**

A payment has three moments, and only the first can still be stopped:

| Moment | Who is watching | Reversible? |
|---|---|---|
| **Before the PIN** | **Nobody** | The payment hasn't happened |
| At authorization | Bank risk engines | Seconds, at best |
| After settlement | Fraud teams, 1930 | **No** |

Every existing defence lives in the last two — they confirm a crime happened. The first row
is empty for structural reasons: a bank sees only its own customers, and only once a
transfer is submitted. Nobody is positioned to look at the QR *before* it's scanned.

RakshaPay occupies that row. It doesn't move money or replace your UPI app.

---

## What makes it different

**It runs on the phone, not in the cloud.** All three models are bundled and score locally —
it works in airplane mode. That's a requirement, not an optimisation: the users most exposed
to UPI fraud (rural and first-time users) are the least likely to have a working connection
when they pay. A cloud check would fail silently, for exactly them.

**It refuses to cry wolf.** A tool that flags every bank alert teaches people to ignore the
one that mattered. If a message doesn't actually *ask* you for anything — a PIN, a payment,
remote access — it can never raise an alarm here, however it's worded.

**People it flags get a way out.** Three independent devices must report a payee before
anyone is warned, enforced by a database constraint rather than app code. A wrongly flagged
merchant can appeal, and an upheld appeal clears the flag permanently.

**It speaks.** A high-risk verdict is read aloud in **12 Indian languages** at half speed —
because a warning you have to *read*, in English, in a hurry, isn't a warning for a
first-time user.

---

## Measured results

| Model | Scores | Result | Data |
|---|---|---|---|
| TF-IDF + LogisticRegression | Message wording | **98.5%** acc · 95.2% prec · 93.3% recall | **Real** — 1,115 held-out human-written messages |
| RandomForest → ONNX | Payee (7 features) | 98.8% | ⚠️ **Synthetic** — see below |
| RandomForest → ONNX | Link host (12 features) | 94% acc · 99% prec · 85% recall | **Real** — live OpenPhish + URLhaus vs Tranco |

**Three caveats we publish rather than bury:**

- The **payee model is trained on synthetic data.** No public dataset of fraudulent UPI QR
  payloads exists, so 98.8% describes the structural rules it learned, not field performance.
- The **link model's honest recall is 66%, not 85%.** 62% of malicious hosts in the corpus
  are raw IP addresses — trivially detectable. On real phishing *domains* only, it's 66% at
  98% precision. High precision is the deliberate trade.
- **Benign labels come from a popularity list** (Tranco), not a safety list.

---

## Architecture

```
QR · UPI ID · SMS · Link
          ↓
┌─────────────────────────────────────┐
│  ON DEVICE — nothing is uploaded    │
│  payee model · message model ·      │
│  link model                         │
│          ↓                          │
│  Correction layer                   │
│  who sent it · what it asks of you  │
└─────────────────────────────────────┘
          ↓
   Safe / Caution / High Risk
          ↓  (only if the user reports)
  Supabase — payee ID + reason code only
  3 distinct devices before anyone is flagged
```

**One engine, four doors.** `web/public/models` is generated from `app/assets/models` at
build time and never committed, so the two clients cannot hold different copies. Both are
pinned to the same Python reference output at **1e-6**, and the web suite re-runs the Dart
suite's cases. A divergence fails a test.

| Surface | Who it's for |
|---|---|
| **Android app** | Someone mid-payment — scans the QR, reads payment SMS, speaks the warning |
| **`/check`** | Anyone with nothing installed — a friend's phone, a laptop, iOS |
| **`/merchant`** | A shop owner flagged wrongly — lookup and appeal |
| **`/dashboard`** + **`/api/v1`** | Analysts, and any bank or UPI app that wants the feed |

---

## Tech stack

| | |
|---|---|
| **Mobile** | Flutter · ONNX Runtime Mobile · flutter_tts |
| **Web** | Next.js 15 · React 19 · TypeScript · Tailwind · ONNX Runtime Web (WASM) |
| **Backend** | Supabase Postgres · RLS · trigger-based aggregation — **no application server** |
| **ML** | scikit-learn → ONNX · TF-IDF + LogReg · RandomForest |
| **Deploy** | Render · APK |

```
app/       Flutter Android app
web/       Next.js site — checker, appeals, threat feed, API
ml/        Python training pipeline for all three models
backend/   Supabase schema, RLS policies, triggers
docs/      Design decisions and why they were made
```

---

## Running it

```bash
# 1. Models
cd ml && python -m venv venv && ./venv/Scripts/python.exe -m pip install -r requirements.txt
python ml/src/download_datasets.py && python ml/src/build_text_dataset.py
python ml/src/train_text_model.py && python ml/src/train_risk_model.py
python ml/src/download_url_datasets.py && python ml/src/build_url_dataset.py
python ml/src/train_url_model.py && python ml/src/export_text_weights.py

# 2. Backend — paste backend/supabase/schema.sql into the Supabase SQL Editor

# 3. Web
cd web && cp .env.example .env.local   # Supabase URL + publishable key
npm install && npm test && npm run dev

# 4. App
cd app && cp env.example.json env.json
flutter build apk --release --dart-define-from-file=env.json
adb install build/app/outputs/flutter-apk/app-release.apk
```

Leaving the Supabase keys unset is supported — every risk verdict still works, since scoring
is entirely local. Only the community layer goes quiet.

> **Don't use `flutter run` from an IDE** — it drops the ONNX native library and the risk
> engine won't start. Build the APK and `adb install` it.

---

## Privacy

Raw QR payloads, message bodies and links **never leave the device**. What can sync is a
payee ID, a reason code, and a risk level — and only if you choose to report.

Enforced by the database, not by client code:

- `reports` has an INSERT policy and **no SELECT policy** — write-only from every client
- `scam_patterns` exposes only rows where `active = true`, so nothing below the threshold is
  visible to anyone
- `UNIQUE (vpa, kind, device_hash)` — three reports from one device are rejected by Postgres
- The reporter token is 24 random bytes, not a device or advertising ID

**We never open a link to judge it.** Fetching it would confirm to the sender that a real
person received their message, so shortened links stay unresolved — and are never called
safe, because we genuinely don't know where they go.

---

## Testing

```bash
cd app && flutter test    # 41
cd web && npm test        # 78
```

**119 tests, deliberately overlapping.** The web suite re-runs the Dart suite's
false-positive cases and feature-order assertions against the same fixture file. Two clients
that each pass their own tests can still disagree with each other; pinning both to one set of
Python reference probabilities is what makes that impossible.

---

📖 **[docs/architecture.md](docs/architecture.md)** — why the text model isn't ONNX, how the
correction layer works, the appeal design, the leak the link model is built around, and every
scope boundary we chose on purpose.
