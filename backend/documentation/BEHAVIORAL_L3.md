# Behavioral L3 (Pillar 2 drift) — design & integration

Per-step **behavioral drift** detection: does this call behave like past clean
calls on this step? Replaces the removed heuristic L3 (`layer_3_fingerprinting.py`)
with a 778-dimensional embedding fingerprint compared to a learned centroid from
clean history. Complements L2 format checks (prompt-implied contracts) and the
learned output contract system (Pillar 3): L2/contract catch violations you can
name; L3 catches silent regressions — prompt changes, model swaps, output-style
drift — that pass every rule.

**Status: implemented and merged into `new_anomaly_model`.** Wired into ingest via
`process_canonical()` → `_run_fingerprint_then_anomaly()` in
`routers/ingest.py`. Unit tests pass locally. Migration
`migrations/add_behavior_vectors.sql` must be applied manually in Supabase before
vectors persist; until then background `UPDATE behavior_vector` fails silently
(ingest still succeeds, L3 stays cold).

Deep reference: [`documentation/behavioral_embedding_model.md`](../../documentation/behavioral_embedding_model.md).

## The core idea

Two parallel systems, one embedder (`all-MiniLM-L6-v2` in `embedding_service.py`):

| System | Question | Vector | Owner |
|--------|----------|--------|-------|
| Fingerprinter | Which step? | 384-d system prompt | `services/fingerprinter.py` |
| L3 behavioral | Is it drifting? | 778-d behavior vector | `anomaly/layers/layer_3_behavioral/` |

Key design choices:

- **BUILD at ingest, COMPARE in pure package** — the anomaly package has zero DB
  and zero model I/O. Ingest builds the vector, stores it on `CALLS`, passes it
  into `evaluate_call()`.
- **System prompt only** for the semantic block — not merged user text. User
  messages vary per call; including them would pollute the drift signal.
- **Cold start** — L3 returns no hits until ≥20 clean stored vectors exist for
  the step profile (same pattern as L5 statistical baselines).
- **3010 reuse** — old 3010 was a word-count cap; new 3010 is `behavior_drift`
  (+35 pts). Same code number, completely different semantics.

## Architecture

All ingest sources (SDK, OTel) flow through `CanonicalTrace` before this pipeline.

```
POST /ingest
    │
    ├─ to_canonical()  →  CanonicalTrace
    ├─ SYNC: ingest_trace() → INSERT CALLS → return trace_id
    │
    └─ BACKGROUND THREAD (_run_fingerprint_then_anomaly)
           │
           ├─ fingerprinter.match_or_create_profile(kernel) → step_profile_id
           ├─ classify_goal_type(system_prompt)
           ├─ build_behavior_vector(call, embed) → 778-d
           ├─ UPDATE CALLS.behavior_vector (+ goal_type on new profiles)
           └─ _run_anomaly_detection()
                  ├─ compute_baseline()           → L5 StepBaseline
                  ├─ compute_behavior_baseline()  → L3 BehaviorBaseline
                  └─ evaluate_call()  L1→L2→L3→L4→L5
                         └─ 3010 if cosine_distance > 0.35
```

**Post-merge `CallInput` wiring** (`routers/ingest.py`):

- `prompt` — `payload.instruction_text()` (merged system+user; L2 format checks)
- `system_prompt` — `payload.system or extract_system_prompt(raw_prompt)` (L3
  prompt embed)
- `behavior_vector` — pre-built in the background thread, passed into scoring

Package boundary:

- `anomaly/` — BUILD math (`behavior_vector.py`), COMPARE (`layer.py`), registry
- `services/` — DB queries, embedder singleton, baseline computation
- `routers/ingest.py` — orchestration (never blocks the `/ingest` response)

## Behavior vector spec (778 dims)

Built by `build_behavior_vector()` in `anomaly/layers/layer_3_behavioral/behavior_vector.py`.
Full vector is L2-normalized as one unit vector.

| Block | Dims | Weight | Source |
|-------|------|--------|--------|
| `prompt_embed` | 384 | 1.0 | System prompt only, first 500 chars |
| `output_embed` | 384 | 2.0 | `output_code` first 500 chars; empty → zero vector |
| `numeric_block` | 6 | 1.0 | log1p: latency_ms, total_tokens, output_tokens, input_tokens, cost, output_char_len |
| `goal_type` | 4 | 0.5 | One-hot: Lookup, Extract, Transform, Creative |

