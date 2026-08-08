"""Does ranking free-text outputs by distance-from-history surface anything real?

The whole free-text design rests on one claim: for a step where no contract can be
induced and the forward model has no power, we can still ORDER today's outputs so
the ones worth a human's attention float to the top. Ranking is a weaker claim
than a verdict — it needs no threshold and no calibration — but it's still a claim,
and this measures it against real stored traffic before anything gets built.

Scoring is marginal, not conditional: distance to the step's own output cloud,
NOT "distance from what this input deserved". For a free-text step that's all
that's available — the conditional version IS the forward model, and it measured
53% on generate-reply.

    cd backend && .venv/bin/python -m research.unusualness              # list steps
    cd backend && .venv/bin/python -m research.unusualness generate-reply
    cd backend && .venv/bin/python -m research.unusualness supervisor --k 5 --top 8

Reads only. Nothing is written and no schema is touched.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys

import numpy as np

from db import get_client
from services.fingerprinter import _embed
from services.forward_model_service import _unit, _user_text

K_DEFAULT = 5
SCAN_CAP = 4000


# ── the lexical pathology checks, which need no model at all ────────────────

def _words(t: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", (t or "").lower())


def _system_text(raw_prompt: str | None) -> str:
    """System prompt as stored — the thing an output must never quote back."""
    if not raw_prompt:
        return ""
    try:
        obj = json.loads(raw_prompt)
    except Exception:
        return ""
    if isinstance(obj.get("system"), str):
        return obj["system"]
    for m in obj.get("messages", []) or []:
        if m.get("role") == "system":
            return str(m.get("content", ""))
    return ""


def prompt_leak(system: str, out: str, window: int = 8) -> int:
    """Longest run of consecutive words the output shares with the system prompt."""
    sw, ow = _words(system), _words(out)
    if len(sw) < window or len(ow) < window:
        return 0
    shingles = {" ".join(sw[i:i + window]) for i in range(len(sw) - window + 1)}
    best = 0
    run = 0
    for i in range(len(ow) - window + 1):
        if " ".join(ow[i:i + window]) in shingles:
            run = run + 1 if run else window
            best = max(best, run)
        else:
            run = 0
    return best


def repetition(out: str, span: int = 5, times: int = 3) -> int:
    """Most times any n-word phrase repeats — a degeneration loop."""
    w = _words(out)
    if len(w) < span * times:
        return 0
    c = collections.Counter(" ".join(w[i:i + span]) for i in range(len(w) - span + 1))
    top = c.most_common(1)[0][1] if c else 0
    return top if top >= times else 0


def truncated(out: str) -> bool:
    o = (out or "").rstrip()
    return len(o) > 40 and o[-1] not in ".!?\"')]}:；。！？"


def non_ascii_ratio(out: str) -> float:
    o = out or ""
    letters = [c for c in o if c.isalpha()]
    return sum(1 for c in letters if ord(c) > 127) / len(letters) if letters else 0.0


# ── the ranking itself ──────────────────────────────────────────────────────

def knn_distance(Q: np.ndarray, C: np.ndarray, k: int,
                 leave_one_out: bool) -> tuple[np.ndarray, np.ndarray]:
    """kNN distance from each row of Q to the cloud C.

    Returns (mean of the k nearest distances, distance to the single nearest).
    The k-mean is the stable ranking signal; the 1-nearest is reported beside it
    because it answers a different question — "is this near ANYTHING we've said
    before" — and is the more permissive of the two.

    leave_one_out drops the self-match when Q IS C. Injected probes are scored
    against the real cloud only, never against each other, or a planted cluster
    would vouch for itself.
    """
    sim = Q @ C.T
    if leave_one_out:
        np.fill_diagonal(sim, -np.inf)
    part = np.sort(sim, axis=1)[:, ::-1]    # descending similarity
    kk = min(k, part.shape[1])
    # Clamped: exact duplicates land a hair below zero in float.
    return (np.maximum(1.0 - part[:, :kk].mean(1), 0.0),
            np.maximum(1.0 - part[:, 0], 0.0))


# Planted failures, to measure whether the ranking would CATCH one. Each is a
# failure mode a free-text step actually exhibits in production; none of them is
# detectable by a contract, a regex, or a latency fence.
PROBES: list[tuple[str, str]] = [
    ("flat refusal",
     "I'm not able to help with that. Please contact support for further assistance."),
    ("apology loop",
     "I apologize for the confusion. I apologize for the confusion. I apologize for "
     "the confusion. I apologize for the"),
    ("wrong language",
     "Je peux vous aider avec votre demande. Pouvez-vous me donner plus de details "
     "sur le probleme que vous rencontrez?"),
    ("confident fabrication",
     "Acme AI was founded in 2011 by Dr. Helen Marsh and now serves 4.2 million "
     "developers across 190 countries, with a 99.999% uptime SLA guaranteed."),
    ("truncated mid-sentence",
     "Sure! To get started with the platform you'll want to install the SDK and then "
     "configure your API key in the"),
    ("on-topic control (should NOT rank high)",
     "Hey! Welcome to Acme AI support. I'm here to help with our developer "
     "observability platform. What can I help you with today?"),
    # The known blind spot, stated as a probe so the table has to admit it.
    # Perfect shape, ordinary vocabulary, and the decision contradicts its own
    # stated reason. Marginal distance CANNOT see this — the output is a normal
    # member of the cloud. Only an input-conditional model (the forward model)
    # or a judge can. A MISS here is the correct, expected result.
    ("wrong route, valid shape (blind spot)",
     '{ "route": "general", "reasoning": "The user is reporting a billing issue '
     'and requesting a refund for a duplicate charge." }'),
]


def rank_percentile(v: np.ndarray) -> np.ndarray:
    """Share of the population this call is further-from-normal than."""
    order = v.argsort().argsort()
    return order / max(len(v) - 1, 1) * 100.0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("step", nargs="?", help="step name or step_profile_id")
    ap.add_argument("--k", type=int, default=K_DEFAULT)
    ap.add_argument("--top", type=int, default=6)
    ap.add_argument("--inject", action="store_true",
                    help="plant known failures in the cloud and report where they rank")
    args = ap.parse_args()

    db = get_client()
    profiles = db.table("step_profiles").select("id,step_name,role").execute().data or []
    by_id = {p["id"]: p for p in profiles}

    rows = (db.table("CALLS")
            .select("id,step_profile_id,prompt,output_code,created_at")
            .order("created_at", desc=True).limit(SCAN_CAP).execute().data or [])
    per_profile: dict[str, list[dict]] = collections.defaultdict(list)
    for r in rows:
        if r.get("step_profile_id") and r.get("output_code"):
            per_profile[r["step_profile_id"]].append(r)

    if not args.step:
        print(f"{'step':24} {'role':10} {'calls w/ output':>16}  profile")
        print("-" * 78)
        for pid, rs in sorted(per_profile.items(), key=lambda kv: -len(kv[1])):
            p = by_id.get(pid, {})
            print(f"{str(p.get('step_name'))[:24]:24} {str(p.get('role')):10} "
                  f"{len(rs):>16}  {pid}")
        print("\nPass a step name (or profile id) to rank its outputs.")
        return

    # Resolve to the matching profile holding the most calls.
    cands = [pid for pid in per_profile
             if pid == args.step or (by_id.get(pid, {}).get("step_name") or "") == args.step]
    if not cands:
        cands = [pid for pid in per_profile
                 if args.step.lower() in (by_id.get(pid, {}).get("step_name") or "").lower()]
    if not cands:
        sys.exit(f"no step profile matching {args.step!r} has stored outputs — "
                 f"run without arguments to list them")
    pid = max(cands, key=lambda p: len(per_profile[p]))
    prof = by_id.get(pid, {})
    calls = per_profile[pid]

    outs = [c["output_code"] for c in calls]
    print(f"\nstep       {prof.get('step_name')}   (role={prof.get('role')}, profile={pid})")
    print(f"outputs    {len(outs)}   ·   ranking by mean distance to {args.k} nearest neighbours\n")
    if len(outs) < args.k + 3:
        sys.exit("too few stored outputs to rank meaningfully")

    Y = _unit(np.array([_embed(o) for o in outs]))
    kdist, nearest = knn_distance(Y, Y, args.k, leave_one_out=True)
    pct = rank_percentile(kdist)

    q = np.percentile(kdist, [50, 90, 99])
    print(f"distance   p50 {q[0]:.3f}   p90 {q[1]:.3f}   p99 {q[2]:.3f}   "
          f"max {kdist.max():.3f}\n")

    def show(title: str, idxs) -> None:
        print("=" * 96)
        print(title)
        print("=" * 96)
        for rank, i in enumerate(idxs, 1):
            c = calls[i]
            sys_txt = _system_text(c.get("prompt"))
            out = (outs[i] or "").strip().replace("\n", " ")
            flags = []
            if (n := prompt_leak(sys_txt, out)):
                flags.append(f"PROMPT-LEAK({n}w)")
            if (n := repetition(out)):
                flags.append(f"REPETITION(x{n})")
            if truncated(out):
                flags.append("TRUNCATED?")
            if non_ascii_ratio(out) > 0.15:
                flags.append("NON-ASCII")
            print(f"\n[{rank}] dist={kdist[i]:.3f}  nearest={nearest[i]:.3f}  "
                  f"further-than {pct[i]:.1f}% of this step   {c.get('created_at','')[:19]}")
            if flags:
                print("     flags: " + "  ".join(flags))
            print(f"     in : {_user_text(c.get('prompt'))[:150]}")
            print(f"     out: {out[:260]}")
        print()

    order = kdist.argsort()[::-1]
    show(f"MOST UNUSUAL — the {args.top} a human should read", order[:args.top])
    show("MOST TYPICAL — the control: these should look boring", order[-3:][::-1])

    if args.inject:
        pq = _unit(np.array([_embed(t) for _, t in PROBES]))
        pdist, pnear = knn_distance(pq, Y, args.k, leave_one_out=False)
        print("=" * 96)
        print("INJECTED FAILURES — would the ranking have surfaced them?")
        print("=" * 96)
        print(f"\n{'planted output':40} {'dist':>7} {'nearest':>8} {'rank':>12}   verdict")
        print("-" * 96)
        for (name, _), d, nr in sorted(zip(PROBES, pdist, pnear), key=lambda z: -z[1]):
            # Rank it would take among the real outputs, 1 = most unusual.
            rank = int((kdist >= d).sum()) + 1
            top5 = rank <= 5
            control = name.startswith("on-topic")
            good = (not top5) if control else top5
            print(f"{name:40} {d:>7.3f} {nr:>8.3f} {f'{rank} of {len(outs)+1}':>12}   "
                  f"{'PASS' if good else 'MISS'}")
        print("\nA planted failure should land in the top few; the on-topic control "
              "should not.\n")

    leaks = sum(1 for i in range(len(outs))
                if prompt_leak(_system_text(calls[i].get("prompt")), outs[i]))
    reps = sum(1 for o in outs if repetition(o))
    truncs = sum(1 for o in outs if truncated(o))
    print(f"lexical checks over all {len(outs)} outputs — "
          f"prompt-leak {leaks} · repetition {reps} · no-terminal-punctuation {truncs}")
    print("\nThe question this answers: are the top rows worth a human's time, and are "
          "the bottom rows boring? If yes, the ranking works and the rest is plumbing.")


if __name__ == "__main__":
    main()
