"""Train the link-risk model: RandomForest over host features -> ONNX.

Unlike the QR/VPA model, this one is evaluated on **real held-out data on both
sides** — live phishing and malware hosts against a research-grade popularity
list. That is the point of building it: it is the first model in RakshaPay whose
headline number describes measured behaviour on real adversarial data rather
than learned structural rules.

The metrics file records the corpus composition alongside the scores, because
two facts materially qualify them and would otherwise be invisible:

  * what fraction of malicious hosts are raw IP literals — an easy, real, but
    unrepresentative signal that inflates accuracy if it dominates
  * the feed snapshot date — these are live feeds, so the corpus is not
    reproducible byte-for-byte on another day
"""
import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

sys.path.insert(0, str(Path(__file__).parent))
from url_features import FEATURES, extract  # noqa: E402

# Deliberately small. A 300x12 forest scored the same on held-out data and
# exported to a 4.1 MB ONNX file — which the Android APK and every browser
# visitor would pay for. 120x10 lands under 1 MB with no measurable loss, and
# the model ships to two clients, so size is a product decision here, not a
# footnote.
N_ESTIMATORS = 120
MAX_DEPTH = 10


def main(
    data_path="ml/data/url_risk_dataset.csv",
    model_out="ml/models/url_risk_model.onnx",
    meta_out="ml/models/url_risk_model.meta.json",
    metrics_out="ml/models/url_risk_model.metrics.json",
):
    df = pd.read_csv(data_path)
    rows = [extract(host) for host in df["host"].astype(str)]
    X = pd.DataFrame(rows, columns=FEATURES).values.astype("float32")
    y = df["label"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(
        n_estimators=N_ESTIMATORS, max_depth=MAX_DEPTH, random_state=42,
        class_weight="balanced", n_jobs=-1
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    report = classification_report(
        y_test, y_pred, target_names=["benign", "malicious"], output_dict=True
    )
    print(classification_report(y_test, y_pred, target_names=["benign", "malicious"]))

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()

    # --- Is this just an IP-address detector? -------------------------------
    #
    # 60%+ of URLhaus hosts are raw IP literals. That is a real signal, but a
    # trivial one, and if the model leans on it the headline accuracy says
    # little about phishing DOMAINS — which is the case that actually reaches a
    # user through an SMS. Two checks answer the question directly rather than
    # leaving a reader to wonder.
    ip_column = FEATURES.index("is_ip_literal")
    non_ip = X_test[:, ip_column] == 0
    non_ip_report = classification_report(
        y_test[non_ip], clf.predict(X_test[non_ip]),
        target_names=["benign", "malicious"], output_dict=True, zero_division=0,
    )
    print("\n--- Held-out subset with NO raw-IP hosts ---")
    print(classification_report(
        y_test[non_ip], clf.predict(X_test[non_ip]),
        target_names=["benign", "malicious"], zero_division=0,
    ))

    # Ablation: retrain with the feature removed entirely.
    keep = [i for i in range(len(FEATURES)) if i != ip_column]
    ablated = RandomForestClassifier(
        n_estimators=N_ESTIMATORS, max_depth=MAX_DEPTH, random_state=42,
        class_weight="balanced", n_jobs=-1
    ).fit(X_train[:, keep], y_train)
    ablation_report = classification_report(
        y_test, ablated.predict(X_test[:, keep]),
        target_names=["benign", "malicious"], output_dict=True, zero_division=0,
    )
    print(f"Accuracy without is_ip_literal at all: {ablation_report['accuracy']:.4f}")

    Path(model_out).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, str(Path(model_out).with_suffix(".joblib")))

    onnx_model = convert_sklearn(
        clf,
        initial_types=[("input", FloatTensorType([None, len(FEATURES)]))],
        options={id(clf): {"zipmap": False}},
        target_opset=17,
    )
    with open(model_out, "wb") as handle:
        handle.write(onnx_model.SerializeToString())

    snapshot_path = Path("ml/data/raw/url/SNAPSHOT.txt")
    snapshot = snapshot_path.read_text().splitlines()[0] if snapshot_path.exists() else "unknown"

    malicious = df[df["label"] == 1]["host"].astype(str)
    ip_literals = sum(1 for host in malicious if extract(host)["is_ip_literal"] == 1)

    Path(meta_out).write_text(json.dumps({
        "features": FEATURES,
        "output_names": ["label", "probabilities"],
        "classes": [0, 1],
        "note": "output[1] gives per-class probabilities; malicious is class label 1",
        "scope": (
            "HOST features only. Path-level signals (.apk downloads, userinfo '@' tricks, "
            "embedded brand names) are handled by deterministic rules in url_rules, not by "
            "this model — the benign reference feed carries bare domains, so a path-aware "
            "model trained on it would learn 'has a path => malicious'."
        ),
        "training_data": "OpenPhish community feed + URLhaus (malicious), Tranco top-1M (benign)",
    }, indent=2))

    Path(metrics_out).write_text(json.dumps({
        "accuracy": report["accuracy"],
        "benign": {
            "precision": report["benign"]["precision"],
            "recall": report["benign"]["recall"],
            "f1": report["benign"]["f1-score"],
        },
        "malicious": {
            "precision": report["malicious"]["precision"],
            "recall": report["malicious"]["recall"],
            "f1": report["malicious"]["f1-score"],
        },
        "support": {
            "benign": report["benign"]["support"],
            "malicious": report["malicious"]["support"],
        },
        "confusion_matrix": {
            "true_negative": int(tn), "false_positive": int(fp),
            "false_negative": int(fn), "true_positive": int(tp),
        },
        "feature_importance": {
            name: round(float(value), 5)
            for name, value in sorted(
                zip(FEATURES, clf.feature_importances_), key=lambda pair: -pair[1]
            )
        },
        "not_just_an_ip_detector": {
            "note": (
                "60%+ of malicious hosts in the corpus are raw IP literals, which is an easy "
                "signal. These two checks show how much of the result survives without it."
            ),
            "held_out_excluding_ip_hosts": {
                "accuracy": non_ip_report["accuracy"],
                "malicious_precision": non_ip_report["malicious"]["precision"],
                "malicious_recall": non_ip_report["malicious"]["recall"],
                "support_malicious": non_ip_report["malicious"]["support"],
            },
            "ablation_feature_removed": {
                "accuracy": ablation_report["accuracy"],
                "malicious_precision": ablation_report["malicious"]["precision"],
                "malicious_recall": ablation_report["malicious"]["recall"],
            },
        },
        "corpus": {
            "total_rows": int(len(df)),
            "malicious": int((df["label"] == 1).sum()),
            "benign": int((df["label"] == 0).sum()),
            "malicious_ip_literal_share": round(ip_literals / max(len(malicious), 1), 4),
            "snapshot": snapshot,
        },
        "qualifications": [
            "Evaluated on REAL held-out hosts on both sides — not synthetic.",
            "Feeds are live; re-running on another date produces a different corpus.",
            "Benign labels come from Tranco, a POPULARITY list, not a safety list. A popular "
            "host is assumed benign unless it also appears in a malicious feed.",
            "Host-only. The model cannot see a malicious path on an otherwise clean host; "
            "that is what the deterministic rules layer is for.",
            "PhishTank is absent — its bulk download now requires a registered API key.",
        ],
    }, indent=2))

    # Stage into the app's asset folder in the same step that produced it.
    # Copying by hand is how ml/models and app/assets/models drift — the web
    # build syncs FROM app/assets/models, so a stale copy there silently ships
    # a different model to both clients than the metrics describe.
    asset_out = Path("app/assets/models/url_risk_model.onnx")
    if asset_out.parent.exists():
        asset_out.write_bytes(Path(model_out).read_bytes())
        print(f"Staged model into {asset_out}")

    print(f"\nWrote ONNX model to {model_out}, metrics to {metrics_out}")
    print(f"Malicious hosts that are raw IPs: {ip_literals / max(len(malicious), 1):.1%}")


if __name__ == "__main__":
    main()
