"""Statistical-baseline layer — per-step-profile deviation from learned history.

Two decision modes per scalar, chosen by what the MetricStat carries:

CONFORMAL (preferred — when stat.calibration is present): the observed value is
ranked against the step's clean historical values and converted to a split-
conformal p-value; the scalar fires when p <= max(alpha, p_floor) where
p_floor = 1/(n+1) (2/(n+1) two-sided) is the smallest p n samples can certify.
Guarantee: on exchangeable (normal) traffic at most alpha of calls fire per
scalar — finite-sample, distribution-free, invariant to raw-vs-log transforms.

LEGACY (fallback — no calibration): Tukey fence in log space,
  anomalous  iff  log(x) > log(Q3) + k * log_IQR  (or below the lower fence),
k = EvalConfig.iqr_fence_k. Kept for stats built without calibration sets.

Which signals are scored — and their transform, anomalous tail, and score-vs-
trigger behaviour — is declared once in anomaly/scalars.py, not hardcoded here.
Scored today: 5001 latency_ms, 5002 total_tokens, 5003 cost, 5004 output_tokens,
5010 semantic_surprise.

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

    def fire(spec: ScalarSpec, observed: float, desc: str) -> None:
        cond = describe(spec.code)
        hits.append(EvalHit(
            condition_code=cond.code,
            layer=cond.layer,
            rule_name=cond.name,
            step_name=payload.step_name,
            run_id=payload.run_id,
            penalty=config.penalty_for(cond.code, cond.penalty),
            message=cond.description,
            observed=round(observed, 4),
            expected=desc,
        ))

    for spec in SCALAR_SPECS:
        stat: MetricStat | None = getattr(baseline, spec.key, None)
        observed = getattr(payload, spec.key, None)
        if stat is None or observed is None:
            continue

        if stat.calibration:
            # --- conformal path: rank-based p-value, guaranteed false-alarm rate
            res = stat.conformal_p(observed, spec.tail)
            if res is None:
                continue
            p, direction = res
            n = len(stat.calibration)
            p_floor = (2.0 if spec.tail == "both" else 1.0) / (n + 1)
            threshold = max(config.conformal_alpha, p_floor)
            if p > threshold:
                continue
            if spec.action != "score":
                continue
            fire(spec, float(observed),
                 f"conformal: p={p:.4f} <= {threshold:.4f} "
                 f"(alpha={config.conformal_alpha}, n={n} clean samples, {direction} history)")
            continue

        # --- legacy path: Tukey fence (log space when the stat carries it)
        deviation = stat.iqr_deviation(observed, k=k)
        if deviation is None:
            continue
        if spec.tail == "upper" and deviation < 0:
            continue
        if spec.tail == "lower" and deviation > 0:
            continue
        if spec.action != "score":
            continue

        direction = "above upper fence" if deviation > 0 else "below lower fence"
        if stat.log_transform and stat.log_q1 is not None:
            desc = (f"log-IQR fence: Q1={stat.q1:.2f} Q3={stat.q3:.2f} "
                    f"log_IQR={stat.log_iqr:.3f} k={k} "
                    f"(deviation={deviation:+.2f} IQR-widths, {direction})")
        else:
            desc = (f"IQR fence: Q1={stat.q1:.2f} Q3={stat.q3:.2f} "
                    f"IQR={stat.iqr:.2f} k={k} "
                    f"(deviation={deviation:+.2f} IQR-widths, {direction})")
        fire(spec, float(observed), desc)

    return hits
