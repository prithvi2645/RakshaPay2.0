# RakshaPay — Architecture & Design Decisions

This document records *why* the system is built the way it is. Implementation detail that
is obvious from the code is omitted; the decisions that aren't obvious are explained.

---

## 1. Design principles

**On-device first.** All scoring happens on the phone. A payment decision cannot wait on a
network round-trip, and the signals being scored (QR payloads, SMS bodies) are exactly the
data a privacy-respecting product must not transmit.

**Offline-first, enforced in code.** `ScamDatabaseService` resolves `Supabase.instance`
lazily and returns `null` when the backend is unavailable. Every caller treats `null` as
"skip the network, use the local cache". A failed backend init can never prevent a user
from scoring a payment.

**Privacy by construction, not by policy.** The guarantees are enforced by database
constraints and RLS policies, not by the app choosing to behave. A modified client cannot
read reports back or bypass the report threshold.

**False alarms are a safety failure.** An app that cries wolf trains users to dismiss
warnings. Precision on legitimate traffic is treated as a primary requirement, not a
secondary metric.

**A surface exists because the problem has it.** Four clients ship — app, web checker,
merchant appeal, analyst feed and API — and each maps to a party the fraud actually
touches. None of them is a variant of another for presentation's sake; remove any one and a
real person loses their only way in.

---

## 2. The risk pipeline

### QR / UPI ID path

```
payload → extract 7 structural features → RandomForest (ONNX) → 0..100
        → community override if the VPA is a confirmed pattern
```

The seven features, which must stay in lockstep with `FEATURES` in
`ml/src/train_risk_model.py`:

| Feature | Signal it captures |
|---|---|
| `known_psp_suffix` | Is `@okaxis` / `@ybl` real, or `@pay-verify` fabricated? |
| `entropy` | Shannon entropy of the local part — `rahul.sharma` vs `x9k2plq7z1` |
| `digit_ratio` | Mostly-digits IDs are unusual for a genuine merchant |
| `local_part_len` | Length of the identifier |
| `has_amount` / `amount` | Pre-filled ₹1–5 "verification pings" are a known scam tell |
| `has_suspicious_keyword` | kyc, refund, lottery, cashback, … |

`app/test/qr_features_test.dart` guards the *order* of these features. A reordering would
silently feed entropy into the digit-ratio slot and produce plausible-looking but wrong
scores — the kind of bug that never throws.

### SMS / text path

```
text → TF-IDF + LogisticRegression (Dart) → raw 0..100
     → × sender-reputation multiplier
     → fraud-ask gate:  ask present ? floor 60 : cap 55
     → community override if a VPA is present and confirmed
```

The gate is the important part and deliberately overrides the model in both directions:

- **No ask present** → capped at 55, below the 70 block threshold. A promotional SMS the
  model dislikes cannot raise a high-risk alert.
- **Ask present** → floored at 60, plus 12 per additional distinct signal. A scam written
  in unremarkable language cannot slip through on wording alone.

### Risk bands

| Score | Level | Meaning |
|---|---|---|
| 0–34 | Safe | No action needed |
| 35–69 | Caution | Check carefully before paying |
| 70–100 | High Risk | Recommend not paying |

---

## 3. Why the two models are deployed differently

The QR model exports to ONNX and runs through ONNX Runtime Mobile — float tensors work
reliably through the Dart binding.

The text model does **not**. Dart's `onnxruntime` binding has patchy support for **string**
input tensors, which is a live crash risk on device rather than a theoretical one. Since
TF-IDF → LogisticRegression is a linear pipeline, the vocabulary, IDF vector, coefficients,
and intercept are exported as JSON and evaluated directly in Dart.

This is **numerically exact**, not an approximation. `export_parity_fixtures.py` emits
reference probabilities from the Python pipeline, and `text_model_parity_test.dart` asserts
the Dart implementation matches within **1e-6**.

A threshold test ("scam scores above 0.7") would not catch subtle drift — a wrong n-gram
boundary or a missing sublinear-tf transform still lands on the right side of 0.7. Pinning
exact probabilities makes any divergence fail loudly.