**Block weighting (added 2026-07-04):** each block is L2-normalized to unit
length, scaled by its weight, then the concatenation is normalized once more.
Without this, the raw log1p numeric block (values ~5–8 vs unit-norm embeddings)
carried ~98% of the vector's mass — real output-style drift measured a cosine
distance of ~0.008 vs the 0.35 threshold, so 3010 could never fire. Output gets
2× weight because the prompt and goal blocks are identical for every call on
the same step; output style must be able to cross the threshold on its own.
Vectors built before this change are **not comparable** to new ones — clear
stored `behavior_vector` values (or wait for `last_evolved_at` to reset the
window) when deploying.

**Goal type:** rule-based keyword classifier on system prompt
(`classify_goal_type`). Order: Extract → Transform → Creative → Lookup; default
Transform. Stored on `step_profiles.goal_type` for **new** profiles only.

**Centroid:** mean of last 200 clean `behavior_vector` rows, then L2-normalized.
Computed by `services/behavior_baseline_service.py`. Filters mirror L5
(`baseline_service.py`):

- Same `step_profile_id`
- `status_success = true`, `behavior_vector IS NOT NULL`
- Exclude `anomaly_triggered = true`
- Optional model filter
- Only calls after `step_profiles.last_evolved_at` (prompt evolution cutoff)
- Minimum **20** samples or baseline is `None` → L3 returns `[]`

**Drift metric:** cosine distance `1 - similarity` between call vector and
centroid. Default threshold **0.35** (`EvalConfig.behavior_drift_threshold`).

## Pipeline integration

**Order:** `L1_hard → L2_format → L3_behavioral → L4_integers → L5_statistical`

**Condition 3010 (`behavior_drift`):**

- Penalty **35** from `condition_registry.py`
- Anomaly threshold **100** — 3010 alone rarely triggers; combines with L2/L4/L5
  and contract codes for full flag
- Requires both `config.behavior_baseline` and `payload.behavior_vector`; either
  missing → no L3 hits

**L2 vs L3 prompt handling:**

- L2 uses merged `prompt` (system + user messages)
- L3 `prompt_embed` uses **system only** via `system_prompt` — do not merge user
  content into the behavioral prompt block

**Ingest hooks** (`routers/ingest.py`):

- `_run_fingerprint_then_anomaly()` — fingerprint, BUILD vector, persist to DB
- `_run_anomaly_detection()` — load baselines, `evaluate_call()`, contract check,
  alerts

## Database changes

**Migration:** `migrations/add_behavior_vectors.sql` (apply manually in Supabase)

```sql
ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS behavior_vector vector(778);

CREATE INDEX IF NOT EXISTS idx_calls_behavior_vector ON "CALLS" (step_profile_id)
  WHERE behavior_vector IS NOT NULL;

ALTER TABLE step_profiles ADD COLUMN IF NOT EXISTS goal_type text;
```

**Prerequisites:**

- `add_step_profiles.sql` — `step_profiles`, `CALLS.step_profile_id`, pgvector,
  `match_step_profile()` RPC
- `baseline_hardening.sql` — `CALLS.anomaly_triggered`,
  `step_profiles.last_evolved_at`

## Tuning knobs

| Knob | Location | Default |
|------|----------|---------|
| `behavior_drift_threshold` | `EvalConfig` in `anomaly/config.py` | 0.35 |
| Anomaly threshold | `EvalConfig.threshold` | 100 |
| 3010 penalty | `anomaly/condition_registry.py` | 35 |
| `MIN_SAMPLES` | `behavior_baseline_service.py` | 20 |
| `HISTORY_LIMIT` | `behavior_baseline_service.py` | 200 |
| Fingerprinter match / evolved | `fingerprinter.py` | 0.92 / 0.75 |
| Embedding model | `embedding_service.py` | `all-MiniLM-L6-v2` |

No per-project UI tuning for L3 drift threshold yet — code-level `EvalConfig` only.

