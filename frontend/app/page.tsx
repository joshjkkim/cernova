'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react'

// ── Design system: "Amethyst" ────────────────────────────────────────────────
// A mineralogist's field journal: deep plum paper, lavender ink, violet for
// the brand (cut like a crystal, never glowing), red ink reserved strictly
// for anomalies. Newsreader serif for headlines and body, Courier Prime
// typewriter for data, codes, and captions. Figures and tables presented like
// a technical journal; crystals drawn as engraved plates. No gradients, no
// glass, no glow — the anomaly grammar is proofreader's ink:
//   red ink = fired / critical · gold highlighter = drifting · ink ✓ = clean
//   violet = Cernova itself (never used for alerts)
//
// This page sells the OUTCOME, not the mechanism. The problem (silent LLM
// failure) and the three things Cernova does about it; every "how" links to
// /docs. Keep it enticing — no condition codes, no layer internals, no schemas.

const INK = '#e9e4f0'      // lavender-white — everything written
const RED = '#e0533d'      // anomaly red — fired conditions only
const VIOLET = '#b794f4'   // brand — kickers, numerals, stamps, crystals
const PAPER = '#201a2b'    // deep plum
const HILITE = '#d9c964'   // gold highlighter for drift

// ── Motion: gentle reveal on scroll ──────────────────────────────────────────

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (typeof IntersectionObserver === 'undefined' || rect.top < (window.innerHeight || 800)) {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } },
      { threshold: 0.12 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? 'none' : 'translateY(14px)',
        transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ── Editorial primitives ──────────────────────────────────────────────────────

function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#b794f4]"><span className="mr-2.5">◆</span>{children}</p>
  )
}

function CrystalPlate() {
  return (
    <figure className="inline-block">
      <svg width="300" height="150" viewBox="0 0 300 150" aria-hidden="true" className="block mx-auto max-w-full">
        <polygon points="28,132 272,132 252,146 48,146" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
        <g stroke={VIOLET} strokeWidth="1.6" strokeLinejoin="miter">
          <polygon points="36,132 48,100 60,132" fill={VIOLET} fillOpacity="0.10" />
          <polygon points="52,132 70,52 88,132" fill={VIOLET} fillOpacity="0.14" />
          <polygon points="88,132 118,18 150,132" fill={VIOLET} fillOpacity="0.20" />
          <polygon points="150,132 178,60 202,132" fill={VIOLET} fillOpacity="0.14" />
          <polygon points="202,132 222,92 240,132" fill={VIOLET} fillOpacity="0.10" />
        </g>
        <g stroke={VIOLET} strokeWidth="0.8" opacity="0.6" fill="none">
          <path d="M48 100 L50 132 M70 52 L74 132 M118 18 L112 132 M118 18 L136 132 M178 60 L182 132 M222 92 L224 132" />
        </g>
      </svg>
      <figcaption className="f-type text-[10px] uppercase tracking-[0.2em] text-[#9a91ad] mt-3 text-center">Plate I — Amethyst · formed under pressure, sharp on arrival</figcaption>
    </figure>
  )
}

function SectionHead({ no, kicker, title, aside }: { no: string; kicker: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <Reveal>
      <div className="border-t-2 border-[#e9e4f0] pt-5 mb-14">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <Kicker>{`${no} — ${kicker}`}</Kicker>
            <h2 className="f-news font-bold text-5xl sm:text-6xl text-[#e9e4f0] mt-5 leading-[1.02] tracking-tight">{title}</h2>
          </div>
          {aside && <p className="f-news italic text-[17px] text-[#9a91ad] max-w-sm lg:text-right leading-7">{aside}</p>}
        </div>
      </div>
    </Reveal>
  )
}

function InkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block f-type text-[13px] font-bold uppercase tracking-[0.14em] px-7 py-3.5 bg-[#e9e4f0] text-[#201a2b] shadow-[5px_5px_0_#b794f4] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0_#b794f4] transition-all duration-150"
    >
      {children}
    </Link>
  )
}

