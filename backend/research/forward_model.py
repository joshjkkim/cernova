"""Prototype: per-step FORWARD MODEL — semantic surprise (L1 Perception).

For each step profile, learn g: embed(input) -> embed(output) from that step's
own stored history (ridge regression, 384->384). At inference:

    surprise = 1 - cos(g(e_in), e_out)

Low surprise: the output is what this step usually produces FOR THIS INPUT.
High surprise: well-formed or not, this output doesn't answer this input the way
this step normally does — the semantically-wrong-answer class that hard checks,
contracts, and scalar fences are all blind to.

Evaluation on held-out calls, two discriminations per test point:
  cross-step  : true output vs an output stolen from a DIFFERENT step (easy)
  within-step : true output vs another output of the SAME step whose source
                input is dissimilar (<0.9 cos) to this input (hard — a fluent,
                shape-correct, wrong answer)

    cd backend && .venv/bin/python -m research.forward_model
"""

from __future__ import annotations

import collections
import random

import numpy as np
from sklearn.linear_model import Ridge

from db import get_client
from services.fingerprinter import _embed
from research.trace_clustering import user_msg

MIN_SAMPLES = 20
TEST_FRAC = 0.25
SIM_CAP = 0.90  # within-step decoy must come from an input less similar than this
rng = random.Random(0)


def unit(M: np.ndarray) -> np.ndarray:
    return M / np.clip(np.linalg.norm(M, axis=-1, keepdims=True), 1e-9, None)


def main() -> None:
    rows = (get_client().table("CALLS")
            .select("step_profile_id,step_name,prompt,output_code")
            .limit(2000).execute().data or [])
    by_prof: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r.get("step_profile_id") and r.get("prompt") and r.get("output_code"):
            by_prof[r["step_profile_id"]].append(r)

    eligible = {p: rs for p, rs in by_prof.items() if len(rs) >= MIN_SAMPLES}
    print(f"{len(rows)} calls, {len(eligible)} step profiles with >= {MIN_SAMPLES} samples\n")

    # Embed everything once; keep per-profile arrays.
    data = {}
    for p, rs in eligible.items():
        ins = [user_msg(r["prompt"]) for r in rs]
        keep = [i for i, t in enumerate(ins) if t.strip()]
        if len(keep) < MIN_SAMPLES:
            continue
        X = unit(np.array([_embed(ins[i]) for i in keep]))
        Y = unit(np.array([_embed(rs[i]["output_code"]) for i in keep]))
        data[p] = {"name": rs[0].get("step_name"), "X": X, "Y": Y}

    win_within_all, win_cross_all = [], []

    for p, d in data.items():
        X, Y = d["X"], d["Y"]
        n = len(X)
        idx = list(range(n)); rng.shuffle(idx)
        n_test = max(3, int(n * TEST_FRAC))
        te, tr = idx[:n_test], idx[n_test:]

        g = Ridge(alpha=1.0).fit(X[tr], Y[tr])
        pred = unit(g.predict(X[te]))

        s_true = 1 - (pred * Y[te]).sum(-1)

        # within-step decoys: another output of the SAME step, from a dissimilar input
        wins_w, wins_c = [], []
        others = [q for q in data if q != p]
        for k, i in enumerate(te):
            cands = [j for j in tr if float(X[i] @ X[j]) < SIM_CAP]
            if cands:
                j = rng.choice(cands)
                s_decoy = 1 - float(pred[k] @ Y[j])
                wins_w.append(s_true[k] < s_decoy)
            if others:
                q = rng.choice(others)
                Yq = data[q]["Y"]
                s_x = 1 - float(pred[k] @ Yq[rng.randrange(len(Yq))])
                wins_c.append(s_true[k] < s_x)

        win_within_all += wins_w
        win_cross_all += wins_c
        w = f"{np.mean(wins_w):.0%} ({len(wins_w)})" if wins_w else "n/a (inputs too repetitive)"
        c = f"{np.mean(wins_c):.0%} ({len(wins_c)})" if wins_c else "n/a"
        print(f"  {str(d['name'])[:20]:20} n={n:3}  surprise(true)={s_true.mean():.3f}  "
              f"beats within-step decoy: {w:22} cross-step: {c}")

    print()
    if win_within_all:
        print(f"OVERALL — true output scored less surprising than a same-step wrong-input decoy: "
              f"{np.mean(win_within_all):.0%} of {len(win_within_all)} trials")
    if win_cross_all:
        print(f"OVERALL — vs cross-step decoy: {np.mean(win_cross_all):.0%} of {len(win_cross_all)} trials")


if __name__ == "__main__":
    main()
