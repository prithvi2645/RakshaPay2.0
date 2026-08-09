# RakshaPay

**A pre-transaction fraud shield for UPI users.**

RakshaPay is a companion layer that sits beside existing UPI apps (Google Pay, PhonePe,
BHIM, Paytm) and scores the fraud risk of a QR code, a UPI ID, or a payment SMS **before**
the user enters their UPI PIN.

It does not process payments, hold funds, or replace any UPI app or bank. It reads only
locally available signals, scores risk **on-device**, and warns the user in their own
language.

---

## The problem

- **₹805 crore** lost across **10.64 lakh** UPI fraud incidents in the first eight months
  of FY26 alone — trending toward ~₹1,750 crore for the full year, a 31% jump over FY25.
- **1 in 5** UPI users has already been targeted.
- **51% of victims never report it** — meaning every official number undercounts reality.

The structural problem: **bank-side and NPCI systems act *after* authorization.** UPI is
irreversible, so by the time fraud is detected, the money is gone. Nothing sits in the
seconds *before* the PIN screen, across every UPI app, where the decision is actually made.

---

## What makes this different

Four things, in order of how much they matter:

### 1. It runs entirely on the phone

Both models are bundled in the APK — ~550 KB total. No server call before scoring, which
means it works in **airplane mode**, adds no network latency to a payment decision, and
never transmits the QR payload or message body anywhere.

### 2. It solves the false-positive problem, which is the hard part

A text model trained on general SMS spam flags almost all Indian transactional SMS. Bank
debit alerts, OTP messages, and recharge offers all carry marketing-shaped language, so a
naive classifier marks them risky.

That behaviour makes an app worse than useless — every false alarm trains the user to
dismiss the next warning, including the real one.

Two correction signals fix it, and both are enforced *after* the model runs:

- **Sender reputation** — Indian commercial SMS must use a TRAI/DLT-registered header
  (`VM-HDFCBK`, `AD-SBIINB`). Obtaining one requires a registered business entity, so
  fraudsters overwhelmingly send from ordinary 10-digit mobile numbers. Registered senders
  are discounted to **0.25×**; personal numbers get a **1.15×** boost.
- **Fraud-ask gating** — a scam has to make you *do* something: hand over a PIN or OTP, act
  on an account-block threat, install remote-access software, or pay in order to receive
  money. **If a message contains no such ask, its score is capped below the block
  threshold regardless of what the model says.**

> RakshaPay is a fraud shield, not a spam filter.

`app/test/sms_false_positive_test.dart` pins this behaviour: real HDFC/SBI/Jio/Airtel/
Amazon/ICICI messages must not alert, while KYC-expiry, OTP-harvesting, AnyDesk, and
accidental-transfer scams must.

### 3. Community intelligence with a poisoning guard

A reported UPI ID becomes a shared scam pattern only after **three distinct devices**
report it. That threshold is enforced by a `UNIQUE (vpa, kind, device_hash)` constraint in
Postgres — **not** by app code, so a modified client cannot bypass it. Three taps from one
phone count once.

Reports carry a **random per-install token**, not a hardware or advertising ID. It exists
purely so the database can count distinct devices; it identifies nothing about the user or
the handset and is discarded on uninstall.

### 4. It speaks to the user who is actually at risk

Voice alerts in **English, Hindi, Kannada, and Marathi** — actual translated sentences, not
just a locale switch. If the device lacks a voice pack for the selected language, it falls
back to English text *and* English voice together, because feeding Devanagari to an `en-IN`
voice produces noise, which is worse than a plain English warning.

---

## Model performance

### Scam-text model — measured on 1,115 held-out **real** messages

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Legitimate | 99.0% | 99.3% | 99.1% | 966 |
| **Scam** | **95.2%** | **93.3%** | **94.2%** | 149 |
| **Overall accuracy** | | | **98.5%** | 1,115 |

Confusion matrix: 959 true negatives · 7 false positives · 10 false negatives · 139 true
positives.

**On evaluation methodology:** the training set combines 5,572 real human-written SMS (UCI
SMS Spam Collection) with ~1,200 synthetic India/UPI-specific rows. **All synthetic rows go
into training only — the test set is real messages exclusively.** Scoring against synthetic
text generated from our own templates would measure template inversion, not generalization;
the number would look better and mean nothing.

### QR/VPA structural model

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Legitimate | 97.7% | 100% | 98.8% | 800 |
| Fraud | 100% | 97.6% | 98.8% | 800 |
| **Overall accuracy** | | | **98.8%** | 1,600 |

**Disclosed limitation:** this model is trained on **synthetic data**. No public dataset of
fraudulent UPI QR payloads or VPA strings exists — the available "UPI fraud" datasets are
transaction-level (amount, timestamp, merchant category), built for *post-transaction*
anomaly detection, and contain no QR or VPA string to score *before* a transaction exists.
The model learns the structural heuristics a human analyst would use (entropy, known-PSP
suffix, digit ratio, pre-filled amount), so its accuracy reflects how well it learned those
rules — not real-world fraud-catch rate. We report it as such.

---

## Architecture