function DocsLink({ children = 'How it works →' }: { children?: ReactNode }) {
  return (
    <Link href="/docs" className="f-type text-[11px] uppercase tracking-[0.14em] text-[#9a91ad] hover:text-[#b794f4] transition-colors">
      {children}
    </Link>
  )
}

// ── FIG. 1 — a live, faithful run ─────────────────────────────────────────────
// Mirrors the real dashboard run-waterfall: steps stream in with latency bars,
// one spikes in red ink, the engine scores it, threshold trips. Then loops.

interface Step { name: string; ms: number; tokens: string; bar: string; note?: string }

const CLEAN: Step[] = [
  { name: 'classify-intent', ms: 84,   tokens: '12tk',  bar: INK },
  { name: 'retrieve-context', ms: 340, tokens: '89tk',  bar: INK },
  { name: 'rank-results',    ms: 210,  tokens: '47tk',  bar: INK },
  { name: 'generate-reply',  ms: 1240, tokens: '312tk', bar: INK },
]

const SPIKE: Step = { name: 'retrieve-context', ms: 8400, tokens: '3tk', bar: RED, note: '8× slower than its usual — flagged' }

function LiveRun() {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const seq = [700, 700, 700, 700, 900, 800, 800, 2600]
    const t = setTimeout(() => setPhase(p => (p + 1) % seq.length), seq[phase])
    return () => clearTimeout(t)
  }, [phase])

  const spiked = phase >= 5
  const rows = CLEAN.map((s, i) => (i === 1 && spiked ? SPIKE : s))
  const shown = phase >= 4 ? 4 : phase + 1
  const maxMs = 8400
  const score = phase < 5 ? 0 : phase === 5 ? 30 : phase === 6 ? 50 : 110

  return (
    <figure>
      <div className="border-2 border-[#e9e4f0] bg-[#281f38] shadow-[7px_7px_0_#e9e4f0]">
        <div className="flex items-center justify-between px-5 py-2.5 border-b-2 border-[#e9e4f0]">
          <span className="f-type text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9e4f0]">Fig. 1 — run:a3f9 · support-agent</span>
          <span className="f-type text-[11px] font-bold uppercase tracking-[0.18em] text-[#e0533d]">● live</span>
        </div>

        <div className="p-6 space-y-4 min-h-[280px]">
          {rows.slice(0, shown).map((s, i) => (
            <div key={i} className="f-type text-[12px]">
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ color: s.bar === RED ? RED : INK }} className={s.bar === RED ? 'font-bold' : ''}>{s.name}</span>
                <span className="text-[#9a91ad]">{s.ms}ms · {s.tokens}</span>
              </div>
              <div className="h-2.5 border border-[#e9e4f0]/30 bg-[#332946]">
                <div className="h-full transition-all duration-500" style={{ width: `${Math.max(4, (s.ms / maxMs) * 100)}%`, background: s.bar }} />
              </div>
              {s.note && <div className="text-[11px] mt-1.5 font-bold" style={{ color: RED }}>↳ {s.note}</div>}
            </div>
          ))}
        </div>

        <div className="border-t-2 border-[#e9e4f0] px-6 py-4">
          <div className="flex items-center justify-between f-type text-[11px] mb-2">
            <span className="uppercase tracking-[0.18em] text-[#9a91ad]">health</span>
            <span className="font-bold" style={{ color: score > 0 ? RED : INK }}>
              {score >= 100 ? 'broken → alerted to #prod' : score > 0 ? 'drifting…' : 'all steps normal ✓'}
            </span>
          </div>
          <div className="h-2.5 border border-[#e9e4f0]/30 bg-[#332946] relative">
            <div className="h-full transition-all duration-700" style={{ width: `${Math.min(100, score)}%`, background: score >= 100 ? RED : '#d9a441' }} />
            <div className="absolute -top-1 h-[18px] w-[2px] bg-[#e9e4f0]" style={{ left: '90.9%' }} />
          </div>
        </div>
      </div>
      <figcaption className="f-type text-[11px] text-[#9a91ad] mt-3 leading-5">
        Fig. 1 — A production run, watched live. {spiked ? 'One step just broke its normal pattern — caught, scored, and pushed to your alerts.' : 'Every step measured against what it normally does.'}
      </figcaption>
    </figure>
  )
}

