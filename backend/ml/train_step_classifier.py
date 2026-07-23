"""Train the step-role classifier.

Reads the labelled seed set, embeds each system prompt with the SAME
all-MiniLM-L6-v2 model the fingerprinter uses at ingest (so training and
inference embeddings are identical), fits a multinomial LogisticRegression on the
384-dim vectors, reports cross-validated accuracy, and saves the artifact.

    cd backend && .venv/bin/python -m ml.train_step_classifier
    cd backend && .venv/bin/python -m ml.train_step_classifier --confusion

--confusion also prints the confusion matrix (which role gets mistaken for which),
so you can see exactly where to aim more training examples.

Expand accuracy by adding rows to step_training_data.jsonl (hand-written, or
generated — one LLM call per example) and re-running.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import classification_report, confusion_matrix

from services.fingerprinter import _embed

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(HERE, "step_training_data.jsonl")
MODEL_PATH = os.path.join(HERE, "step_classifier.joblib")
EMBED_MODEL = "all-MiniLM-L6-v2"


def load_data() -> tuple[list[str], list[str]]:
    prompts, roles = [], []
    with open(DATA_PATH) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            prompts.append(row["system_prompt"])
            roles.append(row["role"])
    return prompts, roles


def print_confusion(y, y_pred, labels: list[str]) -> None:
    """Rows = true role, cols = predicted role. The diagonal is correct."""
    cm = confusion_matrix(y, y_pred, labels=labels)
    print("\nconfusion matrix (rows=true, cols=predicted):")
    print("            " + " ".join(f"{l[:4]:>5}" for l in labels))
    for i, l in enumerate(labels):
        print(f"  {l:10} " + " ".join(f"{cm[i][j]:5d}" for j in range(len(labels))))


def main(confusion: bool = False) -> None:
    prompts, roles = load_data()
    print(f"loaded {len(prompts)} examples across {len(set(roles))} roles: {sorted(set(roles))}")

    print("embedding (all-MiniLM-L6-v2)...")
    X = np.array([_embed(p) for p in prompts])
    y = np.array(roles)

    clf = LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced")

    # Cross-validated accuracy — the honest signal on this much data.
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=0)
    y_pred = cross_val_predict(clf, X, y, cv=cv)
    acc = float((y_pred == y).mean())
    print(f"\n5-fold CV accuracy: {acc:.1%}\n")
    print(classification_report(y, y_pred, digits=2, zero_division=0))
    if confusion:
        print_confusion(y, y_pred, sorted(set(roles)))

    # Fit on everything for the shipped artifact.
    clf.fit(X, y)
    joblib.dump(
        {
            "clf": clf,
            "roles": sorted(set(roles)),
            "embed_model": EMBED_MODEL,
            "n_samples": len(prompts),
            "cv_accuracy": acc,
            "trained_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        },
        MODEL_PATH,
    )
    size_kb = os.path.getsize(MODEL_PATH) / 1024
    print(f"\nsaved {MODEL_PATH} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Train the step-role classifier.")
    ap.add_argument("--confusion", action="store_true", help="also print the confusion matrix")
    args = ap.parse_args()
    main(confusion=args.confusion)
