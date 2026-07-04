# Behavioral Embedding Model (L3)

> Backend planning doc: [`backend/documentation/BEHAVIORAL_L3.md`](../backend/documentation/BEHAVIORAL_L3.md)

**Branch:** `new_anomaly_model` (uncommitted work)  
**Base commit:** `9dbd2e2` — Merge pull request #8 (langchain_package)  
**Status:** Implementation complete in working tree; migration must be applied manually in Supabase before production use.

---

## Executive summary (5 sentences)

This change replaces the removed heuristic L3 with a **behavioral embedding layer** that builds a 778-dimensional fingerprint per LLM call and compares it to a per-step-profile centroid learned from clean history. A shared local embedding model (`all-MiniLM-L6-v2`) powers both step identity (fingerprinter) and behavior vectors, while ingest orchestrates vector build, storage, baseline load, and scoring off the hot path. L3 fires condition **3010 `behavior_drift`** (+35 points) when cosine distance exceeds **0.35**, but only after **≥20 clean vectors** exist for that step profile. The anomaly package stays pure (no DB imports); all Supabase and model I/O lives in `backend/services/` and `backend/routers/ingest.py`. Unit tests pass locally; full end-to-end behavior requires running `add_behavior_vectors.sql` and seeding enough calls to warm the baseline.

---

## Table of contents