// ── FIG. 2 — the steps ledger (dashboard glimpse) ─────────────────────────────

const STEPS_HEALTH = [
  { step: 'classify-intent',  p95: '96ms',   cost: '$0.00001', status: '✓ healthy',  hl: false, red: false },
  { step: 'retrieve-context', p95: '410ms',  cost: '$0.00009', status: 'drifting',   hl: true,  red: false },
  { step: 'rank-results',     p95: '240ms',  cost: '$0.00004', status: '✓ healthy',  hl: false, red: false },
  { step: 'generate-reply',   p95: '1.6s',   cost: '$0.00062', status: 'critical',   hl: false, red: true },
]

function ProductBoard() {
  const [tab, setTab] = useState<'steps' | 'runs'>('steps')
  return (
    <figure>
      <div className="border-2 border-[#e9e4f0] bg-[#281f38] shadow-[7px_7px_0_#e9e4f0]">
        <div className="flex items-center gap-6 px-5 py-2.5 border-b-2 border-[#e9e4f0] f-type text-[11px]">
          <span className="font-bold uppercase tracking-[0.18em] text-[#e9e4f0]">Fig. 2 — support-agent</span>
          {(['steps', 'runs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`uppercase tracking-[0.14em] transition-colors ${tab === t ? 'text-[#b794f4] font-bold underline underline-offset-4' : 'text-[#9a91ad] hover:text-[#e9e4f0]'}`}>
              {t}
            </button>
          ))}
          <span className="ml-auto text-[#9a91ad] hidden sm:block">last 24h · 4,102 calls</span>
        </div>

        {tab === 'steps' ? (
          <div>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-[#e9e4f0] f-type text-[10px] font-bold text-[#e9e4f0] uppercase tracking-[0.18em]">
              <span>step profile</span><span className="text-right w-16">p95</span><span className="text-right w-20">avg cost</span><span className="text-right w-24">trend</span>
            </div>
            {STEPS_HEALTH.map((r) => (
              <div key={r.step} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-[#3a2f4e] f-type text-[12px] items-center">
                <span className="text-[#e9e4f0] truncate" style={r.hl ? { background: HILITE, color: PAPER, padding: '0 4px' } : undefined}>{r.step}</span>
                <span className="text-[#9a91ad] text-right w-16">{r.p95}</span>
                <span className="text-[#9a91ad] text-right w-20">{r.cost}</span>
                <span className={`text-right w-24 ${r.red ? 'font-bold' : ''}`} style={{ color: r.red ? RED : r.hl ? '#d9a441' : INK }}>{r.status}</span>
              </div>
            ))}
            <div className="px-5 py-3 f-type text-[11px] text-[#9a91ad] italic">
              <span style={{ background: HILITE, color: PAPER, padding: '0 3px' }}>retrieve-context</span> creeping slower · <span className="font-bold" style={{ color: RED }}>generate-reply</span> cost spiking
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3.5">
            {CLEAN.map((s, i) => (
              <div key={i} className="f-type text-[12px]">
                <div className="flex justify-between mb-1.5"><span className="text-[#e9e4f0]">{s.name}</span><span className="text-[#9a91ad]">{s.ms}ms</span></div>
                <div className="h-2.5 border border-[#e9e4f0]/30 bg-[#332946]"><div className="h-full bg-[#e9e4f0]" style={{ width: `${Math.max(6, (s.ms / 1400) * 100)}%`, marginLeft: `${i * 12}%` }} /></div>
              </div>
            ))}
            <div className="f-type text-[11px] text-[#9a91ad] pt-1 italic">run:a3f9 · 4 steps · 1.87s · $0.00072 · clean ✓</div>
          </div>
        )}
      </div>
      <figcaption className="f-type text-[11px] text-[#9a91ad] mt-3 leading-5">
        Fig. 2 — The steps ledger. Drift is <span style={{ background: HILITE, color: PAPER, padding: '0 3px' }}>highlighted</span>; critical regressions are marked in <span className="font-bold" style={{ color: RED }}>red ink</span>.
      </figcaption>
    </figure>
  )
}

// ── Ticker: plain-language silent failures (no codes) ─────────────────────────

const TICKER: string[] = [
  'hallucinated a field',
  'returned prose where JSON was required',
  '8× slower than usual',
  'cost tripled overnight',
  'dropped a required key',
  'empty output — status 200 OK',
  'drifted off its allowed values',
  'silently truncated mid-answer',
]

// ── The three outcomes ────────────────────────────────────────────────────────

const OUTCOMES: { no: string; head: string; body: string }[] = [
  {
    no: 'I',
    head: 'Learns as your agent runs.',
    body: 'Point Cernova at your traffic and it figures out what normal looks like for every step your app takes — no rules, no schemas, no thresholds to tune. The more it runs, the sharper it gets.',
  },
  {
    no: 'II',
    head: 'Catches what your logs call success.',
    body: 'A prompt tweak, a model bump, a slow drift in cost or latency — the silent regressions that sail past every health check surface loud, per step, the moment they start.',
  },
  {
    no: 'III',
    head: 'Tells you before your users do.',
    body: 'The instant a step breaks its own pattern, Cernova flags it — to Slack, Sentry, or your own webhook — with the run, what changed, and one-tap root cause.',
  },
]

// ── Starfield: an engraved night-sky plate (nova = a star, brightening) ───────
// Printed, not glowing — tiny ink dots + a few violet cross-marks + one focal
// "nova" burst, drawn like an antique celestial chart. Deterministic seed so
// server and client render the same points; gentle scroll parallax for depth.

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function StarField() {
  const layer = useRef<HTMLDivElement>(null)
  const { stars, lines } = useMemo(() => {
    const rnd = mulberry32(20260712)
    const W = 1440, H = 900
    const stars = Array.from({ length: 88 }, () => {
      const bright = rnd() < 0.15
      return {
        x: rnd() * W, y: rnd() * H,
        r: bright ? 1.4 + rnd() * 1.0 : 0.5 + rnd() * 0.9,
        violet: bright || rnd() < 0.28,
        o: bright ? 0.4 + rnd() * 0.3 : 0.07 + rnd() * 0.15,
        cross: bright && rnd() < 0.7,
        dur: (4.5 + rnd() * 5).toFixed(1),   // twinkle period
        delay: (rnd() * 6).toFixed(1),
      }
    })
    const lines = [
      [stars[3], stars[12], stars[21], stars[30]],
      [stars[54], stars[61], stars[70]],
    ].map(pts => pts.map(p => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' '))
    return { stars, lines }
  }, [])

  // Scroll parallax on the outer layer; continuous drift lives in CSS on an
  // inner group, so the two transforms compose without fighting.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (layer.current) layer.current.style.transform = `translate3d(0, ${window.scrollY * 0.055}px, 0)`
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div ref={layer} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        <g className="skydrift">
          <g stroke={INK} strokeOpacity="0.08" strokeWidth="0.6" fill="none">
            {lines.map((pts, i) => <polyline key={i} points={pts} />)}
          </g>
          {stars.map((s, i) => s.cross ? (
            <g key={i} className="tw" style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
               stroke={s.violet ? VIOLET : INK} strokeOpacity={s.o} strokeWidth="0.8" strokeLinecap="round">
              <line x1={s.x - s.r * 2.6} y1={s.y} x2={s.x + s.r * 2.6} y2={s.y} />
              <line x1={s.x} y1={s.y - s.r * 2.6} x2={s.x} y2={s.y + s.r * 2.6} />
            </g>
          ) : (
            <circle key={i} className="tw" style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
              cx={s.x} cy={s.y} r={s.r} fill={s.violet ? VIOLET : INK} fillOpacity={s.o} />
          ))}
          {/* the nova — the Cernova logomark itself, faint and slowly brightening */}
          <g className="nova" transform="translate(560 610) scale(0.145) translate(-256 -256)"
             fill="none" stroke={VIOLET} strokeOpacity="0.6" strokeLinejoin="round" strokeLinecap="round">
            <path strokeWidth="9" d="M256,32 L307,205 L480,256 L307,307 L256,480 L205,307 L32,256 L205,205 Z" />
            <g strokeWidth="5">
              <line x1="256" y1="32" x2="256" y2="212" /><line x1="480" y1="256" x2="300" y2="256" />
              <line x1="256" y1="480" x2="256" y2="300" /><line x1="32" y1="256" x2="212" y2="256" />
            </g>
            <path strokeWidth="9" d="M256,212 L300,256 L256,300 L212,256 Z" />
          </g>
        </g>
      </svg>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#201a2b] text-[#e9e4f0]" style={{ fontFamily: 'var(--font-news), Georgia, serif' }}>
      <style>{`
        html { scroll-behavior: smooth; }
        .f-news { font-family: var(--font-news), Georgia, serif; }
        .f-type { font-family: var(--font-type), 'Courier New', monospace; }
        ::selection { background: ${HILITE}; color: ${PAPER}; }
        @keyframes t { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .tk { animation: t 44s linear infinite; }
        .tk:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .tk { animation: none !important; } }
        .dropcap::first-letter { float: left; font-size: 3.4em; line-height: .85; padding-right: 10px; padding-top: 4px; font-weight: 700; color: ${VIOLET}; }
        @keyframes nova { 0%, 100% { opacity: .5 } 50% { opacity: .95 } }
        .nova { animation: nova 5.5s ease-in-out infinite; }
        @keyframes skydrift { from { transform: translate(0,0) } to { transform: translate(-16px, 10px) } }
        .skydrift { animation: skydrift 70s ease-in-out infinite alternate; }
        @keyframes tw { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
        .tw { animation-name: tw; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) { .nova, .skydrift, .tw { animation: none !important; } }
      `}</style>

      <StarField />
      <div className="relative z-10">

      {/* ── Masthead ── */}
      <nav className="sticky top-0 z-50 bg-[#201a2b] border-b-2 border-[#e9e4f0]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 f-news font-bold text-xl tracking-tight text-[#e9e4f0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={22} height={22} className="shrink-0" />
            Cernova
          </Link>
          <div className="flex items-center gap-7">
            <a href="#problem" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors hidden sm:block">The problem</a>
            <a href="#solution" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors hidden sm:block">What it does</a>
            <a href="#stack" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors hidden sm:block">Integrations</a>
            <Link href="/docs" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors hidden sm:block">Docs</Link>
            <Link href="/login" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors">Sign in</Link>
            <Link href="/login" className="f-type text-[11px] font-bold uppercase tracking-[0.14em] px-4 py-2 bg-[#e9e4f0] text-[#201a2b] hover:bg-[#b794f4] transition-colors">Get started →</Link>
          </div>
        </div>
      </nav>

      {/* ── Front page ── */}
      <section className="px-6 pt-10 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="border-b border-[#e9e4f0] pb-2 mb-12 flex items-center justify-between f-type text-[10px] uppercase tracking-[0.22em] text-[#9a91ad]">
            <span>Vol. I — The detection layer for LLM pipelines</span>
            <span className="hidden sm:block">Open beta · free to start</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
            <Reveal>
              <h1 className="f-news font-bold text-6xl sm:text-[84px] leading-[0.98] tracking-tight text-[#e9e4f0] mb-8">
                Your agent is failing. <em className="not-italic" style={{ color: VIOLET }}><span className="italic">Silently.</span></em>
              </h1>
              <p className="f-news text-xl text-[#c9c2d6] leading-8 max-w-lg mb-10">
                LLMs don&apos;t throw exceptions. They hallucinate, break their format, spike cost, and drift — while every dashboard stays green. Cernova learns what each step of your app normally does, and tells you the moment one breaks.
              </p>
              <div className="flex items-center gap-7 mb-12">
                <InkButton href="/login">Start free →</InkButton>
                <Link href="/docs" className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#b794f4] decoration-2 underline-offset-4 hover:text-[#b794f4] transition-colors">Read the docs</Link>
              </div>
              <div className="border-y border-[#e9e4f0] py-3 f-type text-[11px] uppercase tracking-[0.16em] text-[#e9e4f0] flex flex-wrap gap-x-6 gap-y-1">
                <span>Silent failures, <b>caught</b></span>
                <span>·</span>
                <span><b>~1ms</b> overhead</span>
                <span>·</span>
                <span><b>Nothing</b> to configure</span>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <LiveRun />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Wire ticker — silent failures ── */}
      <div className="border-y-2 border-[#e9e4f0] py-2.5 overflow-hidden bg-[#332946]">
        <div className="flex whitespace-nowrap tk">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex shrink-0">
              {TICKER.map((phrase, j) => (
                <span key={`${i}-${j}`} className="inline-flex items-baseline gap-3 px-6 f-type text-[11px]">
                  <span className="font-bold" style={{ color: RED }}>✕</span>
                  <span className="text-[#c9c2d6]">{phrase}</span>
                  <span className="text-[#5c5273] pl-4">///</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── § 1 — The problem ── */}
      <section id="problem" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="1"
            kicker="The problem"
            title={<>Green dashboards.<br />Broken agents.</>}
            aside="The failures that matter most are the ones nothing alerts on."
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-14 items-start">
            <Reveal className="lg:col-span-3">
              <p className="dropcap f-news text-[19px] text-[#c9c2d6] leading-9 mb-6">
                An LLM call that hallucinates a field returns HTTP 200. So does one that drops a required key, ignores your format, slows to a crawl, or quietly costs three times as much. Your logs, your traces, your APM — all green. Nothing is on fire, so nothing pages you.
              </p>
              <p className="f-news text-[19px] text-[#c9c2d6] leading-9">
                The regression ships. It runs for days. The first real signal is a customer complaint — and by then you&apos;re reading transcripts trying to guess which prompt change, which model bump, broke which step.
              </p>
            </Reveal>
            <Reveal delay={150} className="lg:col-span-2">
              <blockquote className="border-l-2 border-[#e0533d] pl-6 py-2">
                <p className="f-news italic text-[27px] sm:text-[32px] leading-[1.25] text-[#e9e4f0]">
                  &ldquo;By the time someone reports it, it&apos;s been broken for a&nbsp;week.&rdquo;
                </p>
                <footer className="f-type text-[11px] uppercase tracking-[0.18em] text-[#9a91ad] mt-5">— every team shipping LLMs to production</footer>
              </blockquote>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── § 2 — What Cernova does (outcomes) ── */}
      <section id="solution" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="2"
            kicker="What Cernova does"
            title={<>It learns your app.<br />Then it watches it.</>}
            aside="Three things — none of which you have to set up."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 border-2 border-[#e9e4f0] bg-[#281f38]">
            {OUTCOMES.map((o, i) => (
              <div key={o.no} className={['p-8 border-[#e9e4f0]', i < OUTCOMES.length - 1 ? 'border-b md:border-b-0 md:border-r' : ''].join(' ')}>
                <Reveal delay={i * 100}>
                  <span className="f-news text-3xl italic text-[#b794f4]">{o.no}.</span>
                  <h3 className="f-news font-bold text-[27px] text-[#e9e4f0] mt-4 mb-3 leading-tight">{o.head}</h3>
                  <p className="f-news text-[16px] text-[#c9c2d6] leading-7 mb-6">{o.body}</p>
                  <DocsLink />
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── § 3 — See it (the dashboard) ── */}
      <section id="product" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="3"
            kicker="See it"
            title={<>Not another<br />pane of glass.</>}
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-14 items-start">
            <Reveal className="lg:col-span-2">
              <p className="dropcap f-news text-[17px] text-[#c9c2d6] leading-8 mb-6">
                Every step gets its own baseline. The board ranks what&apos;s drifting and what&apos;s critical — the slow latency creep and cost drift that per-call checks miss — and one tap on any run gives you an AI root-cause of what broke and why.
              </p>
              <p className="f-news text-[17px] text-[#c9c2d6] leading-8 mb-8">
                Anomalies read like proofreader&apos;s marks: drift gets the <span style={{ background: HILITE, color: PAPER, padding: '0 3px' }}>highlighter</span>, regressions get <span className="font-bold" style={{ color: RED }}>red ink</span>, and healthy steps stay quietly set in parchment.
              </p>
              <Link href="/login" className="f-type text-[12px] font-bold uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#b794f4] decoration-2 underline-offset-4 hover:text-[#b794f4] transition-colors">Open a live demo project →</Link>
            </Reveal>
            <Reveal delay={150} className="lg:col-span-3"><ProductBoard /></Reveal>
          </div>
        </div>
      </section>

      {/* ── § 4 — Works with your stack (condensed) ── */}
      <section id="stack" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="4"
            kicker="Works with your stack"
            title={<>Keep your stack.<br />Add detection.</>}
            aside="Traces in from what you already run. Alerts out to where you already look. Cernova sits on top — it doesn't replace anything."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 border-2 border-[#e9e4f0] bg-[#281f38]">
            {([
              ['Traces in', ['Anthropic SDK', 'OpenAI SDK', 'LangChain', 'OpenTelemetry', 'Vercel AI SDK', 'Langfuse & LangSmith import']],
              ['Alerts out', ['Slack', 'Sentry', 'Signed webhooks']],
              ['Data out', ['Read API', 'Pull traces & anomalies']],
            ] as [string, string[]][]).map(([group, items], i) => (
              <div key={group} className={['p-8 border-[#e9e4f0]', i < 2 ? 'border-b md:border-b-0 md:border-r' : ''].join(' ')}>
                <Reveal delay={i * 100}>
                  <div className="f-type text-[11px] font-bold uppercase tracking-[0.22em] text-[#b794f4] mb-5">{group}</div>
                  <ul className="space-y-2.5">
                    {items.map(name => (
                      <li key={name} className="f-news text-[17px] text-[#e9e4f0] leading-6">{name}</li>
                    ))}
                  </ul>
                </Reveal>
              </div>
            ))}
          </div>
          <Reveal>
            <div className="mt-8 flex justify-center">
              <Link href="/docs" className="f-type text-[12px] font-bold uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#b794f4] decoration-2 underline-offset-4 hover:text-[#b794f4] transition-colors">See every integration &amp; two-line setup in the docs →</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Closing ── */}
      <section className="px-6 py-28 border-t-2 border-[#e9e4f0]">
        <Reveal className="max-w-6xl mx-auto text-center">
          <div className="mb-10"><CrystalPlate /></div>
          <h2 className="f-news font-bold text-5xl sm:text-7xl text-[#e9e4f0] leading-[1.0] tracking-tight mb-8">
            Dashboards show you.<br /><span className="italic" style={{ color: VIOLET }}>Cernova tells you.</span>
          </h2>
          <p className="f-news italic text-lg text-[#9a91ad] mb-12">No credit card. Free to start. Warm baselines in minutes.</p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <InkButton href="/login">Get started free →</InkButton>
            <Link href="/docs" className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#b794f4] decoration-2 underline-offset-4 hover:text-[#b794f4] transition-colors">Read the docs</Link>
          </div>
        </Reveal>
      </section>

      {/* ── Colophon ── */}
      <footer className="border-t-2 border-[#e9e4f0] py-8 px-6 bg-[#332946]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 f-news font-bold text-lg text-[#e9e4f0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={18} height={18} className="shrink-0" />
            Cernova
          </Link>
          <p className="f-type text-[10px] uppercase tracking-[0.18em] text-[#9a91ad]">Set in Newsreader & Courier Prime · printed continuously</p>
          <div className="flex items-center gap-8">
            <Link href="/docs" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors">Docs</Link>
            <Link href="/login" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>

      </div>
    </div>
  )
}
