"""Train the QR/VPA structural risk model: RandomForest -> ONNX.

RandomForest rather than a gradient-boosted alternative because it converts to
ONNX through skl2onnx with no extra converter dependency, keeping the mobile
inference path simple.
"""
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

FEATURES = [
    "known_psp_suffix", "entropy", "digit_ratio", "local_part_len",
    "has_amount", "amount", "has_suspicious_keyword",
]


def main(
    data_path="ml/data/qr_risk_dataset.csv",
    model_out="ml/models/qr_risk_model.onnx",
    meta_out="ml/models/qr_risk_model.meta.json",
    metrics_out="ml/models/qr_risk_model.metrics.json",
):
    df = pd.read_csv(data_path)
    X = df[FEATURES].values.astype("float32")
    y = df["label"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=42, class_weight="balanced")
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    report = classification_report(y_test, y_pred, target_names=["legit", "fraud"], output_dict=True)
    print(classification_report(y_test, y_pred, target_names=["legit", "fraud"]))

    Path(model_out).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, str(Path(model_out).with_suffix(".joblib")))

    onnx_model = convert_sklearn(
        clf,
        initial_types=[("input", FloatTensorType([None, len(FEATURES)]))],
        options={id(clf): {"zipmap": False}},
        target_opset=17,
    )
    with open(model_out, "wb") as f:
        f.write(onnx_model.SerializeToString())

    meta = {
        "features": FEATURES,
        "output_names": ["label", "probabilities"],
        "classes": [0, 1],
        "note": "output[1] gives per-class probabilities; fraud is class label 1",
        "training_data": "synthetic — no public dataset of fraudulent UPI QR/VPA strings exists",
    }
    Path(meta_out).write_text(json.dumps(meta, indent=2))

    Path(metrics_out).write_text(json.dumps({
        "accuracy": report["accuracy"],
        "legit": {"precision": report["legit"]["precision"], "recall": report["legit"]["recall"], "f1": report["legit"]["f1-score"]},
        "fraud": {"precision": report["fraud"]["precision"], "recall": report["fraud"]["recall"], "f1": report["fraud"]["f1-score"]},
        "support": {"legit": report["legit"]["support"], "fraud": report["fraud"]["support"]},
        "note": "measured on synthetic held-out data — see meta for the disclosed limitation",
    }, indent=2))
    print(f"\nWrote ONNX model to {model_out}, metrics to {metrics_out}")


if __name__ == "__main__":
    main()