---

## 3-bis. The link layer, and the leak it is designed around

The obvious way to build a link classifier is to train on full URLs: phishing feeds against a
benign reference list. It scores about 99% and it is worthless.

URLhaus and OpenPhish publish full URLs with long paths. Tranco publishes bare domains. Train on
those directly and the strongest available signal is *path length*, so the model learns "has a path
⇒ malicious". Every real benign URL with a path is then a false positive, and the 99% describes an
artefact of how two feeds are formatted.

Restricting the trained model to **host features** makes both classes structurally comparable — a
host is a host in either feed. That is why `ml/src/url_features.py` exposes 12 host features and
nothing path-derived, and why the docstring says so at the top rather than in a commit message.

What the host cannot see is handled by **deterministic rules** over the whole URL, in
`urlRules.ts`: `.apk` and executable downloads, the `@`-in-authority trick, punycode, brand tokens
on domains that do not own them, dynamic DNS, throwaway TLDs, shorteners, non-standard ports. They
carry a severity (`severe` / `strong` / `mild`) and a written explanation each, need no training
corpus, and cannot age the way a model does.

Rules override the model in both directions. A single `severe` rule floors the score at 90 — an
APK-download link does not become safe because it sits on a host the model has never seen. The
shortener rule instead sets a *floor* of 40: a shortened link can never be called safe, because we
deliberately do not follow it and therefore genuinely do not know where it goes. Calling something
safe that we chose not to look at would be the one dishonest verdict in the system.

**Links are folded into a message as an ask, not as evidence.** `mergeLinkIntoMessage` treats a
high-risk link the way a credential request is treated — floor of 60, clearing the no-ask cap of 55
— because a link that installs an APK is asking the reader to *do* something. A merely unusual link
gets no such lift, or every newsletter with a tracking domain becomes an alert. That function is
pure and exported precisely so this judgement is testable without a WASM runtime.

`analyzeText` stays synchronous and stays a character-for-character match with the Dart engine;
link scoring needs ONNX and therefore an await, so it composes on top rather than being folded in.
The parity tests keep meaning what they say.

## 3a. Two clients, one set of artifacts

`web/src/lib/risk` is a direct port of `app/lib/services`: the same regex patterns, the same
multipliers, the same gate, the same band boundaries. That duplication is a real risk — a
correction fixed on one client and forgotten on the other produces two products that
disagree about whether a payment is safe, which is worse than either being wrong alone.

Three things hold them together:

**One copy of each model.** `web/scripts/sync-assets.mjs` copies `scam_text_model.json` and
`qr_risk_model.onnx` out of `app/assets/models` before every web build, and
`web/public/models` is gitignored. There is no second checked-in copy that can drift.

**One fixture file.** `app/test/fixtures/text_model_parity.json` is generated from the
Python pipeline and read by *both* `text_model_parity_test.dart` and the web
`parity.test.ts`. Each client is pinned to Python at 1e-6, so they are transitively pinned
to each other.

**Overlapping behavioural tests.** The web suite re-runs the same six legitimate Indian SMS,
the same four scams, and the same feature-order assertion as the Dart suite. Passing your
own tests is not evidence of agreeing with the other client; running the other client's
tests is.

The QR model needs no port at all — the identical `.onnx` file runs through ONNX Runtime
Mobile on Android and ONNX Runtime Web (WASM) in the browser. Only the seven-feature
extraction is reimplemented, and that is exactly what the feature-order test guards.

The web runtime is single-threaded WASM on purpose. Threaded ORT requires `SharedArrayBuffer`,
which requires COOP/COEP cross-origin isolation headers on every page that embeds the
checker — a real constraint on anyone wanting to drop this into their own site, in exchange
for nothing measurable on a seven-feature forest.

---

## 3b. Recourse for the wrongly flagged

The community database can flag a real merchant. Three people acting in bad faith, or three
people who each genuinely believed they were scammed by a payee who was not at fault, is
enough. For a small business that flag is lost income for as long as it stands, so the way
out is designed alongside the way in rather than left to a support address.

