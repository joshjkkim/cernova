import logging

from anomaly import CONDITION_REGISTRY
from db import get_client
from schemas.anomaly import AnomalyInput, AnomalyRecord

log = logging.getLogger(__name__)

_EVIDENCE_KEYS = ("observed", "expected")


def redact_observed(code: int) -> bool:
    """True when a code's `observed` is model output text and must not be stored.

    The output_format layer sets observed=_preview(output) — the first 80 chars
    of the model's own response. Persisting model output is a deliberately
    deferred decision (privacy), so we keep `expected` (a rule description, never
    output) and drop `observed` for that layer only. Everywhere else observed is
    a number, a bool, or an error string.

    Keyed off the registry's layer rather than a code range so a code that moves
    layers stays correctly classified.
    """
    cond = CONDITION_REGISTRY.get(code)
    return cond is not None and cond.layer == "output_format"


def build_anomaly_rows(items: list[AnomalyInput], project_id: str | None) -> list[dict]:
    """Flatten inputs into ANOMALIES rows. Pure — no DB, so it is directly testable."""
    rows = []
    for item in items:
        for code_str, score in item.bad_scores.items():
            code = int(code_str)
            ev = item.evidence.get(code_str)
            row = {
                "step_name":     item.step_name,
                "run_id":        item.run_id,
                "project_id":    project_id,
                "error_code":    code,
                "penalty_score": score,
            }
            # Evidence keys are omitted rather than set to None, so this insert
            # is still valid against a DB that has not run add_anomaly_evidence.sql.
            if ev is not None:
                if ev.expected is not None:
                    row["expected"] = ev.expected
                if ev.observed is not None and not redact_observed(code):
                    row["observed"] = ev.observed
            rows.append(row)
    return rows


def strip_evidence(rows: list[dict]) -> list[dict]:
    return [{k: v for k, v in r.items() if k not in _EVIDENCE_KEYS} for r in rows]


def ingest_anomalies(items: list[AnomalyInput], project_id: str | None) -> list[AnomalyRecord]:
    """Normalize bad_scores dict into individual rows and insert them all.

    Falls back to an evidence-free insert if the columns are absent, so shipping
    this code before add_anomaly_evidence.sql degrades to the old behaviour
    instead of losing anomalies. The caller (_run_anomaly_detection) swallows
    exceptions, so an unguarded failure here would be a SILENT stop in recording.
    """
    rows = build_anomaly_rows(items, project_id)
    if not rows:
        return []

    client = get_client()
    try:
        res = client.table("ANOMALIES").insert(rows).execute()
    except Exception:
        bare = strip_evidence(rows)
        if bare == rows:
            raise                                  # nothing to do with evidence — a real failure
        log.warning(
            "[anomaly] insert with evidence failed; retrying without it. "
            "Run migrations/add_anomaly_evidence.sql to persist observed/expected.",
            exc_info=True,
        )
        res = client.table("ANOMALIES").insert(bare).execute()

    return [AnomalyRecord(**r) for r in res.data]


def get_anomalies_for_run(run_id: str) -> list[AnomalyRecord]:
    res = (
        get_client()
        .table("ANOMALIES")
        .select("*")
        .eq("run_id", run_id)
        .order("created_at")
        .execute()
    )
    return [AnomalyRecord(**r) for r in res.data]


def get_anomalies_for_project(project_id: str) -> list[AnomalyRecord]:
    res = (
        get_client()
        .table("ANOMALIES")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [AnomalyRecord(**r) for r in res.data]


def get_run_penalty_total(run_id: str) -> int:
    res = (
        get_client()
        .table("ANOMALIES")
        .select("penalty_score")
        .eq("run_id", run_id)
        .execute()
    )
    return sum(r["penalty_score"] for r in res.data)
