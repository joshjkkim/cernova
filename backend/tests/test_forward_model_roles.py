"""Forward-model discrimination for FIT roles only (router / classifier / retriever).

Uses real MiniLM (offline HF cache). Re-run with -s for the accuracy table.

    cd backend && HF_HUB_OFFLINE=1 pytest tests/test_forward_model_roles.py -q -s
"""

from __future__ import annotations

import json
import os
import random

import numpy as np
import pytest
from sklearn.linear_model import Ridge

import services.forward_model_service as fms

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

SIM_CAP = 0.90
RIDGE_ALPHA = 1.0
SEEDS = (0, 1, 2, 3, 4)


def _unit(m: np.ndarray) -> np.ndarray:
    return m / np.clip(np.linalg.norm(m, axis=-1, keepdims=True), 1e-9, None)


def _prompt(user: str) -> str:
    return json.dumps({"messages": [{"role": "user", "content": user}]})


def _state_raw(excerpt: str, **flags) -> str:
    content = "Pipeline state:\n" + json.dumps({"ticket_excerpt": excerpt, **flags})
    return _prompt(content)


ROUTER_PAIRS = [
    ("User asks for a refund on a double charge.", "billing"),
    ("Customer wants money back for Pro plan.", "billing"),
    ("Duplicate charge on invoice — refund please.", "billing"),
    ("Card billed twice for the same month.", "billing"),
    ("App crashes when opening settings.", "technical"),
    ("Export job returns HTTP 500 with attachments.", "technical"),
    ("Login page spins forever after SSO.", "technical"),
    ("Reports tab white-screens on Chrome.", "technical"),
    ("How much is the Team plan per seat?", "sales"),
    ("Do you offer annual discounts for startups?", "sales"),
    ("Looking to upgrade from Free to Pro.", "sales"),
    ("Need a quote for forty seats.", "sales"),
    ("Just saying thanks for the help yesterday.", "other"),
    ("Can a human agent take over this chat?", "escalate"),
    ("This has been open for a week with no reply.", "escalate"),
    ("Bot keeps looping — please escalate.", "escalate"),
]

RETRIEVER_DISCRETE = [
    ("I was charged twice for Pro — where's the refund policy?", "kb:refund-policy"),
    ("How do I get money back for a billing error?", "kb:refund-policy"),
    ("My invoice shows two charges for one subscription.", "kb:duplicate-invoice"),
    ("Export keeps failing with a 500 when I attach files.", "kb:export-500"),
    ("SSO login hangs on the redirect page.", "kb:sso-login"),
    ("Dashboard crashes after opening the reports tab.", "kb:dashboard-crash"),
    ("What's included in the Team plan?", "kb:team-pricing"),
    ("Do annual contracts get a discount?", "kb:team-pricing"),
    ("How do I rotate my API keys?", "kb:api-keys"),
    ("Where are the webhook retry docs?", "kb:webhooks"),
    ("How do I add a teammate to my workspace?", "kb:invite-teammate"),
    ("What's the rate limit on the search endpoint?", "kb:rate-limits"),
]

RETRIEVER_PROSE = [
    ("I was charged twice for Pro — where's the refund policy?",
     "refund policy duplicate charge Pro plan"),
    ("How do I get money back for a billing error?",
     "billing error refund request process"),
    ("My invoice shows two charges for one subscription.",
     "duplicate invoice charge refund help"),
    ("Export keeps failing with a 500 when I attach files.",
     "export 500 error attachments troubleshooting"),
    ("SSO login hangs on the redirect page.",
     "SSO login hang redirect troubleshooting"),
    ("Dashboard crashes after opening the reports tab.",
     "dashboard crash reports tab troubleshooting"),
    ("What's included in the Team plan?",
     "Team plan features pricing seats"),
    ("Do annual contracts get a discount?",
     "annual contract discount pricing"),
    ("How do I rotate my API keys?",
     "API key rotation documentation"),
    ("Where are the webhook retry docs?",
     "webhook retry documentation"),
    ("How do I add a teammate to my workspace?",
     "add teammate workspace invite docs"),
    ("What's the rate limit on the search endpoint?",
     "search API rate limit documentation"),
]