`pattern_appeals` is insert-only under RLS, exactly like `reports`. Two functions carry the
rest:

- `appeal_status(reference)` — `SECURITY DEFINER`, returns six fields for one reference.
  Because the table has no SELECT policy, this is the only read path, and it cannot
  enumerate. The reference is 12 hex characters from `gen_random_bytes`, so it is not an
  oracle for other merchants' appeals.
- `resolve_appeal(reference, status, note)` — `SECURITY DEFINER`, and deliberately **not**
  granted to `anon` or `authenticated`. It runs from the dashboard or a service_role key.

Upholding an appeal sets `active = false` **and** `overturned = true` in the same
transaction as the status change. The `overturned` flag is separate from resetting
`report_count` because otherwise the next report would re-activate a pattern that has
already been reviewed and cleared — the aggregation trigger reads
`active = (report_count + 1) >= threshold and not overturned`. Reports keep accruing so a
genuinely fraudulent payee that appealed successfully is still visible to a reviewer.

The appeal counts are exposed in `live_stats` and rendered on the dashboard. How often the
system flags the wrong payee is the number a fraud tool is least inclined to publish, and
the one that most deserves to be public.

---

## 3c. The threat-intel API

`/api/v1/{lookup,patterns,stats,appeal}` are Next.js route handlers over the same views the
app reads. They exist for two reasons.

**Reach.** The most useful place for this intelligence is not our app — it is inside the
payment flow the user already trusts. An open, CORS-enabled, key-less JSON API is the
lowest-friction way for a bank or another UPI app to consume it.

**A stable shape.** The response format is ours to keep stable even if the storage behind it
changes, and the wording can carry the caveats a raw table cannot.

The most important of those caveats is a naming decision: the lookup response field is
`listed`, not `safe`. `listed: false` means *not confirmed by the community* and nothing
more — the structural and text models that produce a verdict run on the client and are not
reachable from the API. A field called `safe` would invite an integrator to treat a miss as
a green light, which is precisely the wrong reading.

An unconfigured deployment answers `503 backend_unconfigured` rather than `200` with an
empty list. Empty data would read as "nothing has been reported", which is a different and
false claim.

---

## 4. Community database design

### Schema

Three tables. `scam_patterns` carries a `kind` column (`'vpa' | 'phone'`) so the same
table, trigger, threshold, and RLS policies cover phone numbers as well as UPI IDs without
duplicating any of the design.

### Aggregation runs inside Postgres

`on_report_created` is an `AFTER INSERT` trigger on `reports`. When a report arrives, it
upserts the corresponding pattern, increments `report_count`, merges reason codes, and
flips `active` once the threshold is met — all in the same transaction as the insert.

There is **no application server**. Nothing to deploy, nothing to keep awake, nothing that
can be down while the app is being used. This is a deliberate architectural choice, not a
shortcut: an aggregation job that requires a running process is a component that can fail
silently and leave the community database permanently empty.

The trigger is `SECURITY DEFINER` with a pinned `search_path`, so it can write
`scam_patterns` (which no client role may touch) without being hijackable by a
caller-controlled search path.

### The poisoning guard

```sql
constraint reports_one_per_device unique (vpa, kind, device_hash)
```

A pattern activates at **three distinct devices**. Because the constraint is in the
database, three reports from one phone are physically rejected as duplicates — the
guarantee does not depend on app-side logic that a modified client could skip.

`device_hash` is 24 random bytes from `Random.secure()`, generated once per install and
stored locally. It is **not** derived from any device identifier. It exists solely to make
"distinct devices" countable.

### RLS policies

| Table | Policy | Consequence |
|---|---|---|
| `scam_patterns` | SELECT where `active = true` | Sub-threshold patterns are invisible to everyone |
| `reports` | INSERT only, no SELECT policy | Write-only from any client — reports can never be read back |
| `risk_logs` | INSERT only, no SELECT policy | Same |

`live_stats` is a view exposing **counts only** — no VPA, device token, score, or
individual row. Publishing which VPAs sit *below* the threshold would let anyone watch what
is being reported before the community has confirmed it, defeating the purpose of having a
threshold.

