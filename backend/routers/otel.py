"""OpenTelemetry OTLP trace ingest.

Accepts standard OTLP/HTTP trace export at POST /v1/traces so any app already
emitting OpenTelemetry GenAI spans can point its exporter at Cernova with no SDK
change — just the endpoint URL and an Authorization header.

    OTEL_EXPORTER_OTLP_ENDPOINT=https://<cernova-host>
    OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <CERNOVA_API_KEY>

GenAI spans are mapped to CanonicalTrace by adapters/otel.py and run through the
same fingerprint + anomaly pipeline as SDK ingests. Non-GenAI spans are ignored.
Both OTLP/JSON and OTLP/protobuf encodings are accepted.
"""

import json

from fastapi import APIRouter, Request, HTTPException, Response

from adapters import otlp_json_to_canonical
from routers.ingest import _resolve_project, process_canonical

router = APIRouter(tags=["otel"])


def _protobuf_to_json(body: bytes) -> dict:
    """Decode OTLP/protobuf into the OTLP/JSON dict shape the adapter consumes.
    Requires opentelemetry-proto; raises if it isn't installed."""
    try:
        from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
            ExportTraceServiceRequest,
        )
        from google.protobuf.json_format import MessageToDict
    except ImportError as exc:  # pragma: no cover - depends on deploy env
        raise HTTPException(
            status_code=415,
            detail="OTLP/protobuf not supported on this server; send Content-Type: application/json",
        ) from exc
    msg = ExportTraceServiceRequest()
    msg.ParseFromString(body)
    # preserving_proto_field_name keeps snake_case keys; MessageToDict emits the
    # same camelCase envelope (resourceSpans, traceId, …) the JSON adapter reads.
    return MessageToDict(msg)


@router.post("/v1/traces")
async def otlp_traces(request: Request) -> Response:
    auth = request.headers.get("Authorization", "")
    api_key = auth.removeprefix("Bearer ").strip()
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    project = _resolve_project(api_key)
    if not project:
        # OTel has no per-call response, so an invalid key must fail loudly here
        raise HTTPException(status_code=401, detail="Invalid API key")

    content_type = request.headers.get("Content-Type", "")
    body = await request.body()

    if "protobuf" in content_type:
        payload = _protobuf_to_json(body)
    else:
        try:
            payload = json.loads(body)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail="Invalid OTLP JSON body") from exc

    traces = otlp_json_to_canonical(payload)
    accepted = 0
    for trace in traces:
        try:
            process_canonical(trace, project)
            accepted += 1
        except Exception as exc:
            print(f"[otel] failed to process span {trace.span_id}: {exc}")

    print(f"[otel] project={project['id']} genai_spans={len(traces)} accepted={accepted}")

    # OTLP success response is an empty ExportTraceServiceResponse.
    return Response(content="{}", media_type="application/json")
