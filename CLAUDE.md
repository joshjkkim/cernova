# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**trace.ai** — "Datadog + Sentry for AI workflows." Wraps LLM calls to capture tokens, latency, and cost, scores each call for anomalies, streams traces to a FastAPI backend, and renders them live on a Next.js dashboard.

The data flow is the architecture; understand it before changing anything:

```
Your app
  └─ SDK (wrapAnthropic / LangChain handler)  →  fire-and-forget POST /ingest
       FastAPI /ingest (backend/routers/ingest.py)
         ├─ INSERT into Supabase CALLS  →  returns trace_id immediately
         └─ background threads (never block the response):
              ├─ fingerprint → step_profile_id → anomaly scoring (anomaly/ package)
              │     └─ on hit: INSERT ANOMALIES, fire user Sentry + Slack alerts
              └─ error / error-rate Slack alerts
       Supabase Realtime  →  Next.js dashboard (live)
```

The golden rule, enforced everywhere: **`/ingest` must return without waiting on scoring or alerting.** All of that runs in `threading.Thread(..., daemon=True)`. Keep it that way.

## Components

| Dir | Stack | Purpose |
|---|---|---|
| `sdk/` | TypeScript (`@trace-ai/sdk`), built with `tsup` | Wraps an Anthropic client; measures latency, extracts tokens/cost, POSTs to `/ingest` |
| `python-sdk/` | Python (`trace-ai-python` / `traceai`) | Same job; LangChain callback handler is the primary path |
| `backend/` | FastAPI + Supabase (`supabase-py`) | Ingest API, trace/run queries, anomaly persistence, Slack/Sentry alerts |
| `backend/anomaly/` | Pure Python, zero backend imports | The anomaly detection engine (the canonical `anomaly` package) |
| `frontend/` | Next.js 16 + React 19 + Tailwind v4 | Live dashboard, reads CALLS via Supabase Realtime |
| `sample-app/` | TypeScript | End-to-end demo + seed script against a real backend |

`anomaly/` at the repo root is a stale, untracked `__pycache__` artifact — ignore it. The real package lives at `backend/anomaly/`.

## Commands

All `npm run` commands below are from the **repo root** unless noted.

```bash
# Run everything at once (sdk watch + backend + frontend, color-prefixed)
npm run dev

# Or individually:
npm run backend     # FastAPI on :8000 (uvicorn --reload)
npm run frontend    # Next.js on :3000
npm run demo        # sample-app real Anthropic calls → backend → Supabase → dashboard
npm run seed        # populate CALLS with synthetic data
npm run chatbot     # interactive sample chatbot
```

First-time setup (see README.md for env var details): create `backend/.venv`, `pip install -r requirements.txt`, copy each `.env.example`, and **`cd sdk && npm install && npm run build`** — sample-app links the SDK via `file:../sdk`, so rebuild the SDK after any change under `sdk/src/`.

```bash
# SDK
cd sdk && npm run build      # one-shot (tsup); npm run dev = watch
cd sdk && npm run typecheck  # tsc --noEmit
cd sdk && node smoke-test.mjs     # or e2e-test.mjs

# Backend run (direct)
cd backend && .venv/bin/uvicorn main:app --reload --port 8000

# Anomaly tests (flat layout — bare-name imports, package dir on sys.path)
cd backend/anomaly && pytest
cd backend/anomaly && pytest tests/test_layer_1_hard.py    # single file
# Without pytest (also prints each layer's EvalResult):
backend/.venv/bin/python backend/anomaly/tests/test_evaluator.py

# Frontend
cd frontend && npm run build   # next build; npm run dev for local
```

There is no repo-wide test/lint runner — each component is tested on its own.

## The anomaly engine (`backend/anomaly/`)

Self-contained, pure-Python, no I/O. One call in (`CallInput`), one report out (`EvalResult`). The backend connects through a thin adapter (`CallInput.model_validate(payload.model_dump())`); the package owns all detection logic.

- **Layers run in order** `L1_hard → L2_format → L3_behavioral → L4_integers → L5_statistical` (`evaluator.py`). Each fired condition adds its **penalty** to a running `total_score` recorded in `error_map`. After each layer, if `total_score >= threshold` (default **100**, `config.py`) the call is flagged and evaluation **short-circuits** (`stopped_at_layer`).
- **A clean run stores nothing** — returns `hits=[]`, `error_map={}`, `total_score=0`.
- **Penalties live in `condition_registry.py`** (code → name, penalty, description), not in the layer files. The UI maps codes to human labels from this registry. Tune penalties/threshold via `EvalConfig` without editing layers. L1 penalties are 100 (any single hit flags); L4 penalties are small (10–25) so anomalies require a *cluster* of numeric oddities.
- **L5 baselines** are per-step: when a `step_profile_id` exists, `baseline_service.compute_baseline` feeds IQR Tukey-fence stats for latency/tokens/cost, and L4 defers its raw threshold checks (4001–4003) to avoid double-counting.
- **L3 behavioral** (`layers/layer_3_behavioral/`) is its own subpackage with two jobs, one file each: `behavior_vector.py` BUILDs the 778-d behavior fingerprint (incl. `classify_goal_type`), `layer.py` COMPAREs it to the per-step centroid (cosine drift → condition 3010). The fingerprint is built at ingest off the response path and stored on `CALLS.behavior_vector`; the centroid comes from `services/behavior_baseline_service.py`. See `backend/anomaly/README.md` for the current layer reference.

### Per-project tuning (in `ingest.py`)

L4 limits are resolved per call before scoring:
- `threshold_mode == "manual"` → use project's `threshold_latency_ms/tokens/cost` overrides.
- otherwise (`"dynamic"`) → `_dynamic_l4_limits` computes p95 from the last 100 calls (scoped to `step_profile_id` if set), but only once ≥30 calls exist.

## Conventions that matter

- **SDK payload shape is the contract.** `IngestPayload` (`backend/schemas/trace.py`) mirrors the Supabase `CALLS` columns and the SDK `TracePayload`. Changing a field means touching the SDK(s), the schema, the table (add a `backend/migrations/*.sql`), and likely `CallInput`. Keep all four in sync.
- **`prompt` is JSON** of `{system, messages}` in SDK format. `ingest.py:_extract_instruction` unwraps it to readable text before anomaly scoring so JSON wrapper keys don't trip L2/L5 format checks.
- **Runs vs. calls:** steps sharing a `run_id` are one workflow run (`WorkflowRun`/`WorkflowMetrics`). Sentry transactions derive a deterministic `trace_id` from `run_id` so all steps reconstruct into one trace.
- **Migrations are forward-only SQL** in `backend/migrations/` (plus `supabase/migrations/`); apply manually against Supabase. Full schema dumps (`*backup*.sql`) are gitignored.
- **Frontend Next.js is intentionally bleeding-edge** (v16). Per `frontend/AGENTS.md`: APIs and conventions may differ from training data — consult `node_modules/next/dist/docs/` before writing frontend code, and heed deprecation notices.
- **Alerting is per-project and opt-in.** Slack (`slack_webhook_url`, `slack_anomaly_level`) and the user's own Sentry (`sentry_dsn`, `sentry_alert_level`) are read off the project row; `"none"` disables. Levels: `warning` fires on any sub-threshold hit, `critical` only on a triggered anomaly.

## Deployment

Backend runs on Railway (default SDK target `https://trace-production-940c.up.railway.app`, see `backend/Procfile`). Frontend on Vercel (`https://use-trace-ai.vercel.app`). Both SDKs ship to package registries (`@trace-ai/sdk`, `trace-ai-python`).
