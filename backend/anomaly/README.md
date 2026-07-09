# anomaly

Standalone, weighted-layer scoring for traced LLM calls. Pure Python — no DB, no
FastAPI, no backend imports. One call in (`CallInput`), one report out
(`EvalResult`). The backend connects via a thin adapter; this package owns all
detection logic.

## Quick start

```python
from anomaly import evaluate_call, CallInput

result = evaluate_call(CallInput(
    step_name="classify-intent",
    model="claude-haiku-4-5",
    prompt="Is this message spam? Answer yes/no.",
    input_tokens=12, output_tokens=1, total_tokens=13,
    latency_ms=140, cost=0.0002,
    status_success=True, output_code="no",
    run_id="run_123",
))

if result.triggered:
    log(result.error_map)   # {code: penalty} for every fired condition
# result.clean is True otherwise — store nothing
```

## How scoring works

Four layers run in order. Each fired condition adds its **penalty** to a running
`total_score` (recorded in `error_map`). After each layer the threshold is
checked; once `total_score >= threshold` (default **50**) the call is flagged and
evaluation **short-circuits**, recording `stopped_at_layer`.

```
hard_failures → output_format → numeric_thresholds → statistical_baseline
   │                 │                  │                     │
   └── each fired condition: error_map[code] += penalty, then check threshold ──┘
```

Layer labels are semantic, not positional — adding or removing a layer never
leaves a misleading numeric gap. Condition codes (1xxx/2xxx/4xxx/5xxx) are frozen,
opaque identifiers persisted in the DB; their number prefix is historical and does
not track a layer's order (there is deliberately no 3xxx range — an early heuristic
shape layer was removed for overlapping with `output_format`).

A clean run (below threshold at the end) returns an empty report — `hits=[]`,
`error_map={}`, `total_score=0` — per the "clean calls store nothing" rule.

| Layer | File | Codes | Catches |
|-------|------|-------|---------|
| **hard_failures** | `layers/hard_failures.py` | 1001–1008 | Deterministic failures: status=False, error set, empty output, negative/inconsistent numbers, missing identity fields. Penalty 100 each → any single hit flags immediately. |
| **output_format** | `layers/output_format.py` | 2001–2004 | Prompt-implied contracts: JSON / strict-JSON / enum / yes-no violations. |
| **numeric_thresholds** | `layers/numeric_thresholds.py` | 4001–4010 | Numeric limits (latency/tokens/cost/ratio) + cross-field plausibility (classify/short/json bloat, high-latency-low-output, chars-per-token, zero-tokens-with-body). |
| **statistical_baseline** | `layers/statistical_baseline.py` | 5001–5004 | Per-step IQR/log-normal Tukey fence (log space) on latency, tokens, cost, output-tokens. Fires once a step has ≥20 baseline samples; owns latency/tokens/cost when active. |

Every condition is registered in `condition_registry.py` (code → name, penalty,
description). The UI maps a code to a human label without parsing Python.
Penalties live there, not in the layer files. Tune per-code penalties or the
threshold via `EvalConfig` (`config.py`) without editing layers.

`numeric_thresholds` penalties are intentionally small (10–25): one large number
alone is rarely an anomaly, a cluster of them is.

## Result shape

`EvalResult`: `triggered`, `total_score`, `threshold`, `stopped_at_layer`,
`hits` (list of `EvalHit`), `error_map` (`{code: penalty}`), plus `prompt_shape`
/ `output_shape` for UI/debug and a `clean` property.

## Performance & integration

Pure in-process Python — no I/O. Measured:

| Case | Per call |
|------|----------|
| Typical call (all 4 layers) | ~18 µs |
| Pathological 200 KB output body | ~15 ms (string scan over the body) |

For normal traffic it's effectively free. Because `/ingest` is the SDK hot path,
run scoring **off the response path** (e.g. FastAPI `BackgroundTasks` or a queue)
so the trace write returns immediately and the SDK never waits on it.

The backend adapter is a one-liner:

```python
# backend/services/anomaly_adapter.py
def evaluate_ingest(payload: IngestPayload) -> EvalResult:
    return evaluate_call(CallInput.model_validate(payload.model_dump()))
```

## Tests

Flat layout — modules import by bare name; the package dir is put on `sys.path`
on import. Run either way:

```bash
cd anomaly && pytest
# or, no pytest needed (also prints each layer's EvalResult):
../backend/.venv/bin/python tests/test_evaluator.py
../backend/.venv/bin/python tests/test_hard_failures.py
```

`tests/test_evaluator.py` covers one call per layer (each passes the earlier
layers cleanly and stops at its target layer) plus a fully clean call.
