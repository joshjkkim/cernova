from db import get_client
from schemas.trace import IngestPayload, TraceRecord


def ingest_trace(payload: IngestPayload) -> str:
    client = get_client()
    data = {
        "step_name":       payload.step_name,
        "model":           payload.model,
        "prompt":          payload.prompt,
        "input_tokens":    payload.input_tokens,
        "output_tokens":   payload.output_tokens,
        "reasoning_tokens": payload.reasoning_tokens,
        "total_tokens":    payload.total_tokens,
        "latency_ms":      payload.latency_ms,
        "cost":            payload.cost,
        "status_success":  payload.status_success,
        "error":           payload.error,
        "output_code":     payload.output_code,
        "run_id":          payload.run_id,
        "project_id":      payload.project_id,
    }
    # Remove None values so Supabase uses column defaults
    data = {k: v for k, v in data.items() if v is not None}
    res = client.table("CALLS").insert(data).execute()
    return str(res.data[0]["id"])


def list_traces(limit: int = 100) -> list[TraceRecord]:
    client = get_client()
    res = (
        client.table("CALLS")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [_row_to_trace(row) for row in res.data]


def get_trace(trace_id: str) -> TraceRecord | None:
    client = get_client()
    res = client.table("CALLS").select("*").eq("id", trace_id).execute()
    if not res.data:
        return None
    return _row_to_trace(res.data[0])


def _row_to_trace(row: dict) -> TraceRecord:
    return TraceRecord(
        id=str(row["id"]),
        step_name=row.get("step_name"),
        created_at=row["created_at"],
        model=row.get("model"),
        prompt=row.get("prompt"),
        input_tokens=row.get("input_tokens"),
        output_tokens=row.get("output_tokens"),
        reasoning_tokens=row.get("reasoning_tokens"),
        total_tokens=row.get("total_tokens"),
        latency_ms=row.get("latency_ms"),
        cost=float(row["cost"]) if row.get("cost") is not None else None,
        status_success=row["status_success"],
        error=row.get("error"),
        output_code=row.get("output_code"),
        run_id=row["run_id"],
        project_id=row.get("project_id"),
    )