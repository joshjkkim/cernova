"""OTLP ingest smoke test — sends a real OpenLLMetry-style GenAI span to
/v1/traces and confirms a 200. Verifies the live path that unit tests patch out
(auth, DB write, fingerprint thread).

Usage:
    CERNOVA_API_KEY=trace_... python3 otel_smoke_test.py
    CERNOVA_API_KEY=trace_... CERNOVA_URL=http://localhost:8000 python3 otel_smoke_test.py

Defaults to the production Railway URL. After a 200, check the dashboard for a
step named 'anthropic.chat' on run id 'smoke-<ts>' — that confirms the span was
fingerprinted and scored, not just accepted.
"""

import json
import os
import time
import urllib.request

URL = os.environ.get("CERNOVA_URL", "https://trace-production-940c.up.railway.app").rstrip("/")
KEY = os.environ.get("CERNOVA_API_KEY")

if not KEY:
    raise SystemExit("Set CERNOVA_API_KEY (a project API key from the dashboard)")

now_nano = time.time_ns()
run_id = f"smoke-{int(time.time())}"


def sv(s): return {"stringValue": s}
def iv(i): return {"intValue": str(i)}
def attr(k, v): return {"key": k, "value": v}


payload = {
    "resourceSpans": [{
        "resource": {"attributes": [attr("service.name", sv("otel-smoke-test"))]},
        "scopeSpans": [{
            "scope": {"name": "opentelemetry.instrumentation.anthropic"},
            "spans": [{
                "traceId": run_id,
                "spanId": "smokespan01",
                "name": "anthropic.chat",
                "startTimeUnixNano": str(now_nano - 340_000_000),  # 340ms ago
                "endTimeUnixNano": str(now_nano),
                "attributes": [
                    attr("gen_ai.system", sv("anthropic")),
                    attr("gen_ai.request.model", sv("claude-haiku-4-5-20251001")),
                    attr("gen_ai.usage.prompt_tokens", iv(12)),
                    attr("gen_ai.usage.completion_tokens", iv(4)),
                    attr("gen_ai.prompt.0.role", sv("system")),
                    attr("gen_ai.prompt.0.content", sv("Classify as: billing, technical, general.")),
                    attr("gen_ai.prompt.1.role", sv("user")),
                    attr("gen_ai.prompt.1.content", sv("My invoice looks wrong")),
                    attr("gen_ai.completion.0.role", sv("assistant")),
                    attr("gen_ai.completion.0.content", sv("billing")),
                ],
                "status": {"code": 1},
            }],
        }],
    }],
}

req = urllib.request.Request(
    f"{URL}/v1/traces",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"},
    method="POST",
)

print(f"POST {URL}/v1/traces  run_id={run_id}")
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        print(f"→ HTTP {resp.status}: {resp.read().decode()}")
        print(f"\n✓ accepted. Check the dashboard for step 'anthropic.chat' on run '{run_id}'.")
except urllib.error.HTTPError as e:
    print(f"→ HTTP {e.code}: {e.read().decode()}")
    raise SystemExit("✗ ingest rejected — see status above")
