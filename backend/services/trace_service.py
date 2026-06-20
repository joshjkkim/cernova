from db import get_conn
from schemas.trace import IngestPayload, TraceRecord

_CALL_SELECT = """
SELECT
  id, run_id, step_name, model, prompt,
  input_tokens, output_tokens, reasoning_tokens, total_tokens,
  latency_ms, cost, status_success, error, output_code, created_at
FROM "CALLS"
"""


def _row_to_trace(row: dict) -> TraceRecord:
    return TraceRecord(
        id=str(row["id"]),
        run_id=row["run_id"],
        step_name=row["step_name"],
        model=row["model"],
        prompt=row["prompt"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        reasoning_tokens=row["reasoning_tokens"],
        total_tokens=row["total_tokens"],
        latency_ms=row["latency_ms"],
        cost=float(row["cost"]) if row["cost"] is not None else None,
        status="success" if row["status_success"] else "error",
        error=row["error"],
        output_code=row["output_code"],
        created_at=row["created_at"],
    )


def ingest_trace(payload: IngestPayload) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "CALLS" (
                  run_id, step_name, model, prompt,
                  input_tokens, output_tokens, reasoning_tokens, total_tokens,
                  latency_ms, cost, status_success, error, output_code
                ) VALUES (
                  %s, %s, %s, %s,
                  %s, %s, %s, %s,
                  %s, %s, %s, %s, %s
                )
                RETURNING id
                """,
                (
                    payload.run_id,
                    payload.step_name,
                    payload.model,
                    payload.prompt,
                    payload.input_tokens,
                    payload.output_tokens,
                    payload.reasoning_tokens,
                    payload.total_tokens,
                    payload.latency_ms,
                    payload.cost_usd,
                    payload.status != "error",
                    payload.error,
                    payload.code,
                ),
            )
            call_id = cur.fetchone()["id"]
        conn.commit()

    return str(call_id)


def list_traces(limit: int = 100) -> list[TraceRecord]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"{_CALL_SELECT} ORDER BY created_at DESC LIMIT %s",
                (limit,),
            )
            rows = cur.fetchall()
    return [_row_to_trace(row) for row in rows]


def get_trace(trace_id: str) -> TraceRecord | None:
    try:
        call_id = int(trace_id)
    except ValueError:
        return None
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"{_CALL_SELECT} WHERE id = %s",
                (call_id,),
            )
            row = cur.fetchone()
    if row is None:
        return None
    return _row_to_trace(row)
