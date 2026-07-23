"""Poke the trained step-role classifier with your own prompts.

    # one-off prompts (quote each):
    cd backend && .venv/bin/python -m ml.try_classifier "Summarize the article in 3 sentences"

    # several at once:
    .venv/bin/python -m ml.try_classifier "Is this spam? yes/no" "Write a haiku about rain"

    # interactive: run with no args, then type a prompt per line (Ctrl-D to quit):
    .venv/bin/python -m ml.try_classifier

Shows the decision from classify_role (role + variance, or DECLINED if under the
confidence floor) and the full probability spread across every role, so you can
see how close the call was.
"""

from __future__ import annotations

import sys

from services.fingerprinter import _embed
from services.step_classifier import MIN_CONFIDENCE, classify_role, _load


def show(prompt: str) -> None:
    bundle = _load()
    if bundle is None:
        print("no trained artifact — run:  python -m ml.train_step_classifier")
        return

    emb = _embed(prompt)
    pred = classify_role(emb)

    # Full distribution for insight (classify_role only returns the winner).
    clf = bundle["clf"]
    proba = clf.predict_proba([emb])[0]
    ranked = sorted(zip(clf.classes_, proba), key=lambda kv: kv[1], reverse=True)

    decision = (
        f"{pred.role} (variance={pred.variance})"
        if pred.role
        else f"DECLINED — top class under {MIN_CONFIDENCE:.2f} floor"
    )
    print(f"\n  {prompt}")
    print(f"  -> {decision}   confidence={pred.confidence:.2f}")
    print("     " + "  ".join(f"{role}:{p:.2f}" for role, p in ranked))


def main() -> None:
    prompts = sys.argv[1:]
    if prompts:
        for p in prompts:
            show(p)
    else:
        print("Type a prompt per line (Ctrl-D to quit):")
        for line in sys.stdin:
            line = line.strip()
            if line:
                show(line)


if __name__ == "__main__":
    main()
