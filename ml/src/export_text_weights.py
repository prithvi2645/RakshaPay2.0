"""Export the TF-IDF + LogisticRegression text model as plain JSON weights.

The Dart onnxruntime binding has patchy support for string input tensors, so
rather than depend on it for the text path, the vocabulary, IDF weights and
linear coefficients are exported and evaluated directly in Dart. The model is
linear, so this is numerically exact, not an approximation.
"""
import json
from pathlib import Path

import joblib

MODEL_PATH = Path("ml/models/scam_text_model.joblib")
OUT_PATH = Path("app/assets/models/scam_text_model.json")


def main():
    pipeline = joblib.load(MODEL_PATH)
    tfidf = pipeline.named_steps["tfidf"]
    clf = pipeline.named_steps["clf"]

    vocab = {term: int(idx) for term, idx in tfidf.vocabulary_.items()}
    payload = {
        "vocabulary": vocab,
        "idf": [float(v) for v in tfidf.idf_],
        "coef": [float(v) for v in clf.coef_[0]],
        "intercept": float(clf.intercept_[0]),
        "token_pattern": "[a-zA-Z0-9]+",
        "ngram_range": list(tfidf.ngram_range),
        "sublinear_tf": bool(tfidf.sublinear_tf),
        "lowercase": bool(tfidf.lowercase),
        "norm": tfidf.norm,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload), encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote {len(vocab)} terms to {OUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