```
   QR scan  ·  QR image  ·  SMS  ·  typed UPI ID
                      │
                      ▼
        ┌─────────────────────────────┐
        │   On-device Risk Engine     │   ← nothing leaves the phone
        │                             │
        │  QR/VPA model (ONNX)        │
        │  Scam-text model (Dart)     │
        │        ↓                    │
        │  Sender reputation ×0.25    │
        │  Fraud-ask gating (cap 55)  │
        │        ↓                    │
        │  Community override → 100   │
        └─────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
   Risk verdict + voice      Local history
   (Safe / Caution /         (never synced)
    High Risk)
                      │
                      ▼  only if the user chooses to report
        ┌─────────────────────────────┐
        │  Supabase Postgres          │
        │  reports → trigger →        │
        │  scam_patterns (3 devices)  │
        │  RLS: insert-only reports   │
        └─────────────────────────────┘
```

### Why the text model isn't ONNX

The QR model exports to ONNX and runs through ONNX Runtime Mobile. The text model does
**not** — Dart's ONNX binding has unreliable support for *string* input tensors, which is a
live crash risk on device.

Instead, the vocabulary, IDF weights, coefficients, and intercept are exported as JSON, and
the TF-IDF → logistic pipeline is evaluated directly in Dart. Because the model is linear,
**this is numerically exact, not an approximation** — and
`app/test/text_model_parity_test.dart` pins the Dart output to Python's `predict_proba`
within **1e-6**, so the phone and the training pipeline can never silently diverge.

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Mobile app | Flutter (Android) | Single codebase; SMS and QR access require Android |
| QR/VPA inference | RandomForest → ONNX Runtime Mobile | Converts cleanly via skl2onnx; float tensors work reliably |
| Text inference | TF-IDF + LogisticRegression, evaluated in Dart | Linear ⇒ exact port; avoids ONNX string-tensor crash risk |
| Training | Python · scikit-learn · pandas · skl2onnx | Standard, reproducible, fully scripted |
| Voice | Android TTS via `flutter_tts` | On-device; works offline |
| Backend | Supabase (Postgres + RLS + trigger) | Aggregation runs *inside* the database — no server to deploy or keep awake |
| Local storage | SharedPreferences | Offline-first cache and report queue |

---

## Project structure

```
app/       Flutter Android app — capture, on-device inference, alerts, TTS
ml/        Python training pipeline for both models
backend/   Supabase Postgres schema, aggregation trigger, RLS policies
docs/      Architecture and design decisions
```

---

## Running it

### 1. Train the models

```bash
cd ml
python -m venv venv
./venv/Scripts/python.exe -m pip install -r requirements.txt
```

Then from the repository root:

```bash
python ml/src/download_datasets.py       # fetch the real UCI SMS corpus
python ml/src/build_text_dataset.py      # real + synthetic hybrid text set
python ml/src/generate_qr_data.py        # synthesize QR/VPA structural data
python ml/src/train_text_model.py        # -> ml/models/scam_text_model.joblib
python ml/src/train_risk_model.py        # -> ml/models/qr_risk_model.onnx
python ml/src/export_text_weights.py     # -> app/assets/models/scam_text_model.json
python ml/src/export_parity_fixtures.py  # -> app/test/fixtures/
```

### 2. Backend

Open the Supabase dashboard → **SQL Editor**, paste `backend/supabase/schema.sql`, and run
it. The script is idempotent. There is no CLI step and no server to deploy — report
aggregation is a Postgres trigger.

### 3. App

Backend credentials are injected at build time and never committed:

```bash
cd app
cp env.example.json env.json     # fill in your Supabase URL + publishable key
flutter pub get
flutter test
flutter build apk --debug --dart-define-from-file=env.json
```

Use the **publishable** key, never a `service_role`/secret key — the latter bypasses every
RLS policy.

Without `env.json` the app still builds and runs; it simply has no community sync, since
all scoring happens on-device regardless.

---

## Privacy

Raw QR payloads and SMS bodies **never leave the device**. The only data that syncs upward
is:

- **Reports you explicitly submit** — the payee UPI ID, a reason code, and a random
  per-install token. Nothing else.
- **Risk logs** — a risk level and score only, no content.

Row Level Security enforces this server-side, not by app convention:

- `reports` has an **INSERT policy and no SELECT policy** — the app can submit reports and
  can never read them back, and neither can we from any client.
- `scam_patterns` exposes **only rows where `active = true`**, so nothing below the
  3-device threshold is visible to anyone.
- Local scan history is never synced at all — it reveals which merchants a user pays.

---

## Testing

```bash
cd app && flutter test
```

25 tests covering:

- **Model parity** — Dart TF-IDF output pinned to Python's `predict_proba` within 1e-6
- **False-positive regression** — real Indian bank, telecom, and e-commerce SMS must not
  alert; real scam patterns must
- **Feature-order guard** — Dart feature extraction must stay in lockstep with the
  `FEATURES` list in the training script, since a reordering would silently feed wrong
  values into the model
- **Sender classification** — DLT headers vs. personal numbers
- **Edge cases** — empty, punctuation-only, and out-of-vocabulary text must not divide by
  zero
