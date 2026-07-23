"""Verify / backfill step roles against real step profiles.

Existing profiles predate the classifier, so their role/variance_tolerance are
NULL. Their system-prompt embedding is already stored as `fingerprint`, so we can
classify them with no re-embedding.

    # DRY RUN (default) — read-only, prints predictions next to a sample prompt
    # so you can eyeball whether the roles are right:
    cd backend && .venv/bin/python -m ml.backfill_roles

    # WRITE — store role + variance for unclassified profiles:
    cd backend && .venv/bin/python -m ml.backfill_roles --write

    # also re-classify profiles that already have a role:
    cd backend && .venv/bin/python -m ml.backfill_roles --write --force
"""

from __future__ import annotations

import argparse
import ast

from db import get_client
from services.step_classifier import classify_role


def _to_vec(fingerprint) -> list[float]:
    """pgvector comes back as a list or a "[..]" string depending on driver."""
    if isinstance(fingerprint, str):
        return [float(x) for x in ast.literal_eval(fingerprint)]
    return [float(x) for x in (fingerprint or [])]


def _sample_prompt(db, profile_id: str) -> str:
    """One recent prompt for this profile, for human context in the dry run."""
    try:
        res = (
            db.table("CALLS").select("prompt")
            .eq("step_profile_id", profile_id)
            .order("created_at", desc=True).limit(1).execute()
        )
        if res.data and res.data[0].get("prompt"):
            return " ".join(res.data[0]["prompt"].split())[:90]
    except Exception:
        pass
    return "(no sample prompt found)"


def main(write: bool, force: bool) -> None:
    db = get_client()
    profiles = (db.table("step_profiles")
                .select("id,step_name,role,fingerprint").execute().data or [])
    print(f"{len(profiles)} step profiles\n")

    updated = 0
    for p in profiles:
        pid, name, current = p["id"], p.get("step_name"), p.get("role")
        pred = classify_role(_to_vec(p.get("fingerprint")))

        decision = f"{pred.role} ({pred.variance})" if pred.role else "DECLINED"
        print(f"  {str(name)[:22]:22}  cur={str(current):9}  -> {decision:22} "
              f"conf={pred.confidence:.2f}")
        print(f"      e.g. \"{_sample_prompt(db, pid)}\"")

        if write and pred.role and (force or current is None):
            db.table("step_profiles").update(
                {"role": pred.role, "variance_tolerance": pred.variance}
            ).eq("id", pid).execute()
            updated += 1

    print()
    if write:
        print(f"wrote role/variance to {updated} profile(s).")
    else:
        print("dry run — nothing written. Re-run with --write once the roles look right.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Verify/backfill step roles.")
    ap.add_argument("--write", action="store_true", help="persist predictions (else dry run)")
    ap.add_argument("--force", action="store_true", help="also overwrite profiles that already have a role")
    args = ap.parse_args()
    main(write=args.write, force=args.force)
