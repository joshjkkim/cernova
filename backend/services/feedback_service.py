"""Feedback capture + effect dispatch.

Two responsibilities, deliberately separate:
  1. store_feedback — ALWAYS persist the human verdict as a structured label.
     This is the irreplaceable part (can't be backfilled) and runs for every
     subject type, including ones with no mechanical effect yet.
  2. apply_feedback — run the small, local mechanical effect a verdict implies.

Contract verdicts enforce/reject the contract. Anomaly false alarms (reject)
re-include the run's flagged calls in baselines — the fence learns from the
correction. Diagnosis ratings are label-only for now.
"""

from __future__ import annotations

import logging

from db import get_client
from schemas.feedback import FeedbackInput
from services.contract_service import promote_contract, reject_contract

log = logging.getLogger(__name__)


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


def _reinclude_run_in_baseline(project_id: str | None, run_id: str) -> int:
    """False-alarm effect: flip the run's flagged calls back to non-anomalous so
    they re-enter baselines and conformal calibration sets — the fence widens to
    absorb the corrected traffic. Scoped to the authed project so an API key can
    never touch another tenant's runs. Returns how many calls were re-included.
    The ANOMALIES rows are kept — the detection history stays auditable; the
    stored reject label records the human verdict."""
    q = (
        get_client().table("CALLS")
        .update({"anomaly_triggered": False})
        .eq("run_id", run_id)
        .eq("anomaly_triggered", True)
    )
    if project_id:
        q = q.eq("project_id", project_id)
    res = q.execute()
    return len(res.data or [])


def apply_feedback(inp: FeedbackInput, project_id: str | None = None) -> str:
    """Run the mechanical effect for this verdict. Returns a short description of
    what happened (surfaced in the response). Label-only subjects return 'stored'."""
    if inp.subject_type == "contract":
        if inp.verdict == "confirm":
            return "contract_enforced" if promote_contract(inp.subject_id) else "contract_not_found"
        return "contract_rejected" if reject_contract(inp.subject_id) else "contract_not_found"

    if inp.subject_type == "anomaly" and inp.verdict == "reject":
        # False alarm: subject_id is the run_id (anomaly cards are run-scoped).
        try:
            n = _reinclude_run_in_baseline(project_id, inp.subject_id)
        except Exception:
            log.error(f"[feedback] baseline re-inclusion failed for run={inp.subject_id}", exc_info=True)
            return "baseline_reinclusion_failed"
        return f"baseline_reincluded:{n}"

    # anomaly confirm / diagnosis: label captured, no mechanical effect
    return "stored"
