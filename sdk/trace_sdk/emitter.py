import httpx

from .models import IngestPayload


def emit_trace(ingest_url: str, payload: IngestPayload) -> str:
    response = httpx.post(
        ingest_url,
        json=payload.model_dump(exclude_none=False),
        timeout=10.0,
    )
    response.raise_for_status()
    data = response.json()
    return str(data["trace_id"])
