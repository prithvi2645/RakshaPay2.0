"""Train the scam-text classifier: TF-IDF + Logistic Regression.

Evaluation discipline: the test split is REAL messages only. Synthetic UPI
rows are training-time augmentation; scoring against text generated from the
same templates the model trained on would measure template inversion, not
generalization. The metrics printed below are on held-out real messages the
model has never seen.
"""
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


def main(
    data_path="ml/data/scam_text_dataset.csv",
    model_out="ml/models/scam_text_model.joblib",
    meta_out="ml/models/scam_text_model.meta.json",
    metrics_out="ml/models/scam_text_model.metrics.json",
):
    df = pd.read_csv(data_path)
    real = df[df["origin"] == "real"]
    synthetic = df[df["origin"] == "synthetic"]

    real_train, real_test = train_test_split(
        real, test_size=0.2, random_state=42, stratify=real["label"]
    )
    train = pd.concat([real_train, synthetic]).sample(frac=1, random_state=42)

    pipeline = Pipeline([
        (
            "tfidf",
            TfidfVectorizer(
                lowercase=True,
                ngram_range=(1, 2),
                min_df=2,
                max_features=5000,
                sublinear_tf=True,
                # Dart port re-implements this exact tokenizer; \b word-boundary
                # regex isn't portable, so a plain alnum token pattern is used.
                token_pattern=r"[a-zA-Z0-9]+",
            ),
        ),
        ("clf", LogisticRegression(max_iter=1000, C=5.0, class_weight="balanced")),
    ])
    pipeline.fit(train["text"], train["label"])

    y_pred = pipeline.predict(real_test["text"])
    report = classification_report(real_test["label"], y_pred, target_names=["ham", "scam"], output_dict=True)
    print("=== Held-out REAL messages (never seen, human-written) ===")
    print(classification_report(real_test["label"], y_pred, target_names=["ham", "scam"]))
    tn, fp, fn, tp = confusion_matrix(real_test["label"], y_pred).ravel()
    print(f"true_neg={tn}  false_pos={fp}  false_neg={fn}  true_pos={tp}")
    print(f"\nTrained on {len(train)} rows ({len(real_train)} real + {len(synthetic)} synthetic UPI)")

    Path(model_out).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, model_out)

    meta = {
        "classes": pipeline.named_steps["clf"].classes_.tolist(),
        "note": "scam is class label 1",
        "training_data": {
            "real_source": "UCI SMS Spam Collection",
            "real_rows": int(len(real)),
            "synthetic_rows": int(len(synthetic)),
            "eval_note": "metrics measured on held-out REAL messages only",
        },
    }
    Path(meta_out).write_text(json.dumps(meta, indent=2))

    Path(metrics_out).write_text(json.dumps({
        "accuracy": report["accuracy"],
        "ham": {"precision": report["ham"]["precision"], "recall": report["ham"]["recall"], "f1": report["ham"]["f1-score"]},
        "scam": {"precision": report["scam"]["precision"], "recall": report["scam"]["recall"], "f1": report["scam"]["f1-score"]},
        "support": {"ham": report["ham"]["support"], "scam": report["scam"]["support"]},
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }, indent=2))
    print(f"\nWrote model to {model_out}, metrics to {metrics_out}")


if __name__ == "__main__":
    main()
