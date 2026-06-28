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

Five layers run in order: `L1_hard → L2_format → L3_behavioral → L4_integers → L5_statistical`.
Each fired condition adds its **penalty** to a running `total_score` (recorded in
`error_map`). After each layer the threshold is checked; once
`total_score >= threshold` (default **100**) the call is flagged and evaluation
**short-circuits**, recording `stopped_at_layer`.

```
L1_hard → L2_format → L3_behavioral → L4_integers → L5_statistical
   │          │              │              │               │
   └── each fired condition: error_map[code] += penalty, then check threshold ──┘
```

A clean run (below threshold at the end) returns an empty report — `hits=[]`,
`error_map={}`, `total_score=0` — per the "clean calls store nothing" rule.

| Layer | File | Codes | Catches |
|-------|------|-------|---------|
| **L1 hard** | `layers/layer_1_hard.py` | 1001–1008 | Deterministic failures: status=False, error set, empty output, negative/inconsistent numbers, missing identity fields. Penalty 100 each → any single hit flags immediately. |
| **L2 format** | `layers/layer_2_regex.py` | 2001–2004 | Prompt-implied contracts: JSON / strict-JSON / enum / yes-no violations (25–60 pts). |
| **L3 behavioral** | `layers/layer_3_behavioral/` | 3010 | Cosine drift of the call's **behavior vector** from this step's clean-history centroid. Requires ≥20 stored vectors (`BehaviorBaseline`). |
| **L4 integers** | `layers/layer_4_integers.py` | 4001–4010 | Static numeric limits (latency/tokens/cost/ratio) + cross-field plausibility (classify/short/json bloat, high-latency-low-output, chars-per-token, zero-tokens-with-body). |
| **L5 statistical** | `layers/layer_5_statistical.py` | 5001–5004 | IQR/log-normal Tukey-fence deviations from this step's own baseline (latency/tokens/cost/output-tokens). Only fires when a `StepBaseline` is supplied. |

> **L3 vs fingerprinter:** The fingerprinter (`backend/services/fingerprinter.py`) embeds the **system prompt only** (384d) to assign `step_profile_id`. L3 builds a separate **778-d behavior vector** (system + output + numeric metrics + goal type), stores it on `CALLS.behavior_vector`, and compares it to a per-profile centroid. They answer different questions: *which step?* vs *does this call behave like past clean calls on that step?*

**L3 lives in one subpackage** — two jobs, one file each:

```
layers/layer_3_behavioral/
  behavior_vector.py  BUILD   — build_behavior_vector (incl. classify_goal_type) → the 778-d fingerprint
  layer.py            COMPARE — run_layer_3_behavioral → cosine drift vs centroid → 3010
```

Import the public surface from the package (`from anomaly.layers.layer_3_behavioral import build_behavior_vector, classify_goal_type`), not the inner modules.

Every active condition is registered in `condition_registry.py` (code → name,
penalty, description). The UI maps a code to a human label without parsing Python.
Penalties live there, not in the layer files. Tune per-code penalties or the
threshold via `EvalConfig` (`config.py`) without editing layers.

L4 penalties are intentionally small (10–25): one large number alone is rarely an
anomaly, a cluster of them is. L3 (35) and L5 penalties (20–30) are higher because
they measure drift against the step's own history.

When an L5 baseline is active it **owns** latency/tokens/cost — L4's raw threshold
checks (4001/4002/4003) defer to it to avoid double-counting.

## Behavior vector (778 dims)

Built at ingest in a background thread (`build_behavior_vector` in
`layers/layer_3_behavioral/behavior_vector.py`):

| Block | Size | Source |
|-------|------|--------|
| `prompt_embed` | 384 | System prompt only (first 500 chars; shared kernel with fingerprinter) |
| `output_embed` | 384 | `output_code` first 500 chars; empty → zero vector |
| `numeric_block` | 6 | log-scaled: latency_ms, total_tokens, output_tokens, input_tokens, cost, output_char_len |
| `goal_type` | 4 | One-hot: Lookup, Extract, Transform, Creative |

The concatenated vector is L2-normalized. Centroids are the mean of the last 200
clean vectors (same model, post-`last_evolved_at`, exclude `anomaly_triggered`),
then L2-normalized. Cold start: fewer than 20 vectors → L3 returns no hits.

**Important:** `CallInput.prompt` at ingest is the merged system+user instruction
(for L2). L3's `prompt_embed` uses `CallInput.system_prompt` (system only) — do not
merge user content into the behavioral prompt block.

## Result shape

`EvalResult`: `triggered`, `total_score`, `threshold`, `stopped_at_layer`,
`hits` (list of `EvalHit`), `error_map` (`{code: penalty}`), plus `prompt_shape`
/ `output_shape` for UI/debug and a `clean` property.

## Performance & integration

Pure in-process Python — no I/O inside the anomaly package. A typical call (all
layers) scores in tens of microseconds.

Because `/ingest` is the SDK hot path, embedding and scoring run **off the response
path** — in a daemon thread (`_run_fingerprint_then_anomaly` in
`backend/routers/ingest.py`) so the trace write returns immediately.

The backend builds `CallInput` with merged `prompt` (L2), `system_prompt` (L3
kernel), and pre-computed `behavior_vector`, then calls `evaluate_call` with
`EvalConfig(behavior_baseline=..., baseline=..., limits=...)`.

## Tests

Flat layout — modules import by bare name; the package dir is put on `sys.path`
on import. Run either way:

```bash
cd anomaly && pytest
# or, no pytest needed (also prints each layer's EvalResult):
../backend/.venv/bin/python tests/test_evaluator.py
../backend/.venv/bin/python tests/test_layer_1_hard.py
```

`tests/test_evaluator.py` covers one call per layer plus a fully clean call.
`tests/test_behavior_vector.py`, `tests/test_goal_type.py`, and
`tests/test_layer_3_behavioral.py` cover the L3 building blocks.
