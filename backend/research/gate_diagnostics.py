"""Which steps should the forward model (L1) actually be fitted for?

Production gates L1 on the step's ROLE (FIT_ROLES). That gate is a proxy and it
misfires in both directions: a profile the classifier declined (role NULL) is
skipped even when its mapping is perfectly learnable, and 'generator' steps that
happen to be predictable are skipped too.

This measures, per profile, three candidate gates on the SAME clean history the
service fits on:

  rho     Pearson corr over all call PAIRS of (cos input_i,input_j) vs
          (cos output_i,output_j) — "similar inputs -> similar outputs".
          Cheap, but understates DISCRETE-output steps: a label step's output
          similarity is bimodal, so a linear correlation reads low even though
          the mapping is a perfectly learnable step function.

  q3      Third quartile of the out-of-fold surprise distribution — how TIGHTLY
          the fitted model predicts this step. This is the fence itself.

  decoy   Share of calls where the true output scored LESS surprising than a
          same-step output drawn from a dissimilar input (all eligible decoys,
          not one sample). Direct measure of the power we actually want.

    cd backend && .venv/bin/python -m research.gate_diagnostics
"""

from __future__ import annotations

import numpy as np

from db import get_client
from services.fingerprinter import _embed
from services.forward_model_service import (
    HISTORY_LIMIT,
    MIN_DECOY_WIN,
    MIN_SAMPLES,
    _cross_validate,
    _percentile,
    _unit,
    _user_text,
)


def clean_history(db, profile_id: str, last_evolved_at: str | None) -> list[dict]:
    """The exact query services/forward_model_service._fit runs."""
    q = (db.table("CALLS").select("prompt,output_code")
         .eq("step_profile_id", profile_id)
         .eq("status_success", True)
         .or_("anomaly_triggered.is.null,anomaly_triggered.eq.false")
         .order("created_at", desc=True)
         .limit(HISTORY_LIMIT))
    if last_evolved_at:
        q = q.gte("created_at", last_evolved_at)
    return q.execute().data or []


def pair_rho(X: np.ndarray, Y: np.ndarray) -> float:
    iu = np.triu_indices(len(X), k=1)
    xs = (X @ X.T)[iu]
    ys = (Y @ Y.T)[iu]
    if xs.std() < 1e-9 or ys.std() < 1e-9:
        return float("nan")
    return float(np.corrcoef(xs, ys)[0, 1])


def main() -> None:
    db = get_client()
    profiles = (db.table("step_profiles")
                .select("id,step_name,role,last_evolved_at")
                .execute().data or [])
    print(f"{len(profiles)} step profiles\n")
    print(f"{'step':22} {'role':10} {'n':>4} {'rho':>7} {'oof q3':>8} {'decoy':>7} {'gated':>6}")
    print("-" * 70)

    rows_out = []
    for p in profiles:
        rows = clean_history(db, p["id"], p.get("last_evolved_at"))
        pairs = [(_user_text(r.get("prompt")), r.get("output_code")) for r in rows]
        pairs = [(i, o) for i, o in pairs if i.strip() and o]
        name = str(p.get("step_name"))[:22]
        role = str(p.get("role"))
        if len(pairs) < MIN_SAMPLES:
            print(f"{name:22} {role:10} {len(pairs):>4}   {'—':>5} {'—':>8} {'—':>7}   (thin)")
            continue

        X = _unit(np.array([_embed(i) for i, _ in pairs]))
        Y = _unit(np.array([_embed(o) for _, o in pairs]))
        rho = pair_rho(X, Y)
        # The production gate itself — imported, never reimplemented here. An
        # earlier copy of this loop disagreed with it by 11 points on ties.
        oof, wins, trials = _cross_validate(X, Y)
        q3 = _percentile(sorted(oof), 0.75)
        win = wins / trials if trials else float("nan")
        gated = "fit" if win >= MIN_DECOY_WIN else "skip"
        print(f"{name:22} {role:10} {len(pairs):>4} {rho:>7.2f} {q3:>8.3f} "
              f"{win:>6.0%} ({trials}) {gated:>6}")
        rows_out.append((name, role, rho, q3, win))

    print()
    for label, keep in (
        ("rho >= 0.55  ", lambda r: r[2] >= 0.55),
        ("oof q3 <= 0.25", lambda r: r[3] <= 0.25),
        (f"decoy >= {MIN_DECOY_WIN:.2f} ", lambda r: r[4] >= MIN_DECOY_WIN),
    ):
        kept = [r[0] for r in rows_out if keep(r)]
        print(f"{label} keeps {len(kept)}/{len(rows_out)}: {', '.join(kept)}")


if __name__ == "__main__":
    main()