1. [Problem & goal](#problem--goal)
2. [Architecture overview](#architecture-overview)
3. [Behavior vector specification](#behavior-vector-specification)
4. [Request flow (end-to-end)](#request-flow-end-to-end)
5. [File reference (every change)](#file-reference-every-change)
6. [Pipeline integration](#pipeline-integration)
7. [Database changes](#database-changes)
8. [Configuration & alerting](#configuration--alerting)
9. [Testing guide](#testing-guide)
10. [Changes since last commit](#changes-since-last-commit)
11. [Risks & operational notes](#risks--operational-notes)

---

## Problem & goal

**Before:** Anomaly scoring ran `L1 → L2 → L4 → L5`. Old regex/heuristic L3 (`layer_3_fingerprinting.py`) overlapped L2 and was removed. Nothing measured *"does this call behave like past clean calls on this step?"*

**After:** New **L3 behavioral** detects **semantic + output + metric drift** vs a step's own history using embeddings, without hard-coding every failure mode per app.

**Separation of concerns:**

| System | Question | Vector |
|--------|----------|--------|
| Fingerprinter | Which step profile? | 384-d system prompt embed |
| L3 behavioral | Is this call drifting? | 778-d behavior vector |

---

## Architecture overview

```
SDK POST /ingest
    │
    ├─ SYNC: trace_service → INSERT CALLS → return trace_id
    │
    └─ BACKGROUND THREAD (_run_fingerprint_then_anomaly)
           │
           ├─ prompt_kernel.extract_system_prompt()
           ├─ fingerprinter.match_or_create_profile()  → step_profile_id
           ├─ classify_goal_type() + build_behavior_vector()  → 778-d
           ├─ UPDATE CALLS.behavior_vector
           ├─ compute_behavior_baseline()  → centroid (≥20 samples)
           └─ evaluate_call()  → L1→L2→L3→L4→L5
                  └─ 3010 if cosine_distance > 0.35
```

**Package boundary:**

- `backend/anomaly/` — pure logic (BUILD + COMPARE math, layers, registry)
- `backend/services/` — DB, embedding model, baselines
- `backend/routers/ingest.py` — orchestration

---

## Behavior vector specification

**Total: 778 floats**, L2-normalized as one unit vector.

| Block | Dims | Source |
|-------|------|--------|
| `prompt_embed` | 384 | System prompt only, first 500 chars (`prompt_kernel`) |
| `output_embed` | 384 | `output_code` first 500 chars; empty → zero vector |
| `numeric_block` | 6 | log1p: latency_ms, total_tokens, output_tokens, input_tokens, cost, output_char_len |
| `goal_type` | 4 | One-hot: Lookup, Extract, Transform, Creative |

**Goal type:** Rule-based keyword classifier on system prompt (`classify_goal_type` in `behavior_vector.py`). Order: Extract → Transform → Creative → Lookup; default Transform.

**Centroid:** Mean of last 200 clean `behavior_vector` rows (same filters as L5 baseline), then L2-normalized. Minimum **20** samples or L3 returns no hits.

**Drift metric:** Cosine distance `1 - similarity` between call vector and centroid. Threshold default **0.35** (`EvalConfig.behavior_drift_threshold`).

**Model:** `all-MiniLM-L6-v2` via `sentence-transformers` in `embedding_service.py` (~80MB, ~1s cold start).

---

## Request flow (end-to-end)

### 1. SDK capture (`sdk/src/wrappers/anthropic.ts`)

- Wraps `messages.create`, measures latency, extracts tokens/cost.
- Sends `prompt` as JSON string: `{"system":"...","messages":[...]}`.

### 2. Ingest hot path (`backend/routers/ingest.py` → `ingest()`)

- Resolves project from API key.
- `trace_service.ingest_trace()` inserts `CALLS` row.
- Returns `trace_id` immediately.
- Spawns daemon thread: `_run_fingerprint_then_anomaly`.

### 3. Background enrichment (`_run_fingerprint_then_anomaly`)

| Step | File | Action |
|------|------|--------|
| Extract system prompt | `backend/anomaly/prompt_kernel.py` | `extract_system_prompt(payload.prompt)` |
| Step identity | `backend/services/fingerprinter.py` | pgvector match → `step_profile_id` |
| Goal type | `backend/anomaly/layers/layer_3_behavioral/behavior_vector.py` | `classify_goal_type(system_prompt)` |
| Build vector | `backend/anomaly/layers/layer_3_behavioral/behavior_vector.py` | `build_behavior_vector(call, embed)` |
| Persist | `backend/routers/ingest.py` | `UPDATE CALLS.behavior_vector`; new profiles get `goal_type` |
| Score | `_run_anomaly_detection` | baselines + `evaluate_call()` |

### 4. Scoring inputs (`CallInput` in `backend/anomaly/schemas.py`)

- `prompt` — merged system+user text (L2); via `_extract_instruction()`.
- `system_prompt` — system only (L3 prompt embed).
- `behavior_vector` — pre-computed 778-d fingerprint.

### 5. L3 layer (`backend/anomaly/layers/layer_3_behavioral/layer.py`)

- Requires `config.behavior_baseline` and `payload.behavior_vector`.
- Fires **3010** if distance > threshold; penalty **35** from `condition_registry.py`.

---

## File reference (every change)

### New files

| File | Purpose |
|------|---------|
| `backend/anomaly/prompt_kernel.py` | Shared `extract_system_prompt()` from SDK JSON |
| `backend/services/embedding_service.py` | Shared MiniLM embedder; `embed(text) → list[float]` |
| `backend/services/behavior_baseline_service.py` | Query clean vectors → `BehaviorBaseline` centroid |
| `backend/anomaly/layers/layer_3_behavioral/__init__.py` | Public exports for L3 package |
| `backend/anomaly/layers/layer_3_behavioral/behavior_vector.py` | BUILD: goal type, vector assembly, `cosine_distance` |
| `backend/anomaly/layers/layer_3_behavioral/layer.py` | COMPARE: `run_layer_3_behavioral()` |
| `backend/migrations/add_behavior_vectors.sql` | `CALLS.behavior_vector vector(778)`, `step_profiles.goal_type` |
| `backend/anomaly/conftest.py` | Pytest: add backend root to `sys.path` |
| `backend/anomaly/tests/test_behavior_vector.py` | Vector length, normalization, distance |
| `backend/anomaly/tests/test_goal_type.py` | Keyword classifier cases |
| `backend/anomaly/tests/test_layer_3_behavioral.py` | Near/far centroid → 3010 |

### Modified files

| File | What changed |
|------|--------------|
| `backend/routers/ingest.py` | Background pipeline: build/store vector, load behavior baseline, pass `system_prompt` + `behavior_vector` into scoring |
| `backend/services/fingerprinter.py` | Refactored to use `prompt_kernel` + `embedding_service` (removed inline kernel/embed code) |
| `backend/anomaly/evaluator.py` | Pipeline `L1→L2→L3→L4→L5`; imports `run_layer_3_behavioral` |
| `backend/anomaly/condition_registry.py` | Added L3 range 3010–3019; registered **3010 behavior_drift** (35 pts) |
| `backend/anomaly/config.py` | `behavior_baseline`, `behavior_drift_threshold` (0.35) |
| `backend/anomaly/schemas.py` | `CallInput.system_prompt`, `CallInput.behavior_vector`, `BehaviorBaseline`, `LayerId` includes `L3_behavioral` |
| `backend/anomaly/README.md` | Five-layer docs, vector spec, L3 vs fingerprinter, test commands |
| `backend/anomaly/tests/test_evaluator.py` | L3 scenario uses behavioral drift + `BehaviorBaseline`; fixed `project_id` strings; layer-specific thresholds in tests |
| `backend/anomaly/tests/test_layer_1_hard.py` | Import path fix for package layout; `project_id` as string |

### Deleted files

| File | Reason |
|------|--------|
| `backend/anomaly/layers/layer_3_fingerprinting.py` | Old heuristic L3; replaced by behavioral L3 |

---

## Pipeline integration

**Order:** `L1_hard → L2_format → L3_behavioral → L4_integers → L5_statistical`

**Condition 3010:**

- **Name:** `behavior_drift`
- **Penalty:** 35 (alone usually below threshold 100; combines with other layers for full trigger)
- **Cold start:** No baseline → L3 returns `[]` (same pattern as L5)

**L2 vs L3 prompt handling:**

- L2 uses merged `prompt` (system + user).
- L3 `prompt_embed` uses **system only** via `system_prompt` — do not merge user content into behavioral prompt block.

---

## Database changes

**Migration:** `backend/migrations/add_behavior_vectors.sql`

```sql
ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS behavior_vector vector(778);
CREATE INDEX IF NOT EXISTS idx_calls_behavior_vector ON "CALLS" (step_profile_id)
  WHERE behavior_vector IS NOT NULL;
ALTER TABLE step_profiles ADD COLUMN IF NOT EXISTS goal_type text;
```

**Apply manually** in Supabase SQL editor (same process as other migrations in `backend/migrations/`).

---

## Configuration & alerting

| Setting | Location | Default |
|---------|----------|---------|
| Drift threshold | `EvalConfig.behavior_drift_threshold` in `backend/anomaly/config.py` | 0.35 |
| Anomaly threshold | `EvalConfig.threshold` | 100 |
| Min baseline samples | `behavior_baseline_service.MIN_SAMPLES` | 20 |
| History window | `behavior_baseline_service.HISTORY_LIMIT` | 200 |

Alerts use `CONDITION_REGISTRY[3010].name` → `behavior_drift` in Slack/Sentry via `ingest.py`.

---

## Testing guide

### Level 1 — Unit tests (no DB, no model download for most)

```bash
cd backend/anomaly
../.venv/bin/python tests/test_goal_type.py
../.venv/bin/python tests/test_behavior_vector.py
../.venv/bin/python tests/test_layer_3_behavioral.py
../.venv/bin/python tests/test_evaluator.py
```

Expected: all pass; L3 scenario shows `3010 behavior_drift`.

### Level 2 — Real embedder smoke

```bash
cd backend
.venv/bin/python -c "
from anomaly.layers.layer_3_behavioral import build_behavior_vector, VECTOR_DIM, classify_goal_type
from anomaly.prompt_kernel import extract_system_prompt
from anomaly.schemas import CallInput
from services.embedding_service import embed

prompt_json = '{\"system\": \"Classify the user message into billing or support.\", \"messages\": [{\"role\":\"user\",\"content\":\"hi\"}]}'
sys_prompt = extract_system_prompt(prompt_json)
print('goal_type:', classify_goal_type(sys_prompt))
call = CallInput(
    step_name='classify-intent', model='claude-haiku-4-5',
    prompt=sys_prompt, system_prompt=sys_prompt,
    input_tokens=20, output_tokens=2, total_tokens=22,
    latency_ms=180, cost=0.0004, status_success=True,
    output_code='billing', run_id='smoke',
)
vec = build_behavior_vector(call, embed)
print('vector length:', len(vec), '(expected', VECTOR_DIM, ')')
"
```

### Level 3 — Full E2E

1. Run migration in Supabase.
2. `npm run backend` (from repo root).
3. `npm run seed` (enough calls for n≥20 on a step profile).
4. Watch logs: `[anomaly] L3 behavior baseline for profile=...: n=20+`
5. Optional: drift injection on same step; look for `3010` in logs or `ANOMALIES` table.

---

## Changes since last commit

**Last commit:** `9dbd2e2` — Merge PR #8 (langchain_package)  
**Working tree:** modified + new untracked files (not yet committed)

### New features

**What changed**

- Full L3 behavioral embedding pipeline: 778-d behavior vector, per-step centroid, cosine drift detection (3010).
- Shared `embedding_service` and `prompt_kernel` used by fingerprinter and L3.
- Ingest background thread builds/stores vectors and injects `BehaviorBaseline` into scoring.
- Goal type classification and optional persistence on new `step_profiles`.

**Why it matters**

- Catches subtle behavioral regressions (output style, semantics, metrics) that L2/L4/L5 miss when individual checks still pass.
- Works for any LLM app via SDK wrap; not tied to demo step names.

**Risks**

- L3 silent until 20 clean vectors per profile (cold start).
- First embed loads ~80MB model; adds latency in background thread only.
- 3010 alone (35 pts) rarely triggers full anomaly (threshold 100) without other layers.
- Migration not applied → vector saves may fail in background (errors logged, ingest still succeeds).

### Bug fixes

**What changed**

- **`CallInput.system_prompt` vs merged `prompt`:** L3 prompt embed uses system-only text; ingest sets both explicitly (fixes design bug where merged prompt could pollute behavioral embedding).
- **Tests:** `project_id` as string in tests (Pydantic 2.13 validation).
- **Test imports:** Package-style imports + `conftest.py` for reliable pytest from `backend/anomaly`.

**Why it matters**

- Behavioral drift compares stable step identity, not per-call user messages.
- Tests run consistently in CI/local venv.

**Risks**

- Low; test-only and explicit field separation.

### Refactors

**What changed**

- `fingerprinter.py`: removed duplicate `_extract_kernel`, `_embed`, model loading → uses `prompt_kernel` + `embedding_service`.
- L3 code organized under `layers/layer_3_behavioral/` (BUILD in `behavior_vector.py`, COMPARE in `layer.py`).
- Removed dead `layer_3_fingerprinting.py` from pipeline.

**Why it matters**

- Single embedder load, single kernel extraction logic, clearer L3 module boundary.

**Risks**

- Fingerprinter and L3 now share embedder lock; high concurrency could queue on `_model_lock` (acceptable for background ingest).

### Infrastructure

**What changed**

- `backend/migrations/add_behavior_vectors.sql` — pgvector column + index + `goal_type`.
- `backend/services/embedding_service.py` — SentenceTransformer singleton.
- `backend/services/behavior_baseline_service.py` — centroid computation with same filters as L5 (model-scoped, post-evolution, exclude anomalies).

**Why it matters**

- Persistent vectors enable historical baselines and future features (e.g. incident clustering).

**Risks**

- Migration must be run manually; 778-d pgvector column must be supported (standard pgvector).
- Baseline excludes `anomaly_triggered` calls — sustained bad periods don't shift centroid (intentional).

### Tests

**What changed**

- New: `test_behavior_vector.py`, `test_goal_type.py`, `test_layer_3_behavioral.py`.
- Updated: `test_evaluator.py` (L3 behavioral scenario), `test_layer_1_hard.py` (imports).
- Added: `conftest.py`.

**Why it matters**

- L3 BUILD/COMPARE/pipeline covered without Supabase or real model (mock embedder in vector tests).

**Risks**

- E2E path (real DB + 20+ calls) not automated in repo test suite yet.

### Documentation

**What changed**

- `backend/anomaly/README.md` — five-layer pipeline, L3 vector spec, fingerprinter separation, test commands.
- This file (`documentation/behavioral_embedding_model.md`).

**Why it matters**

- Onboarding and layer reference without reading all source files.

**Risks**

- Doc may diverge from code if not updated with future L3 changes (e.g. 3011 ablation).

---

## Risks & operational notes

| Risk | Mitigation |
|------|------------|
| Migration not run | Run `add_behavior_vectors.sql`; verify `CALLS.behavior_vector` populates |
| Cold start (no L3) | Seed ≥20 clean calls per step; watch `L3 behavior baseline n=` logs |
| Background failures | Check `[fingerprint] failed` / `[behavior_baseline] failed` in backend logs |
| User text in L3 prompt | Always use `system_prompt` for embed; never merged `prompt` |
| Dual venvs | `TT/.venv` and `TT/backend/.venv` both exist; use `backend/.venv` for backend work |

---

## Quick import reference

```python
# Ingest / services
from anomaly.prompt_kernel import extract_system_prompt
from services.embedding_service import embed
from services.behavior_baseline_service import compute_behavior_baseline
from anomaly.layers.layer_3_behavioral import build_behavior_vector, classify_goal_type

# Scoring
from anomaly import evaluate_call, CallInput
from anomaly.config import EvalConfig
from anomaly.layers.layer_3_behavioral import run_layer_3_behavioral
```

---

## Related files (unchanged but involved)

| File | Role |
|------|------|
| `backend/services/baseline_service.py` | L5 numeric baseline (parallel pattern to behavior baseline) |
| `backend/services/trace_service.py` | Initial CALLS insert |
| `backend/services/anomaly_service.py` | ANOMALIES persistence |
| `backend/services/slack_service.py` | Anomaly alerts |
| `sdk/src/wrappers/anthropic.ts` | Payload source |
| `backend/schemas/trace.py` | `IngestPayload` contract |

---

*Generated from working tree diff vs commit `9dbd2e2`.*