Alerts use `CONDITION_REGISTRY[3010].name` → `behavior_drift` in Slack/Sentry
via `ingest.py`.

## What replaced old L3

`anomaly/layers/layer_3_fingerprinting.py` was deleted. Old vs new at a glance:

| | Old L3 (heuristic) | New L3 (behavioral) |
|---|---|---|
| Signal | Shape/bracket/JSON-key heuristics | 778-d embedding drift vs history |
| History | None (stateless) | Requires stored `behavior_vector` rows |
| Codes | 3010–3014 (5 conditions) | 3010 only (`behavior_drift`) |
| Prompt input | Merged `prompt` | `system_prompt` for embed block |
| Overlap with L2 | High | Low — complements L2 |

Old 3010 = word count exceeded prompt cap. New 3010 = cosine drift from centroid.

## Testing

Unit tests (no DB, no model download for most):

```bash
cd backend/anomaly
../.venv/bin/python tests/test_goal_type.py
../.venv/bin/python tests/test_behavior_vector.py
../.venv/bin/python tests/test_layer_3_behavioral.py
../.venv/bin/python tests/test_evaluator.py
```

| Test file | Covers |
|-----------|--------|
| `tests/test_behavior_vector.py` | Vector length, L2 norm, empty output, cosine distance |
| `tests/test_goal_type.py` | Keyword classifier |
| `tests/test_layer_3_behavioral.py` | Near/far centroid → 3010, cold start |
| `tests/test_evaluator.py` | Full pipeline L3 scenario |

Not covered: `behavior_baseline_service.py` (Supabase), `embedding_service.py`
(real model load), ingest E2E.

## Rollout checklist

1. Apply `add_behavior_vectors.sql` in Supabase SQL editor
2. Verify `step_profiles` table + pgvector + `match_step_profile()` RPC exist
3. Seed or run ≥20 clean calls per step profile to warm the L3 baseline
4. Confirm `[anomaly] L3 behavior baseline for profile=…` logs after ingest
5. Trigger drift manually (change system prompt or output style) and verify 3010
   appears in dashboard / Slack / Sentry alerts

**Verified end-to-end 2026-07-04** against a full local production stack
(Docker Supabase + pgvector + PostgREST, real backend, real MiniLM embedder):
30 clean calls warmed the baseline (n=30, 2 step profiles), 3 drifted calls all
fired 3010 (+2001/2003, score 120, triggered, `anomaly_triggered` set), clean
calls stayed sub-threshold. Fixes required to get there:

- `behavior_baseline_service.py` had a syntax error (stray `1` before the
  docstring) that aborted **every** scoring run with a step profile.
- Fingerprinter thundering-herd: concurrent cold-start ingests all missed the
  match RPC before any INSERT committed → duplicate profiles. Now serialized
  behind `_profile_lock` in `fingerprinter.py` (per-process; multi-worker
  deployments can still race — DB-side dedup is future hardening).
- Block weighting in `behavior_vector.py` (see vector spec above).

## Open questions

- **Self-inclusion in centroid** — the current call's vector is written to DB,
  then `compute_behavior_baseline()` runs without excluding `trace_id`. Same
  pattern as L5 `baseline_service`; excluding the scoring call is future
  hardening.
- **`goal_type` metadata only** — stored in baseline and shown in `EvalHit.expected`,
  but not used in drift math; only set on **new** profiles, not updated on
  **evolved** ones.
- **No service-level tests** — baseline computation edge cases (pgvector string
  format, evolution cutoff, model filter) untested.
- **Reserved codes 3011–3019** — registry reserves the L3 behavioral range for
  future ablation or block-level decomposition.
- **Docs drift** — `devpost.md` still describes old heuristic L3; update separately.
- **Embedder concurrency** — high ingest volume queues on a single `_model_lock`
  in `embedding_service.py`.

## Cross-links

- Deep reference: [`documentation/behavioral_embedding_model.md`](../../documentation/behavioral_embedding_model.md)
- Layer reference: [`anomaly/README.md`](../anomaly/README.md)
- Sibling pillar: [`CONTRACT_SYSTEM.md`](CONTRACT_SYSTEM.md) (learned output
  contracts, wired post-merge)
