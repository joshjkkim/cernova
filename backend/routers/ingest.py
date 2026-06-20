from fastapi import APIRouter

from schemas.trace import IngestPayload, IngestResponse
from services.trace_service import ingest_trace

router = APIRouter(tags=["ingest"])

#IM gong to get some json files that is able to read and then the payload is going to be 
@router.post("/ingest", response_model=IngestResponse)
def ingest(payload: IngestPayload) -> IngestResponse:
    trace_id = ingest_trace(payload)
    return IngestResponse(trace_id=trace_id)
