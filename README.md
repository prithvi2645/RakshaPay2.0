# RakshaPay

**A pre-transaction fraud shield for UPI users.**

RakshaPay is a companion layer that sits beside existing UPI apps (Google Pay, PhonePe,
BHIM, Paytm) and scores the fraud risk of a QR code, a UPI ID, or a payment SMS **before**
the user enters their UPI PIN.

It does not process payments, hold funds, or replace any UPI app or bank. It reads only
locally available signals, scores risk **on-device**, and warns the user in their own
language.

It ships as **four surfaces over one backend**, because a scam QR does not only touch the
person who scans it:

| Surface | Who it is for | What it does |
|---|---|---|
| **Android app** (`app/`) | The person mid-payment | Scans the QR, reads payment SMS, speaks the warning aloud in four languages |
| **Web checker** (`web/check`) | Anyone, with nothing installed | QR, UPI ID, message and link checks, all running in the browser tab via WASM |
| **Merchant appeal** (`web/merchant`) | A payee flagged wrongly | Public lookup, a reviewed appeal with a reference code, and a flag-clearing outcome |
| **Threat feed + API** (`web/dashboard`, `/api/v1/*`) | Analysts, banks, other UPI apps | Live confirmed patterns and an open, documented JSON API |

Both clients run **the same trained artifacts** and are pinned to the same Python reference
probabilities at 1e-6, so a verdict on the web and a verdict in the app cannot diverge.

### The web is a companion to the app, not a second product

This is the central design constraint, and it is worth stating explicitly because the two
surfaces could easily have drifted into two competing products.

**The Android app is the primary surface.** It is the only place protection can be
*ambient* — happening without the user having to think to ask for it. It reads the QR at
the camera before any payment app opens it, scores a payment SMS the moment it arrives,
and speaks the warning aloud. A user who has installed it is protected by default.

**The website exists for the situations the app cannot reach**, and each is a real
situation rather than a hypothetical one:

- The user is on someone else's phone, or a desktop, and has nothing installed.
- The user is on iOS, where reading SMS and intercepting a scan are not permissions any
  app can obtain — so on iPhone the web *is* RakshaPay.
- The person who needs the system is not a consumer at all: a merchant appealing a flag, a
  fraud analyst reading the feed, or an engineer at a bank evaluating the API. None of them
  will install a consumer fraud app to do those things.

That the two are one system is enforced mechanically rather than claimed:

| Guarantee | How it is enforced |
|---|---|
| One set of models | `web/public/models` is gitignored and generated at build time from `app/assets/models`. The web client cannot hold its own copy, so the copies cannot drift. |
| One verdict | Both clients are pinned to the same Python reference fixtures at **1e-6**, and the web suite re-runs the Dart suite's behavioural cases. A divergence fails a test. |
| One community database | Same Supabase project, tables and RLS policies. A report filed from the browser warns app users, and vice versa. |

**The API is the third consumer of that same engine.** It is documented at `/developers` and
open across origins with no key, because the most useful place for this intelligence is not
our app — it is inside the payment flow a user already trusts. An engineer arriving through
the API gets the same confirmed-pattern data the app reads, and the same reporting and
appeal paths are reachable over HTTP, so an integrator can contribute intelligence back
rather than only consuming it.

The surface split is expected to keep evolving as the app grows; the constraint that governs
every such change is that the web must remain a companion to the app and a door into the
same engine, never a parallel implementation of it.

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

### 4. It follows the scam into the link

Wording and payee checks miss the most common delivery mechanism in Indian UPI fraud: a message
whose entire payload is a URL. `KYC pending. Update here: bit.ly/3xKq2 -SBI` asks for nothing in
its text, so a text-only pipeline correctly declines to alarm — and misses the attack.

The link layer is deliberately split in two:

- **A trained model over the host**, with 12 structural features. It reads the host *only*, which
  is a guard rather than a simplification: the malicious feeds supply full URLs with long paths and
  the benign reference supplies bare domains, so a path-aware model trained on them would learn
  "has a path ⇒ malicious", score ~99%, and collapse on the first real benign URL with a path.
