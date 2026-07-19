"""Prototype: conditional-kNN surprise vs Ridge forward model — protocol v2.

The Ridge forward model predicts ONE point = the average of valid answers, which
collapses on free-text steps (many valid answers -> mushy centroid -> ~50%
discrimination on generate-reply). Conditional kNN replaces the point with
neighbors:

    surprise(x, y) = min over the K most input-similar TRAIN calls j
                     of  (1 - cos(y, y_j))

"Is this output close to ANY output this step gave for similar inputs?" — min,
not mean, so multimodality never averages away.

Protocol v2 (2026-07-18) — both methods scored in the same run on identical
splits, fixing the two power problems of the 07-15 protocol:
  (a) every eligible within-step decoy is scored per test point, not one
      random draw (~15x more comparisons from the same data);
  (b) SEEDS independent train/test splits; we report mean and min-max of the
      per-seed win rates, so split luck is visible instead of hidden.
Numbers are NOT comparable to the single-seed/single-decoy 07-15 run.

    cd backend && .venv/bin/python -m research.conditional_knn
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
K = 5
SIM_CAP = 0.90
SEEDS = 5
RIDGE_ALPHA = 1.0


def unit(M: np.ndarray) -> np.ndarray:
    return M / np.clip(np.linalg.norm(M, axis=-1, keepdims=True), 1e-9, None)


def knn_surprise(x: np.ndarray, y: np.ndarray, Xtr: np.ndarray, Ytr: np.ndarray, k: int = K) -> float:
    sims = Xtr @ x
    nbrs = np.argsort(-sims)[:k]
    return float(np.min(1.0 - Ytr[nbrs] @ y))


def _fmt(rates: list[float]) -> str:
    """mean (min-max) of per-seed win rates."""
    if not rates:
        return "n/a"
    return f"{np.mean(rates):.0%} ({min(rates):.0%}-{max(rates):.0%})"


def main() -> None:
    rows = (get_client().table("CALLS")
            .select("step_profile_id,step_name,prompt,output_code")
            .limit(2000).execute().data or [])
    by_prof: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r.get("step_profile_id") and r.get("prompt") and r.get("output_code"):
            by_prof[r["step_profile_id"]].append(r)

    data = {}
    for p, rs in by_prof.items():
        if len(rs) < MIN_SAMPLES:
            continue
        ins = [user_msg(r["prompt"]) for r in rs]
        keep = [i for i, t in enumerate(ins) if t.strip()]
        if len(keep) < MIN_SAMPLES:
            continue
        X = unit(np.array([_embed(ins[i]) for i in keep]))
        Y = unit(np.array([_embed(rs[i]["output_code"]) for i in keep]))
        data[p] = {"name": rs[0].get("step_name"), "X": X, "Y": Y}

    print(f"{len(data)} profiles >= {MIN_SAMPLES} samples, {SEEDS} seeds, all eligible decoys per test point\n")
    print(f"{'step':20} {'n':>4} {'trials/seed':>12}   {'kNN within-decoy':>22}   {'Ridge within-decoy':>22}")

    # per-seed OVERALL rates, pooled across profiles
    overall_knn: list[list[bool]] = [[] for _ in range(SEEDS)]
    overall_ridge: list[list[bool]] = [[] for _ in range(SEEDS)]

    for p, d in data.items():
        X, Y = d["X"], d["Y"]
        n = len(X)
        knn_rates, ridge_rates, trial_counts = [], [], []

        for seed in range(SEEDS):
            rng = random.Random(seed)
            idx = list(range(n)); rng.shuffle(idx)
            n_test = max(3, int(n * TEST_FRAC))
            te, tr = idx[:n_test], idx[n_test:]
            Xtr, Ytr = X[tr], Y[tr]

            g = Ridge(alpha=RIDGE_ALPHA).fit(Xtr, Ytr)
            pred = unit(g.predict(X[te]))

            wins_k: list[bool] = []
            wins_r: list[bool] = []
            for t, i in enumerate(te):
                cands = [j for j in tr if float(X[i] @ X[j]) < SIM_CAP]
                if not cands:
                    continue
                s_true_k = knn_surprise(X[i], Y[i], Xtr, Ytr)
                s_true_r = 1.0 - float(pred[t] @ Y[i])
                for j in cands:
                    wins_k.append(s_true_k < knn_surprise(X[i], Y[j], Xtr, Ytr))
                    wins_r.append(s_true_r < 1.0 - float(pred[t] @ Y[j]))

            if wins_k:
                knn_rates.append(float(np.mean(wins_k)))
                ridge_rates.append(float(np.mean(wins_r)))
                trial_counts.append(len(wins_k))
                overall_knn[seed] += wins_k
                overall_ridge[seed] += wins_r

        tc = f"{np.mean(trial_counts):.0f}" if trial_counts else "0"
        print(f"{str(d['name'])[:20]:20} {n:4} {tc:>12}   {_fmt(knn_rates):>22}   {_fmt(ridge_rates):>22}")

    o_k = [float(np.mean(w)) for w in overall_knn if w]
    o_r = [float(np.mean(w)) for w in overall_ridge if w]
    if o_k:
        print(f"\nOVERALL within-step decoy discrimination — "
              f"kNN: {_fmt(o_k)}   Ridge: {_fmt(o_r)}")


if __name__ == "__main__":
    main()