---

## 5. Voice alerts

Setting the TTS locale alone is not localization — the engine would read *English words*
with an Indian accent. `AlertPhrases` holds actual translated sentences for each risk level
and each fraud-signal kind, in English, Hindi, Kannada, and Marathi.

The failure mode that matters: if the device has **no voice pack** for the selected
language, feeding it Devanagari produces noise. `TtsService.setLanguage()` checks
`isLanguageAvailable()` first and falls back to English text **and** English voice together
— never a mismatched pair.

Speech rate is set to **0.48** (roughly half default). A safety warning read at normal TTS
speed is hard to follow, particularly for the users most at risk.

---

## 6. Android build decisions

Three settings that are non-obvious and each fix a real, reproducible failure:

**`useLegacyPackaging = true`** — The ONNX binding opens `libonnxruntime.so` through Dart
FFI *by soname*. With the modern default (`extractNativeLibs=false`), nothing is written to
`/data/data/<pkg>/lib/` at install time, so `dlopen` cannot resolve it and the risk engine
fails to start. `libflutter.so` is unaffected because the framework maps it separately —
which makes the failure look ONNX-specific when it is really a packaging default.

**`kotlin.incremental=false`** — Kotlin's incremental compiler memory-maps `.tab` cache
files under `app/build` and intermittently fails to close them, breaking plugin compilation
with `Could not close incremental caches`. Full builds cost slightly more time and always
succeed.

**JVM target normalization in `android/build.gradle.kts`** — Some plugin AARs set their own
Java `compileOptions` from an `afterEvaluate` callback, leaving Java at 11 while Kotlin
stays at 1.8, a mismatch newer Kotlin Gradle plugins reject outright. The override runs
inside `gradle.projectsEvaluated`, after every project has finished evaluating, so no
plugin script can win the ordering race against it.

---

## 7. Scope boundaries

Deliberate exclusions, recorded so they are not mistaken for oversights:

**Android only, for the *app*.** SMS and QR interception require platform access iOS does
not grant. The web checker covers iOS and desktop for the manual paths — pasting a payload,
a UPI ID, or a message — but it cannot read an incoming SMS or intercept a scan, and no
amount of web work would change that.

**No accounts, no login, on either client.** Neither needs an identity to function: scan
history is local, and the report threshold uses a random per-install or per-browser token.
There is no user database to breach, and asking a scam-wary user to create an account
before checking a QR is the worst possible first interaction. The one place a persistent
handle exists is the appeal reference code, which is deliberately the only key to that row.

**The public website does not document the method.** Model names, thresholds, multipliers and
feature lists appear in this repository and in the README, which is where they can be reviewed
properly. The site itself explains *what* was checked in the user's own terms — what the message
asks of you, who sent it, where the link really goes — and never *how*. That is a product decision
about a public marketing surface, not an attempt to make the system unauditable: everything is
here.

**A QR that is not a payment is refused, not scored.** `classifyQrPayload` gates the checker before
the engine runs: website links, Wi-Fi configs, vCards, plain text and Bharat QR / EMVCo payloads
are named and declined. Scoring them would produce a confident number about a question nobody
asked, and "Safe" on a phishing-link QR would be actively harmful. The gate lives in the UI layer
rather than in `RiskEngine`, so the engine stays identical to the Dart one and the parity tests
keep their meaning; the Android scanner should grow the same gate.

**Appeals are reviewed out of band.** `resolve_appeal` is a database function called from
the Supabase dashboard or with a service_role key; there is no built reviewer UI. Building
one would mean building authentication, roles, and an audit trail for a queue that is empty
on a new deployment — and a reviewer console that nobody is authenticated into would be
decoration. The database side of the workflow is complete and enforced; the console is not
claimed anywhere.

**No live call blocking.** TRAI's July 2026 clarification bars third-party apps from
tagging, blocking, or filtering 1600-series calls under the TCCCPR. The `kind` column keeps
the community database ready for phone-number lookup and reporting, which is permitted, but
real-time call interception is not built.
