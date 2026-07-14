"""Registry of the scalar signals the statistical-baseline fence scores.

The Tukey fence is signal-agnostic: it takes a stream of one numeric value over a
step profile's history and flags a new value that falls outside [Q1 - k*IQR,
Q3 + k*IQR]. This registry is the single place that declares *which* signals get
a fence and how each behaves:

  transform — how the value's distribution is shaped before the fence.
              "log"   right-skewed positives (latency, cost, tokens).
              "raw"   already roughly symmetric.
              "logit" bounded [0, 1] semantic scores (cosine relevance/grounding).
  tail      — which side is anomalous. "upper" (a spike is bad), "lower"
              (a drop is bad, e.g. relevance falling), or "both".
  action    — "score" folds a penalty into the anomaly total; "trigger" only
              flags the call for escalation (e.g. an LLM judge) without scoring —
              the path for signals embeddings can't judge reliably on their own.

Today every spec maps to a CALLS column already carried on both CallInput
(observed value) and StepBaseline (its MetricStat). Semantic scalars register
here once their values are computed and stored; the fence itself needs no change,
and a future step classifier will gate which specs are active per step role.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Transform = Literal["log", "raw", "logit"]
Tail = Literal["upper", "lower", "both"]
Action = Literal["score", "trigger"]


@dataclass(frozen=True)
class ScalarSpec:
    key: str            # attr name on StepBaseline (its MetricStat) and CallInput (observed)
    code: int           # condition code fired when the value leaves the fence
    transform: Transform
    tail: Tail
    action: Action = "score"


# The four historical scalars. transform="log" + tail="both" reproduce the
# pre-registry behaviour exactly — the fence fired on either tail. Tail is now
# explicit, so narrowing latency to "upper" (an unusually *fast* call is not an
# anomaly) becomes a one-line policy change rather than a code edit.
SCALAR_SPECS: list[ScalarSpec] = [
    ScalarSpec("latency_ms",    5001, "log", "both"),
    ScalarSpec("total_tokens",  5002, "log", "both"),
    ScalarSpec("cost",          5003, "log", "both"),
    ScalarSpec("output_tokens", 5004, "log", "both"),
]
