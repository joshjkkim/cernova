---
name: Homepage NN/g rewire
overview: Rewire the Amethyst landing for NN/g clarity, keep StarField sparkle, and fix the “one purple slab” flatness with clearer surface/accent hierarchy—without a full rebrand.
todos:
  - id: hero-purpose
    content: "Rewrite hero: brand + tagline + short UVP + honest CTAs; LiveRun starts on meaningful static frame"
    status: completed
  - id: nav-home
    content: Add Home/logo prominence; trim nav; fix mobile; fix misleading demo CTA
    status: completed
  - id: reorder-examples
    content: Bring ProductBoard / concrete examples higher; shorten problem essay
    status: completed
  - id: simplify-motion
    content: Keep StarField sparkle; quiet competing motion (ticker/Reveal on hero); respect reduced motion
    status: completed
  - id: palette-hierarchy
    content: Break monochrome flatness — clearer paper/surface/ink hierarchy; reserve violet for brand only; strengthen CTA contrast
    status: completed
  - id: differentiator-meta
    content: Add one-glance differentiator line; sync layout metadata with tagline
    status: completed
isProject: false
---

# Homepage rewire vs NN/g principles

## Why it feels “one color” / odd

The Amethyst system is almost a **single-hue page**: background `#201a2b`, panels `#281f38` / `#332946`, text `#e9e4f0` / `#c9c2d6` / `#9a91ad`, accents `#b794f4`. Everything sits in the same purple family with only small lightness shifts.

That reads as odd because:

1. **No temperature contrast** — Paper, type, borders, stars, and kickers are all cool plum/lavender, so the page never chromatically “breaks.”
2. **Surfaces don’t separate** — Nav, hero, figures, and footer are neighboring purple slabs with the same border language; hierarchy is typographic, not spatial.
3. **Violet is overused** — On kickers, drop caps, numerals, crystal, stars, underlines, *and* hovers. When the accent is everywhere, it stops acting as an accent.
4. **Primary CTA matches body ink** — “Start free” is lavender-on-plum (`#e9e4f0` on `#201a2b`), same family as body text, so the main action doesn’t punch as a different kind of thing.
5. **Starfield + content share ink** — Sparkles use the same `INK` / `VIOLET` as copy, so atmosphere and content blend.

**Sparkle isn’t the problem** — lack of a second surface/temperature and over-distribution of violet is.

## Design decisions (locked)

- Keep Amethyst fonts, red-for-anomaly grammar, product mocks, and **StarField sparkle**.
- No full light-mode / non-purple rebrand this pass.
- Fix flatness *inside* Amethyst: surface tiers + reserve violet; quiet competing motion (ticker / hero Reveal), not the stars.
- NN/g clarity for purpose, CTAs, examples still applies.
- Scope: marketing homepage + nav/footer/home links on login & docs — not dashboard.

## Concrete changes

### 1. Hero: purpose first ([`frontend/app/page.tsx`](frontend/app/page.tsx))
- Brand + one-line what-it-is as strongest above-fold signal; problem hook secondary.
- Cap hero copy; one primary + one secondary CTA with honest labels.
- `LiveRun` on a meaningful static first frame; autoplay after interaction or with pause.

### 2. Nav / access
- Explicit Home; slightly larger logo; mobile menu for anchors.
- Fix misleading “live demo” → login CTA copy.

### 3. Examples higher
- Reorder: Hero → concrete product samples (Fig. 2 near top) → shorter problem → install → integrations → close.
- Cut/merge long dropcap essay.

### 4. Motion: keep sparkle, quiet competitors
- Keep `StarField` twinkle/parallax.
- Soften/remove auto-scrolling ticker (static chips OK).
- No `Reveal` gating above-fold text; honor `prefers-reduced-motion`.

### 5. Break monochrome flatness
- Slightly cooler/lifted panel for product figures so they read as content-on-stage.
- Reserve violet for brand + primary CTA; mute kickers/drop caps to ink.
- Primary CTA: violet fill (or ink-on-violet), not body-ink-on-plum.
- Stronger hairlines between nav / hero / figures.
- Keep red for failures only — no rainbow rebrand.

### 6. Differentiator + metadata
- One scannable line: not another trace viewer — learns each step’s normal, flags silent drift.
- Sync [`frontend/app/layout.tsx`](frontend/app/layout.tsx) description with hero tagline.

## Success criteria
- Fold answers who / what / next action / proof without waiting on animation.
- Honest CTAs; Home from marketing + auth/docs.
- Sparkle stays; page feels Amethyst but not one flat purple slab.