CLASSIFIER_PAIRS = [
    ("Hi, I was charged twice for my Pro plan this month. Please refund.", "billing"),
    ("Invoice shows two Pro charges — need a credit.", "billing"),
    ("My card was billed twice for the same subscription.", "billing"),
    ("Billing portal listed a duplicate Pro line item.", "billing"),
    ("Export job fails with 500 whenever I include attachments.", "technical"),
    ("The dashboard crashes after I open the reports tab.", "technical"),
    ("SSO redirect loops and never lands in the app.", "technical"),
    ("Settings page freezes on save.", "technical"),
    ("What's the per-seat price for Team?", "sales"),
    ("Can we get a quote for 40 seats annual?", "sales"),
    ("Interested in upgrading Free -> Pro for the team.", "sales"),
    ("Do you have volume pricing for education?", "sales"),
    ("Thanks again — the last fix worked great.", "other"),
    ("Please escalate, I've been waiting five days.", "escalate"),
    ("Need a human — bot keeps looping.", "escalate"),
    ("Still blocked after three emails — escalate now.", "escalate"),
]

TICKET = (
    "Hi, I was charged twice for my Pro plan this month. My email is "
    "maya@brightloop.io — can you refund the duplicate charge? This is pretty urgent."
)


def _embed_many(texts: list[str]) -> np.ndarray:
    from services.fingerprinter import _embed
    return _unit(np.array([_embed(t) for t in texts]))


def _discrimination(pairs: list[tuple[str, str]], *, test_frac: float = 0.30) -> dict:
    X = _embed_many([i for i, _ in pairs])
    Y = _embed_many([o for _, o in pairs])
    wins: list[bool] = []
    surprises: list[float] = []
    for seed in SEEDS:
        rng = random.Random(seed)
        n = len(X)
        idx = list(range(n))
        rng.shuffle(idx)
        n_test = max(3, int(n * test_frac))
        te, tr = idx[:n_test], idx[n_test:]
        if len(tr) < 4:
            continue
        g = Ridge(alpha=RIDGE_ALPHA).fit(X[tr], Y[tr])
        pred = _unit(g.predict(X[te]))
        s_true = 1.0 - (pred * Y[te]).sum(-1)
        surprises.append(float(s_true.mean()))
        for k, i in enumerate(te):
            cands = [j for j in tr if float(X[i] @ X[j]) < SIM_CAP]
            if not cands:
                continue
            j = rng.choice(cands)
            s_decoy = 1.0 - float(pred[k] @ Y[j])
            wins.append(bool(s_true[k] < s_decoy))
    pair_sims = [float(X[a] @ X[b]) for a in range(len(X)) for b in range(a + 1, len(X))]
    return {
        "n": len(X),
        "n_trials": len(wins),
        "win_rate": float(np.mean(wins)) if wins else float("nan"),
        "mean_true_surprise": float(np.mean(surprises)) if surprises else float("nan"),
        "mean_input_pairwise_cos": float(np.mean(pair_sims)) if pair_sims else float("nan"),
    }


def _hop_cos(transform) -> float:
    h1 = transform(_state_raw(TICKET, classified=False, retrieved=False, drafted=False))
    h2 = transform(_state_raw(
        TICKET, classified=True, category="billing", retrieved=False, drafted=False))
    X = _embed_many([h1, h2])
    return float(X[0] @ X[1])


def _print_result(label: str, r: dict) -> None:
    wr = r.get("win_rate", float("nan"))
    wr_s = "n/a" if wr != wr else f"{wr:.0%}"
    extra = ""
    if "mean_true_surprise" in r:
        extra += f"  true_surprise={r['mean_true_surprise']:.3f}"
    if "mean_input_pairwise_cos" in r:
        extra += f"  input_pair_cos={r['mean_input_pairwise_cos']:.3f}"
    print(f"  {label:48} n={r.get('n', '-'):>3} trials={r['n_trials']:3}  "
          f"beats_decoy={wr_s:>4}{extra}")