- **Deterministic rules over the whole URL** for what a host cannot show: `.apk` downloads, the
  `@`-in-authority trick (`https://sbi.co.in@evil.tld`), punycode look-alikes, brand names on
  domains that do not own them, dynamic-DNS hosts, throwaway TLDs. These need no training data and
  each is individually defensible.

A dangerous link is then treated as a **fraud ask**, not as extra wording evidence — it is asking
the reader to *do* something — so it lifts a message past the no-ask cap exactly as an OTP request
would. A merely unusual link does not, or every newsletter with a tracking domain becomes an alert.

**We never fetch a link to judge it.** That request would confirm to the sender that their message
reached a real person. Shortened links therefore stay unresolved, and are never called safe,
because we genuinely do not know where they go.

### 5. The people it flags get a way out

Any system that flags people will sometimes flag the wrong one, and for a small merchant a
wrongly flagged UPI ID is lost income for as long as the flag stands. So recourse is part
of the schema, not a support address:

- `web/merchant` looks the payee up against the public confirmed list and files an appeal,
  returning a reference code. Contact details are optional — the reference alone tracks it.
- `appeal_status(reference)` is a `SECURITY DEFINER` function returning six fields for one
  reference. The table has no SELECT policy, so appeals cannot be enumerated.
- An upheld appeal clears the flag **and** sets `overturned`, so later reports cannot
  silently re-activate a pattern that has already been reviewed and cleared.
- The open/upheld/rejected counts are published in `live_stats` and on the dashboard. How
  often the system flags the wrong payee is the number a fraud tool is least inclined to
  show, and the one that most deserves to be public.

### 6. It speaks to the user who is actually at risk

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

### Link-risk model — measured on **real** hosts on both sides

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Benign | 91% | 100% | 95% | 656 |
| **Malicious** | **99%** | **85%** | **92%** | 438 |
| **Overall accuracy** | | | **94%** | 1,094 |

Trained on live OpenPhish + URLhaus hosts against the Tranco top-1M. This is the first model here
whose headline number describes measured behaviour on real adversarial data rather than learned
structural rules.

**Three qualifications we publish rather than bury** — all recorded in
`ml/models/url_risk_model.metrics.json`:

1. **The honest recall is 66%, not 85%.** 62% of malicious hosts in the corpus are raw IP
   addresses, which are trivially detectable. On the held-out subset with those removed — real
   phishing *domains*, the kind that arrive in an SMS — recall is **66% at 98% precision**. An
   ablation with the feature deleted entirely scores 93.9%, confirming the model is not merely an
   IP detector, but the domain-only number is the one that describes field behaviour. High
   precision is the deliberate trade: a false alarm is treated as a safety failure.
2. **Benign labels come from a popularity list, not a safety list.** Tranco ranks how popular a
   domain is. A host is treated as benign unless it also appears in a malicious feed; 12
   overlapping hosts were dropped rather than double-counted.
3. **The feeds are live, so the corpus is not byte-reproducible.** Re-running trains on a different
   set of URLs. The snapshot behind these numbers is recorded in the metrics file, and the download
   step is scripted so anyone can produce their own. PhishTank is absent — its bulk download now
   requires a registered API key, and a dataset step nobody else can re-run is worse than one
   source fewer.

---

## Architecture

