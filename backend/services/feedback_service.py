"""Feedback capture + effect dispatch.

Two responsibilities, deliberately separate:
  1. store_feedback — ALWAYS persist the human verdict as a structured label.
     This is the irreplaceable part (can't be backfilled) and runs for every
     subject type, including ones with no mechanical effect yet.
  2. apply_feedback — run the small, local mechanical effect a verdict implies.

Today only contract verdicts have an effect wired (confirm → enforce, reject →
rejected). Anomaly false-alarm re-inclusion in baselines and diagnosis ratings
are label-only for now — their effects are scoped fast-follows.
"""

from __future__ import annotations

from db import get_client
from schemas.feedback import FeedbackInput
from services.contract_service import promote_contract, reject_contract


def store_feedback(project_id: str | None, inp: FeedbackInput) -> str:
    """Persist the label. Raises on failure — losing a label defeats the point,
    so the caller should surface the error (e.g. migration not run)."""
    res = get_client().table("feedback").insert({
        "project_id":   project_id,
        "subject_type": inp.subject_type,
        "subject_id":   inp.subject_id,
        "verdict":      inp.verdict,
        "detail":       inp.detail,
    }).execute()
    return str(res.data[0]["id"])


def apply_feedback(inp: FeedbackInput) -> str:
    """Run the mechanical effect for this verdict. Returns a short description of
    what happened (surfaced in the response). Label-only subjects return 'stored'."""
    if inp.subject_type == "contract":
        if inp.verdict == "confirm":
            return "contract_enforced" if promote_contract(inp.subject_id) else "contract_not_found"
        return "contract_rejected" if reject_contract(inp.subject_id) else "contract_not_found"

    # anomaly / diagnosis: label captured, mechanical effect is a fast-follow
    return "stored"
