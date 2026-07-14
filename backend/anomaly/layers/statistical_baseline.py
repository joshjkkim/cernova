"""Statistical-baseline layer — IQR/log-normal deviation from per-step-profile baseline.

Replaces the earlier z-score approach. LLM latency, cost, and token counts are
right-skewed (log-normal in practice), so z-scores against mean/std are badly
calibrated: the long tail inflates std, making true spikes look like 2σ events
when they're really 10× outliers.

Detection is via the Tukey fence in log space:
  anomalous  iff  log(x) > log(Q3) + k * log_IQR
                  log(x) < log(Q1) - k * log_IQR

k = EvalConfig.iqr_fence_k (default 2.5). The returned 'deviation' is how many
IQR-widths (in log space) the value sits outside the fence — analogous to σ but
distribution-free. A deviation of 0 means right at the fence; 1.0 means one full
IQR-width beyond it.

Which signals are scored — and their transform, anomalous tail, and score-vs-
trigger behaviour — is declared once in anomaly/scalars.py, not hardcoded here.
The four scalars scored today:
  5001  latency_ms
  5002  total_tokens
  5003  cost
  5004  output_tokens

No baseline → no hits. The numeric-thresholds layer's 4001/4002/4003 serve as the cold-start fallback.
"""

from __future__ import annotations

from ..condition_registry import describe
from ..config import EvalConfig
from ..scalars import SCALAR_SPECS, ScalarSpec
from ..schemas import CallInput, EvalHit, MetricStat


def run_statistical_baseline(payload: CallInput, config: EvalConfig) -> list[EvalHit]:
    baseline = config.baseline
    if baseline is None:
        return []

    hits: list[EvalHit] = []
    k = config.iqr_fence_k

    def fire(spec: ScalarSpec, deviation: float, observed: float, stat: MetricStat) -> None:
        cond      = describe(spec.code)
        direction = "above upper fence" if deviation > 0 else "below lower fence"
        if stat.log_transform and stat.log_q1 is not None:
            fence_desc = (
                f"log-IQR fence: Q1={stat.q1:.2f} Q3={stat.q3:.2f} "
                f"log_IQR={stat.log_iqr:.3f} k={k} "
                f"(deviation={deviation:+.2f} IQR-widths, {direction})"
            )
        else:
            fence_desc = (
                f"IQR fence: Q1={stat.q1:.2f} Q3={stat.q3:.2f} "
                f"IQR={stat.iqr:.2f} k={k} "
                f"(deviation={deviation:+.2f} IQR-widths, {direction})"
            )
        hits.append(EvalHit(
            condition_code=cond.code,
            layer=cond.layer,
            rule_name=cond.name,
            step_name=payload.step_name,
            run_id=payload.run_id,
            penalty=config.penalty_for(cond.code, cond.penalty),
            message=cond.description,
            observed=round(observed, 4),
            expected=fence_desc,
        ))

    for spec in SCALAR_SPECS:
        stat: MetricStat | None = getattr(baseline, spec.key, None)
        observed = getattr(payload, spec.key, None)
        if stat is None or observed is None:
            continue

        deviation = stat.iqr_deviation(observed, k=k)
        if deviation is None:
            continue

        # Tail gate: only fire on the side this scalar treats as anomalous.
        if spec.tail == "upper" and deviation < 0:
            continue
        if spec.tail == "lower" and deviation > 0:
            continue

        # trigger-only scalars flag the call for escalation elsewhere (e.g. an
        # LLM judge) rather than contributing a penalty here. None today.
        if spec.action != "score":
            continue

        fire(spec, deviation, observed, stat)

    return hits
