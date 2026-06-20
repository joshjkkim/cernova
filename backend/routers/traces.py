from fastapi import APIRouter, HTTPException, Query

from schemas.trace import TraceRecord
from services.trace_service import get_trace, list_traces

router = APIRouter(prefix="/traces", tags=["traces"])


@router.get("", response_model=list[TraceRecord])
def get_traces(limit: int = Query(default=100, ge=1, le=500)) -> list[TraceRecord]:
    return list_traces(limit=limit)


@router.get("/{trace_id}", response_model=TraceRecord)
def get_trace_by_id(trace_id: str) -> TraceRecord:
    trace = get_trace(trace_id)
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace
