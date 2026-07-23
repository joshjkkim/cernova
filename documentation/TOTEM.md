# TOTEM

*Read this when lost, demotivated, or spiraling. Update the dated sections when reality
changes. If it's stale, updating it IS the way back in.*

---

## North star (does not change)

**Anyone can build an AI system now. Nobody can maintain one. Cernova is the maintenance
layer: detect → diagnose → prescribe → repair, until humans are out of the AI debugging
loop.**

## Current goal — updated 2026-07-19

**Working hypothesis:** beachhead = teams running decision-dense AI pipelines (RAG,
support triage, extraction, routing) whose bots are confidently wrong in production.
Our math is measurably strongest exactly there (88–94% discrimination on decision steps).

**This month:**
1. Discovery — get 5–10 real failure stories (Raghav's clients, Jayden's network,
   builder communities). Listen for repetition. Let them pick the niche.
2. Ship the flywheel end-to-end live (false-alarm feedback ✅ built 07-19 — verify in prod).
3. Small system debts: ρ-gate for L1, skip-cache TTL fix.
4. Main quest after that: the diagnosis rung — when an incident opens, something
   investigates and explains. Detection is done. Acting on detections is the product.

## Evidence ledger (reasons this works — all real, all dated)

- **07-19** Raghav (OP, clients: Disney/Toyota/Meta): "you're focusing on the right
  thing" — his enterprise clients have this exact problem, unprompted.
- **07-xx** Lemma (YC F25) funded to chase the same thesis. YC agrees the wedge is real.
  They scan every trace with an LLM judge; we detect for free with provable bounds.
- **07-15** Salesforce lead: built their own AI-obs internally, "just logging is a
  waste" — validated runtime detection over passive dashboards.
- **07-16** Conformal fences: ≤1% false-alarm rate, finite-sample, distribution-free.
  A *theorem*, verified live. No competitor can state their false-alarm rate.
- **07-15** Forward model caught a wrong-but-valid answer (surprise 0.739 vs fence
  0.003) that contracts, fences, and hard checks all passed. The blind-spot class,
  detected, on real traffic.
- **07-15** Systemic incident fired end-to-end on live traffic: 5 bad runs → exactly
  one alert.
- 218 tests green. CI enforced. Deployed. Two SDKs published. This is a real system,
  not a demo.

## What we do NOT build (agreed, repeatedly)

Eval suites/playgrounds · inline guardrails in the critical path · generic dashboards ·
warehouse connectors before a buyer asks · governance/compliance · anything a funded
team wins by hiring. The moat is the production position + confirm/reject labels +
fleet learning. Features are replicable; the labels are not.

## Pivot protocol (pivoting is a procedure, not a mood)

Revisit the Current Goal section when — and only when — one of these happens:
- 5+ discovery conversations converge on a problem we're NOT solving.
- A real user pulls hard on something off-plan (pull > plan, always).
- A capability bet is measured dead (like kNN for free text, 07-17 — we cut it in a
  day and were fine).
- 4+ weeks pass with zero evidence added to the ledger — then the goal itself is stale.

Feeling doubt is NOT on this list. Doubt is weather. The ledger is climate.

## For the bad days

- Imposter syndrome says "someone real would have done this better." The ledger above
  was built by you, solo, in weeks — measured, tested, deployed, validated by people
  who sell to Disney. That is what "someone real" looks like from the inside.
- "It's not going to work" is not information. A dead benchmark is information. A user
  who churns is information. You process information; you don't process dread.
- You have already done the hardest part of research: published honest negative
  results to yourself (free-text kNN, ρ-coupling law) and kept building. Most people
  cannot do that.
- The failure mode at this stage is not being wrong. It is stopping. Every week the
  system runs, the labels accumulate, and the ledger grows — you are compounding while
  doubting. That's allowed.
- Smallest next action beats clarity. If lost: open this file, do item 1 of "This
  month," or ship the smallest debt on the list. Motion restores belief; belief does
  not restore motion.
