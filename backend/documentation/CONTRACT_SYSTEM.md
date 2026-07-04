# Contract system (Pillar 3) — design sketch

Per-call correctness against a **learned** output contract. Complements drift
detection: contracts are precise, per-call, and catch the failure modes you can
specify; drift is statistical, over-time, and catches the ones you can't. A
contract's pass/fail stream is itself a clean input to drift (Pillar 2).

**Status: isolated core only.** The induction (`services/contract_learner.py`),
checking (`services/contract_checker.py`), and representation
(`schemas/contract.py`) are built and tested (`tests/test_contract.py`). Nothing
is wired into ingest, the DB, or the SDKs yet — that's the next step, sketched
below.

## The core idea

The contract is not written, it's **discovered** — induced from a step's own
output history, the same way anomaly baselines are induced from its metric
history. Arbitrary per-user key names and values need no anticipation because we
observe them. "Always true" is statistical (`presence ≥ 98%` of a `≥ 20`-sample
window), never literal, so one rare-but-valid output can't lock a key out.

The representation is **frequency-annotated**, which is richer than plain JSON
Schema — it's what lets a never-before-seen enum value be a *soft* candidate-
evolution signal rather than a hard failure. A `LearnedContract` can be rendered
down to standard JSON Schema for display or external enforcement; the
annotations are the part JSON Schema can't carry.

## Where a contract comes from (three acquisition paths, no hand-authoring)

1. **Lifted from the request** (exact, free) — when the caller uses structured
   outputs / tool calling, a JSON Schema is already in the API request. The SDK
   wrappers see it; extract and store it. *Not yet built.*
2. **Learned from output history** (this sketch) — `learn_contract(outputs)`.
   Handles everyone who doesn't declare a schema. Needs history → cold start →
   another reason Langfuse import (Pillar 1) sits right before this.
3. **Proposed from the prompt** (LLM once per profile) — a model reads the
   system prompt and drafts a contract. *Not yet built.*

## Lifecycle

```
observing ──(≥ MIN_SAMPLES)──▶ proposed ──(user confirms)──▶ enforced
                                    │                              │
                                    └──────(prompt evolves)────────┘
                                      re-learn on the evolved profile
```

- **observing** — too little history; the checker enforces nothing.
- **proposed** — learned and surfaced in the dashboard; violations are logged,
  not alerted. Never silently enforce — the model may legitimately produce a new
  valid value.
- **enforced** — user has confirmed; hard violations count as anomalies.
- Re-learn when the step's fingerprint **evolves** (the 0.75–0.92 band), reusing
  the existing evolution mechanism — a changed prompt means a changed contract.

## Violation severities

- **hard** — `format_not_json`, `missing_required_key`, `wrong_type`. Contract
  breach → feeds the anomaly score.
- **soft** — `enum_new_value`, `out_of_range`. Candidate evolution/drift. Does
  not fail the call; surfaced, and is the per-call signal drift trends over time.

## How it will hook in (not yet done)

- **Storage:** attach to `step_profiles` — either a `contract jsonb` column or a
  `step_contracts` table keyed on `step_profile_id`. The profile becomes the unit
  holding identity + baseline + contract.
- **Induction:** in the post-fingerprint background thread (where anomaly
  detection already runs), when a profile crosses `MIN_SAMPLES` and has no
  proposed contract, pull its recent outputs (`CALLS.output_code`) and
  `learn_contract`. Cheap, runs once per profile, not per call.
- **Checking:** in the same thread, `check_output(payload.output_text, contract)`
  for enforced contracts; fold hard violations into the anomaly `error_map` as a
  new condition-code family (e.g. `L2:2xxx` contract codes).
- **Drift bridge:** persist per-call `passed` / soft-violation counts as a step
  time-series; Pillar 2 trends it — contract-pass-rate over time *is* the cheap
  first layer of drift.

## Tuning knobs (`contract_learner.py`)

`MIN_SAMPLES=20`, `JSON_FORMAT_THRESHOLD=0.90`, `REQUIRED_THRESHOLD=0.98`,
`ENUM_MAX_DOMAIN=8`. Same statistical spirit as the L5 fence constants.

## Open questions

- Nested-object / array-item contracts (current sketch learns top-level keys only).
- Content-inclusion contracts ("output must contain `$input.order_id`") — needs
  the resolved input variables, a separate predicate type from structure.
- Text-format steps: learn length band / language / format markers (deferred).
- When request-supplied schema (path 1) and learned schema (path 2) disagree,
  which wins? (Lean: request schema is ground truth; learned fills the gap.)