```
   Android app                          Web (Next.js on Vercel)
   QR scan · SMS · typed UPI ID         QR image · payload · UPI ID · pasted message
              │                                        │
              ▼                                        ▼
   ┌─────────────────────────┐            ┌─────────────────────────┐
   │  Risk engine (Dart)     │            │  Risk engine (TypeScript)│
   │  ONNX Runtime Mobile    │            │  ONNX Runtime Web (WASM) │
   └───────────┬─────────────┘            └───────────┬─────────────┘
               │      same artifacts, pinned to 1e-6  │
               └──────────────────┬───────────────────┘
                                  ▼
                  ┌───────────────────────────────┐
                  │  QR/VPA model  ·  text model  │  ← nothing leaves the device
                  │            ↓                  │
                  │  Sender reputation ×0.25/1.15 │
                  │  Fraud-ask gate: cap 55/floor 60
                  │            ↓                  │
                  │  Community override → 100     │
                  └───────────────┬───────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
  Risk verdict + voice      Local history          only if the user reports
  (Safe/Caution/High)       (never synced)                  │
                                                            ▼
                            ┌───────────────────────────────────────────┐
                            │  Supabase Postgres                        │
                            │  reports → trigger → scam_patterns (3 dev)│
                            │  pattern_appeals → resolve_appeal()       │
                            │  RLS: insert-only, active-only reads      │
                            └───────────────┬───────────────────────────┘
                                            ▼
                            active_patterns · live_stats views
                                            ▼
                        /api/v1/{lookup,patterns,stats,appeal}
                        consumed by the dashboard, banks, other UPI apps
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
| Web | Next.js 15 · React 19 · TypeScript · Tailwind | Static pages plus route handlers for the API; deploys to Vercel with no server to manage |
| QR/VPA inference | RandomForest → ONNX Runtime Mobile / Web (WASM) | One `.onnx` artifact runs on both clients; converts cleanly via skl2onnx |
| Text inference | TF-IDF + LogisticRegression, evaluated in Dart and TypeScript | Linear ⇒ exact port; avoids ONNX string-tensor crash risk |
| QR image decode (web) | `jsqr` on a canvas | Decoding happens in the tab — the image is never uploaded |
| Training | Python · scikit-learn · pandas · skl2onnx | Standard, reproducible, fully scripted |
| Voice | Android TTS via `flutter_tts` | On-device; works offline |
| Backend | Supabase (Postgres + RLS + trigger) | Aggregation runs *inside* the database — no server to deploy or keep awake |
| Local storage | SharedPreferences | Offline-first cache and report queue |

---

## Project structure

```
app/       Flutter Android app — capture, on-device inference, alerts, TTS
web/       Next.js site — browser checker, merchant appeals, threat feed, public API
ml/        Python training pipeline for both models
backend/   Supabase Postgres schema, aggregation trigger, RLS policies, appeals
docs/      Architecture and design decisions
```

`web/public/models` is **generated, not committed**: `web/scripts/sync-assets.mjs` copies
the trained artifacts from `app/assets/models` before every dev run and build. Two copies
of a model file are two copies that can drift apart, which would defeat the parity test.

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

python ml/src/download_url_datasets.py   # OpenPhish + URLhaus + Tranco (live feeds)
python ml/src/build_url_dataset.py       # -> ml/data/url_risk_dataset.csv
python ml/src/train_url_model.py         # -> ml/models/url_risk_model.onnx (+ stages into app/)
python ml/src/export_url_fixtures.py     # -> app/test/fixtures/url_feature_parity.json
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

**Do not use `flutter run` from an IDE.** It drops the ONNX native library, so the risk
engine fails to start. Build the APK and install it:

```bash
adb uninstall com.rakshapay.app; adb install build/app/outputs/flutter-apk/app-debug.apk
```

### 4. Web

```bash
cd web
cp .env.example .env.local        # same Supabase URL + publishable key as the app
npm install
npm test                          # 30 tests, including 1e-6 parity with Python
npm run dev                       # http://localhost:3000
```

`npm run dev` and `npm run build` both run `scripts/sync-assets.mjs` first, which copies
the two models and the ONNX Runtime WASM binaries into `web/public/`.

Leaving `.env.local` unset is a supported configuration, and the same one the app has
without `env.json`: every page still builds and every risk verdict still works, because
scoring is entirely local. Only the community layer goes quiet, and each surface says so
plainly — the API answers `503 backend_unconfigured` rather than returning empty data that
would read as "nothing reported".

**Deploying to Render** (the configured target): dashboard → **New → Blueprint** → pick this
repository → branch `main`. `render.yaml` at the repository root configures everything
except the two Supabase values, which Render prompts for and stores as secrets rather than
reading from the file.

It deploys as a **Web Service, not a Static Site** — a static export would silently drop all
four `/api/v1/*` routes — and on the **free** plan, which cannot bill. The trade-off is that
a free service spins down after ~15 minutes idle and takes 30–60s to answer the next
request, so open the URL a few minutes before any demo. Render has no hard spend cap, so a
paid instance would keep charging once promotional credits ran out; `plan: free` is the only
setting that guarantees otherwise.

**Deploying to Vercel** instead: import the repository, set **Root Directory** to `web`, and
add the same two environment variables. You may also need to enable *"Include source files
outside of the Root Directory"*, because the build copies the models from `app/assets/models`.

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
- `pattern_appeals` is insert-only too. Status lookup goes through a `SECURITY DEFINER`
  function keyed on the reference code, returning six fields for one row — so one merchant
  can never read another's appeal, statement, or contact details.
- Local scan history is never synced at all — it reveals which merchants a user pays.

On the web the same rules hold, and the surface is smaller than it looks: QR images are
decoded on a canvas in the tab, model inference runs in WASM, and the per-browser reporter
token is 24 random bytes in `localStorage` — not a fingerprint and not derived from
anything about the browser or the machine.

---

## Testing

```bash
cd app && flutter test     # 25 tests
cd web && npm test         # 78 tests
```

**103 tests across the two clients**, and deliberately overlapping: the web suite re-runs the
same false-positive cases, the same fraud-signal cases, and the same feature-order assertion
as the Dart suite, against the same fixture file. Two clients that each pass their own
hand-written tests can still disagree with each other; pinning both to one set of Python
reference probabilities is what makes that impossible.

They cover:

- **Model parity** — Dart *and* TypeScript TF-IDF output pinned to Python's `predict_proba`
  within 1e-6, from one shared fixture file
- **False-positive regression** — real Indian bank, telecom, and e-commerce SMS must not
  alert; real scam patterns must
- **Feature-order guard** — Dart feature extraction must stay in lockstep with the
  `FEATURES` list in the training script, since a reordering would silently feed wrong
  values into the model
- **Sender classification** — DLT headers vs. personal numbers
- **Edge cases** — empty, punctuation-only, and out-of-vocabulary text must not divide by
  zero

---

## Who each surface is for

Every page on the web build is aimed at exactly one person in exactly one situation. That
constraint is what kept the site from becoming four variations of a brochure — if a page
cannot name the person who lands on it and what they need in the next thirty seconds, it
does not belong.

| Page | Who lands here | Why they are there |
|---|---|---|
| `/check` | Someone about to pay — often on a friend's phone, or on a laptop, with no app installed | *"Is this QR safe?"* — needs an answer in about five seconds |
| `/merchant` | A shop owner whose UPI ID got flagged | Losing income right now, needs it undone |
| `/dashboard` | A journalist, researcher, or police cyber-cell | Wants to see what is spreading, and how often we get it wrong |
| `/developers` | An engineer at a bank or UPI app | Evaluating whether to put this inside their own payment flow |

The Android app serves a fifth: someone who wants the check to happen **without being asked
for** — the QR read at the scanner, the payment SMS scored as it arrives, the warning spoken
aloud for a parent who will not read a dialog.

Two consequences worth stating, because they explain choices that otherwise look arbitrary:

- **`/check` has no account, no install, and no upload.** The person using it is already
  suspicious of something on their screen. Asking them to sign up first would lose them, and
  asking them to upload the thing they distrust would be the wrong answer to why they came.
- **`/developers` is open and key-less.** The most useful place for this intelligence is not
  our app — it is inside the payment flow the user already trusts. Anything that makes
  integration a procurement conversation defeats that.