def _xf_user_pairs(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [(fms._forward_input_text(_prompt(i)), o) for i, o in pairs]


@pytest.fixture(scope="module")
def _warm_embedder():
    from services.fingerprinter import _embed
    _embed("warmup")


def test_router_discrimination_is_strong(_warm_embedder):
    r = _discrimination(_xf_user_pairs(ROUTER_PAIRS))
    _print_result("router (cue -> label)", r)
    assert r["n_trials"] >= 10
    assert r["win_rate"] >= 0.70, r


def test_classifier_discrimination_is_strong(_warm_embedder):
    r = _discrimination(_xf_user_pairs(CLASSIFIER_PAIRS))
    _print_result("classifier (ticket -> category)", r)
    assert r["n_trials"] >= 10
    assert r["win_rate"] >= 0.70, r


def test_retriever_discrete_vs_prose(_warm_embedder):
    """Prose queries are weaker; prod now skips them via _is_discrete_decision_output."""
    discrete = _discrimination(_xf_user_pairs(RETRIEVER_DISCRETE))
    prose = _discrimination(_xf_user_pairs(RETRIEVER_PROSE))
    _print_result("retriever DISCRETE (scored in prod)", discrete)
    _print_result("retriever PROSE (skipped in prod)", prose)
    assert all(fms._is_discrete_decision_output(o) for _, o in RETRIEVER_DISCRETE)
    assert not any(fms._is_discrete_decision_output(o) for _, o in RETRIEVER_PROSE)
    assert prose["mean_true_surprise"] > discrete["mean_true_surprise"], {
        "prose": prose, "discrete": discrete,
    }


def test_multihop_full_text_hops_collapse(_warm_embedder):
    cos = _hop_cos(fms._user_text)
    print(f"  multi-hop FULL TEXT hop1↔hop2 cos={cos:.3f}")
    assert cos >= 0.90, cos


def test_multihop_flags_separate_hops(_warm_embedder):
    cos_full = _hop_cos(fms._user_text)
    cos_flags = _hop_cos(fms._forward_input_text)
    print(f"  multi-hop FLAGS   hop1↔hop2 cos={cos_flags:.3f}  (full={cos_full:.3f})")
    assert cos_flags < 0.85, cos_flags
    assert cos_flags < cos_full - 0.05, (cos_flags, cos_full)


def test_role_suite_report(_warm_embedder):
    print("\n=== forward-model FIT-role discrimination (post Phase 0–2) ===")
    router = _discrimination(_xf_user_pairs(ROUTER_PAIRS))
    classifier = _discrimination(_xf_user_pairs(CLASSIFIER_PAIRS))
    ret_d = _discrimination(_xf_user_pairs(RETRIEVER_DISCRETE))
    ret_p = _discrimination(_xf_user_pairs(RETRIEVER_PROSE))
    _print_result("router", router)
    _print_result("classifier", classifier)
    _print_result("retriever discrete [scored]", ret_d)
    _print_result("retriever prose [SKIPPED in prod]", ret_p)

    cos_full = _hop_cos(fms._user_text)
    cos_flags = _hop_cos(fms._forward_input_text)
    print("\n=== multi-hop hop1↔hop2 input cosine ===")
    print(f"  full text : {cos_full:.3f}")
    print(f"  flags only: {cos_flags:.3f}")

    scored = [router["win_rate"], classifier["win_rate"], ret_d["win_rate"]]
    global_scored = float(np.mean(scored))
    print(f"\n=== accuracy (decoy win rate) ===")
    print(f"  router:              {router['win_rate']:.0%}")
    print(f"  classifier:          {classifier['win_rate']:.0%}")
    print(f"  retriever discrete:  {ret_d['win_rate']:.0%}")
    print(f"  retriever prose:     {ret_p['win_rate']:.0%}  (not scored in prod)")
    print(f"  mean over SCORED roles: {global_scored:.0%}")

    assert router["win_rate"] >= 0.70
    assert classifier["win_rate"] >= 0.70
    assert ret_p["mean_true_surprise"] > ret_d["mean_true_surprise"]
    assert cos_full > cos_flags
