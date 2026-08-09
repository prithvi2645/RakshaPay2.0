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

**Android only.** SMS and QR interception require platform access iOS does not grant.

**No accounts, no login.** The app needs no identity to function: scan history is local,
and the report threshold uses a random per-install token. There is no user database to
breach, and asking a scam-wary user to create an account before checking a QR is the worst
possible first interaction.

**No live call blocking.** TRAI's July 2026 clarification bars third-party apps from
tagging, blocking, or filtering 1600-series calls under the TCCCPR. The `kind` column keeps
the community database ready for phone-number lookup and reporting, which is permitted, but
real-time call interception is not built.
