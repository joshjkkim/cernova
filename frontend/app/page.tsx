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
//   violet = Cernova itself — the brand and the primary action, nothing else
//
// Surface tiers: PAPER (page) → STRIP (bands) → STAGE (product figures, a
// cooler, lifted indigo so the mocks read as content-on-stage, not more wall).
//
// This page sells the OUTCOME, not the mechanism. Purpose first (NN/g): brand,
// what-it-is, and proof land above the fold without waiting on animation.

const INK = '#e9e4f0'      // lavender-white — everything written
const RED = '#e0533d'      // anomaly red — fired conditions only
const VIOLET = '#b794f4'   // brand + primary CTA — nowhere else
const PAPER = '#201a2b'    // deep plum
const HILITE = '#d9c964'   // gold highlighter for drift
const STAGE = '#272c4a'    // cooler, lifted panel — product figures only
const STAGE_LINE = '#3f466e'
const STAGE_WELL = '#303757'

// ── Motion: gentle reveal on scroll (below the fold only) ────────────────────

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setSeen(true)
      return
    }
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
    <p className="f-type text-[11px] font-bold uppercase tracking-[0.28em] text-[#c9c2d6]">{children}</p>
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
      className="inline-block f-type text-[13px] font-bold uppercase tracking-[0.14em] px-7 py-3.5 bg-[#b794f4] text-[#201a2b] shadow-[5px_5px_0_#e9e4f0] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0_#e9e4f0] transition-all duration-150"
    >
      {children}
    </Link>
  )
}

function DocsLink({ children = 'How it works →' }: { children?: ReactNode }) {
  return (
    <Link href="/docs" className="f-type text-[11px] uppercase tracking-[0.14em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">
      {children}
    </Link>
  )
}

// ── FIG. 1 — a run with a SILENT failure ─────────────────────────────────────
// Hard failures all pass — nothing a log or APM flags. But drift still slips
// through: generate-reply answers a billing question with store hours. Cernova
// catches the break, then says what broke, why, and the fix. Opens on the full
// diagnosed frame (the whole story at a glance); the sequence only animates
// when the reader asks it to.

interface LiveStep { name: string; ms: number }

const RUN_STEPS: LiveStep[] = [
  { name: 'classify-intent',  ms: 84 },
  { name: 'retrieve-context', ms: 210 },
  { name: 'generate-reply',   ms: 910 },
]

const FINAL_PHASE = 5 // 0 ask · 1–3 steps land (all 200) · 4 flagged · 5 diagnosed + pushed

function LiveRun() {
  const [phase, setPhase] = useState(FINAL_PHASE) // meaningful static first frame
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    if (phase >= FINAL_PHASE) { setPlaying(false); return }
    const delays = [1000, 800, 800, 1600, 1500]
    const t = setTimeout(() => setPhase(p => p + 1), delays[phase])
    return () => clearTimeout(t)
  }, [phase, playing])

  const replay = () => {
    if (playing) { setPlaying(false); return }
    setPhase(0)
    setPlaying(true)
  }

  const shownSteps = Math.min(phase, 3)
  const flagged = phase >= 4
  const diagnosed = phase >= 5

  return (
    <figure>
      <div className="border-2 border-[#e9e4f0]" style={{ background: STAGE, boxShadow: '7px 7px 0 #e9e4f0' }}>
        <div className="flex items-center justify-between px-5 py-2.5 border-b-2 border-[#e9e4f0]">
          <span className="f-type text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9e4f0]">Fig. 1 — run:a3f9 · support-agent</span>
          <button
            onClick={replay}
            className="f-type text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors"
            aria-label={playing ? 'Pause the run replay' : 'Replay the run'}
          >
            {playing ? '◼ pause' : '↺ replay'}
          </button>
        </div>

        <div className="p-6 space-y-3 min-h-[340px]">
          <div className="f-type text-[12px] text-[#9a91ad] border-l-2 pl-3 leading-6" style={{ borderColor: STAGE_LINE }}>
            user — &ldquo;my invoice is wrong, I was double-charged&rdquo;
          </div>

          <div className="space-y-1.5 pt-1">
            {RUN_STEPS.slice(0, shownSteps).map((s, i) => {
              const red = s.name === 'generate-reply' && flagged
              return (
                <div key={i} className="flex items-center justify-between f-type text-[12px]">
                  <span style={{ color: red ? RED : INK }} className={red ? 'font-bold' : ''}>
                    {red ? '✕' : '✓'} {s.name}
                  </span>
                  <span className="text-[#9a91ad]">200 · {s.ms}ms</span>
                </div>
              )
            })}
          </div>

          {phase >= 3 && (
            <div className="border p-3 f-type text-[12px] text-[#c9c2d6] leading-6" style={{ borderColor: STAGE_LINE, background: STAGE_WELL }}>
              &ldquo;Our store is open 9 am–10 pm on weekdays! Hope to see you soon.&rdquo;
              {flagged && (
                <div className="mt-2 pt-2 border-t text-[11px] font-bold" style={{ borderColor: STAGE_LINE, color: RED }}>
                  ↳ nothing generate-reply ever says to a billing question
                </div>
              )}
            </div>
          )}

          {diagnosed && (
            <div className="border-l-2 pl-3 space-y-1 f-type text-[11px]" style={{ borderColor: RED }}>
              <div><span className="text-[#9a91ad]">what broke — </span><span className="text-[#e9e4f0] font-bold">generate-reply</span></div>
              <div><span className="text-[#9a91ad]">why — </span><span className="text-[#c9c2d6]">retrieval returned store info, not billing — the reply answered the wrong context</span></div>
              <div><span className="text-[#9a91ad]">fix — </span><span className="text-[#e9e4f0]">scope the retriever to billing docs for invoice intents</span></div>
            </div>
          )}
        </div>

        <div className="border-t-2 border-[#e9e4f0] px-5 sm:px-6 py-4">
          {diagnosed ? (
            <div className="space-y-2">
              <div className="f-type text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a91ad]">
                status
              </div>
              <p className="f-type text-[14px] sm:text-[15px] font-bold leading-snug tracking-wide" style={{ color: RED }}>
                Diagnosed · pushed to #prod · ready for review
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 f-type text-[11px] sm:text-[12px]">
              <span className="uppercase tracking-[0.18em] text-[#9a91ad]">status</span>
              <span className="font-bold text-right" style={{ color: flagged ? RED : INK }}>
                {flagged ? 'silent failure caught' : phase >= 3 ? 'all steps 200 OK ✓' : 'watching…'}
              </span>
            </div>
          )}
        </div>
      </div>
      <figcaption className="f-type text-[11px] text-[#9a91ad] mt-3 leading-5">
        Fig. 1 — Every step passed every <b>hard failure</b> check — but drift still slipped through. {diagnosed ? 'Cernova diagnosed it, pushed the fix to #prod, and left it ready for review.' : flagged ? 'Cernova caught the break your logs can’t see.' : 'Nothing a log or dashboard would flag.'}
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
      <div className="border-2 border-[#e9e4f0]" style={{ background: STAGE, boxShadow: '7px 7px 0 #e9e4f0' }}>
        <div className="flex items-center gap-6 px-5 py-2.5 border-b-2 border-[#e9e4f0] f-type text-[11px]">
          <span className="font-bold uppercase tracking-[0.18em] text-[#e9e4f0]">Fig. 2 — support-agent</span>
          {(['steps', 'runs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`uppercase tracking-[0.14em] transition-colors ${tab === t ? 'text-[#e9e4f0] font-bold underline underline-offset-4' : 'text-[#9a91ad] hover:text-[#e9e4f0]'}`}>
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
              <div key={r.step} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b f-type text-[12px] items-center" style={{ borderColor: STAGE_LINE }}>
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
            {RUN_STEPS.map((s, i) => (
              <div key={i} className="f-type text-[12px]">
                <div className="flex justify-between mb-1.5"><span className="text-[#e9e4f0]">{s.name}</span><span className="text-[#9a91ad]">{s.ms}ms</span></div>
                <div className="h-2.5 border border-[#e9e4f0]/30" style={{ background: STAGE_WELL }}><div className="h-full bg-[#e9e4f0]" style={{ width: `${Math.max(6, (s.ms / 1400) * 100)}%`, marginLeft: `${i * 12}%` }} /></div>
              </div>
            ))}
            <div className="f-type text-[11px] text-[#9a91ad] pt-1 italic">run:a3f9 · 3 steps · 1.20s · $0.00068 · clean ✓</div>
          </div>
        )}
      </div>
      <figcaption className="f-type text-[11px] text-[#9a91ad] mt-3 leading-5">
        Fig. 2 — The steps ledger. Drift is <span style={{ background: HILITE, color: PAPER, padding: '0 3px' }}>highlighted</span>; critical regressions are marked in <span className="font-bold" style={{ color: RED }}>red ink</span>.
      </figcaption>
    </figure>
  )
}

// ── Wire strip: plain-language silent failures (static chips, no marquee) ─────

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
    head: 'Diagnoses. Fixes. Or waits for you.',
    body: 'No dashboard to go stare at. The moment a step breaks its pattern, you get a flag — in Slack, Sentry, or your webhook — with the run, what changed, and the root cause. Then Cernova puts the fix through in real time, or holds it for your approval.',
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

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '#product', label: 'Product' },
  { href: '#install', label: 'Install' },
  { href: '/about', label: 'About' },
  { href: '/mission', label: 'Mission' },
  { href: '/docs', label: 'Docs' },
]

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#201a2b] text-[#e9e4f0]" style={{ fontFamily: 'var(--font-news), Georgia, serif' }}>
      <style>{`
        html { scroll-behavior: smooth; }
        .f-news { font-family: var(--font-news), Georgia, serif; }
        .f-type { font-family: var(--font-type), 'Courier New', monospace; }
        ::selection { background: ${HILITE}; color: ${PAPER}; }
        .dropcap::first-letter { float: left; font-size: 3.4em; line-height: .85; padding-right: 10px; padding-top: 4px; font-weight: 700; color: ${INK}; }
        @keyframes nova { 0%, 100% { opacity: .5 } 50% { opacity: .95 } }
        .nova { animation: nova 5.5s ease-in-out infinite; }
        @keyframes skydrift { from { transform: translate(0,0) } to { transform: translate(-16px, 10px) } }
        .skydrift { animation: skydrift 70s ease-in-out infinite alternate; }
        @keyframes tw { 0%, 100% { opacity: 1 } 50% { opacity: .35 } }
        .tw { animation-name: tw; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .nova, .skydrift, .tw { animation: none !important; }
        }
      `}</style>

      <StarField />
      <div className="relative z-10">

      {/* ── Masthead ── */}
      <nav className="sticky top-0 z-50 bg-[#201a2b] border-b-2 border-[#e9e4f0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 f-news font-bold text-2xl tracking-tight text-[#e9e4f0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={28} height={28} className="shrink-0" />
            Cernova
          </Link>
          <div className="hidden sm:flex items-center gap-7">
            {NAV_LINKS.map(l => (
              <Link key={l.label} href={l.href} className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">
                {l.label}
              </Link>
            ))}
            <Link href="/login" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Sign in</Link>
            <Link href="/login" className="f-type text-[11px] font-bold uppercase tracking-[0.14em] px-4 py-2 bg-[#b794f4] text-[#201a2b] hover:bg-[#e9e4f0] transition-colors">Start free →</Link>
          </div>
          <button
            className="sm:hidden f-type text-[12px] font-bold uppercase tracking-[0.16em] text-[#e9e4f0] px-2 py-1 border border-[#e9e4f0]/40"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? '✕ close' : '☰ menu'}
          </button>
        </div>
        {menuOpen && (
          <div className="sm:hidden border-t border-[#e9e4f0]/40 bg-[#201a2b] px-6 py-4 flex flex-col gap-4">
            {NAV_LINKS.map(l => (
              <Link key={l.label} href={l.href} onClick={() => setMenuOpen(false)} className="f-type text-[12px] uppercase tracking-[0.16em] text-[#c9c2d6] hover:text-[#e9e4f0] transition-colors">
                {l.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setMenuOpen(false)} className="f-type text-[12px] uppercase tracking-[0.16em] text-[#c9c2d6] hover:text-[#e9e4f0] transition-colors">Sign in</Link>
            <Link href="/login" onClick={() => setMenuOpen(false)} className="f-type text-[12px] font-bold uppercase tracking-[0.14em] px-4 py-2.5 bg-[#b794f4] text-[#201a2b] self-start">Start free →</Link>
          </div>
        )}
      </nav>

      {/* ── Front page — purpose first, no animation gating ── */}
      <section className="px-6 pt-10 pb-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
            <div>
              <p className="f-news font-bold text-3xl sm:text-4xl tracking-tight mb-5" style={{ color: VIOLET }}>
                Cernova
              </p>
              <h1 className="f-news font-bold text-5xl sm:text-[64px] leading-[1.02] tracking-tight text-[#e9e4f0] mb-6">
                Anyone can build an AI agent.<br />
                <span className="italic text-[#c9c2d6]">Keeping it working is the hard part.</span>
              </h1>
              <p className="f-news text-xl text-[#c9c2d6] leading-8 max-w-lg mb-10">
                The maintenance layer for AI agents: catch silent failures, get the diagnosis and fix — without living in a trace viewer.
              </p>
              <div className="flex items-center gap-7 mb-12">
                <Link href="/about" className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#e9e4f0] transition-colors">Talk to us</Link>
                <InkButton href="/login">Sign up</InkButton>
              </div>
              <div className="border-y border-[#e9e4f0] py-3 f-type text-[11px] uppercase tracking-[0.16em] text-[#e9e4f0] flex flex-wrap gap-x-6 gap-y-1">
                <span>Silent failures, <b>caught</b></span>
                <span>·</span>
                <span><b>~1ms</b> overhead</span>
                <span>·</span>
                <span><b>Nothing</b> to configure</span>
              </div>
            </div>
            <LiveRun />
          </div>
        </div>
      </section>

      {/* ── Wire strip — silent failures (static, no marquee) ── */}
      <div className="border-y-2 border-[#e9e4f0] py-3 px-6 bg-[#332946]">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-x-7 gap-y-1.5">
          {TICKER.map((phrase, j) => (
            <span key={j} className="inline-flex items-baseline gap-2.5 f-type text-[11px] whitespace-nowrap">
              <span className="font-bold" style={{ color: RED }}>✕</span>
              <span className="text-[#c9c2d6]">{phrase}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── § 1 — See it (the dashboard, up front) ── */}
      <section id="product" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="1"
            kicker="See it"
            title={<>Not your average<br />observability platform.</>}
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-14 items-start">
            <Reveal className="lg:col-span-2">
              <p className="dropcap f-news text-[17px] text-[#c9c2d6] leading-8 mb-6">
                Most days you never open this. When you want the detail, every step has its own baseline — drift and critical ranked, root-cause on tap. Granularity for when you dig in; alerts and fixes carry the rest.
              </p>
              <p className="f-news text-[17px] text-[#c9c2d6] leading-8 mb-8">
                Anomalies read like proofreader&apos;s marks: drift gets the <span style={{ background: HILITE, color: PAPER, padding: '0 3px' }}>highlighter</span>, regressions get <span className="font-bold" style={{ color: RED }}>red ink</span>, and healthy steps stay quietly set in parchment.
              </p>
              <Link href="/login" className="f-type text-[12px] font-bold uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#e9e4f0] transition-colors">Start free and see your own steps →</Link>
            </Reveal>
            <Reveal delay={150} className="lg:col-span-3"><ProductBoard /></Reveal>
          </div>
        </div>
      </section>

      {/* ── § 2 — The problem (short) ── */}
      <section id="problem" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="2"
            kicker="The problem"
            title={<>Green dashboards.<br />Broken agents.</>}
            aside="The failures that matter most are the ones nothing alerts on."
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-14 items-start">
            <Reveal className="lg:col-span-3">
              <p className="dropcap f-news text-[19px] text-[#c9c2d6] leading-9">
                Everyone knows agents fail. The usual response is to open traces and check them one by one. What you need is something that already knows why it failed, how it failed — and pushes the fix to production, ready for review.
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

      {/* ── § 3 — What Cernova does (outcomes) ── */}
      <section id="solution" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="3"
            kicker="What Cernova does"
            title={<>It learns your app.<br />Then it watches it.</>}
            aside="Three things — none of which you have to set up."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 border-2 border-[#e9e4f0] bg-[#281f38]">
            {OUTCOMES.map((o, i) => (
              <div key={o.no} className={['p-8 border-[#e9e4f0]', i < OUTCOMES.length - 1 ? 'border-b md:border-b-0 md:border-r' : ''].join(' ')}>
                <Reveal delay={i * 100}>
                  <span className="f-news text-3xl italic text-[#9a91ad]">{o.no}.</span>
                  <h3 className="f-news font-bold text-[27px] text-[#e9e4f0] mt-4 mb-3 leading-tight">{o.head}</h3>
                  <p className="f-news text-[16px] text-[#c9c2d6] leading-7 mb-6">{o.body}</p>
                  <DocsLink />
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Interlude — getting in ── */}
      <section id="install" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <div className="border-t-2 border-[#e9e4f0] pt-5 mb-12">
              <Kicker>Getting in</Kicker>
              <h2 className="f-news font-bold text-5xl sm:text-6xl text-[#e9e4f0] mt-5 mb-4 leading-[1.02] tracking-tight">One line. Or none.</h2>
              <p className="f-news italic text-[17px] text-[#9a91ad] max-w-xl leading-7">No ML team, no enterprise contract, no afternoon lost to setup — and no dashboard to babysit after. Two ways in; pick how you build.</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 border-2 border-[#e9e4f0] bg-[#281f38]">
            <Reveal className="p-8 border-b md:border-b-0 md:border-r border-[#e9e4f0]">
              <div className="f-type text-[11px] font-bold uppercase tracking-[0.22em] text-[#9a91ad] mb-4">Wrap your client</div>
              <p className="f-news text-[16px] text-[#c9c2d6] leading-7 mb-5">Two lines around your model client. Every call your agent makes is watched — no changes to your logic.</p>
              <pre className="f-type text-[11px] text-[#e9e4f0] bg-[#201a2b] border border-[#3a2f4e] p-4 overflow-x-auto leading-6">{`const tracer    = new Tracer({ apiKey })
const anthropic = tracer.wrapAnthropic(client)`}</pre>
            </Reveal>
            <Reveal delay={100} className="p-8">
              <div className="f-type text-[11px] font-bold uppercase tracking-[0.22em] text-[#9a91ad] mb-4">Or hand it to your coding agent</div>
              <p className="f-news text-[16px] text-[#c9c2d6] leading-7 mb-5">Building in Cursor or Claude Code? Tell it to install Cernova and it wires every model call in your repo for you — even across a multi-agent setup.</p>
              <pre className="f-type text-[11px] text-[#e9e4f0] bg-[#201a2b] border border-[#3a2f4e] p-4 overflow-x-auto leading-6">{`> install cernova and instrument
  my agents`}</pre>
            </Reveal>
          </div>

          <Reveal>
            <div className="mt-8 border-2 border-[#e9e4f0] bg-[#332946] grid grid-cols-2 md:grid-cols-4 divide-x divide-[#e9e4f0]/30">
              {([
                ['≤1%', 'false alarms, proven'],
                ['~1ms', 'added per call'],
                ['20', 'calls to learn a step'],
                ['minutes', 'to first detection'],
              ] as [string, string][]).map(([n, l]) => (
                <div key={l} className="px-5 py-6 text-center">
                  <div className="f-news font-bold text-4xl text-[#e9e4f0]">{n}</div>
                  <div className="f-type text-[10px] uppercase tracking-[0.16em] text-[#9a91ad] mt-2 leading-4">{l}</div>
                </div>
              ))}
            </div>
          </Reveal>
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
              ['Traces in', ['Anthropic SDK', 'OpenAI SDK', 'LangChain', 'OpenTelemetry', 'Vercel AI SDK', 'Langfuse & LangSmith import', 'Coding-agent install (new)']],
              ['Alerts out', ['Slack', 'Sentry', 'Signed webhooks']],
              ['Data out', ['Read API', 'Pull traces & anomalies']],
            ] as [string, string[]][]).map(([group, items], i) => (
              <div key={group} className={['p-8 border-[#e9e4f0]', i < 2 ? 'border-b md:border-b-0 md:border-r' : ''].join(' ')}>
                <Reveal delay={i * 100}>
                  <div className="f-type text-[11px] font-bold uppercase tracking-[0.22em] text-[#9a91ad] mb-5">{group}</div>
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
              <Link href="/docs" className="f-type text-[12px] font-bold uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#e9e4f0] transition-colors">See every integration &amp; two-line setup in the docs →</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Closing — CTA only (hero already owns the line) ── */}
      <section className="px-6 py-24 border-t-2 border-[#e9e4f0]">
        <Reveal className="max-w-3xl mx-auto text-center">
          <div className="mb-8"><CrystalPlate /></div>
          <p className="f-news italic text-xl sm:text-2xl text-[#c9c2d6] leading-snug mb-4">
            The maintenance layer for production AI.
          </p>
          <p className="f-type text-[12px] uppercase tracking-[0.16em] text-[#9a91ad] mb-10">
            No credit card · Free to start · Warm baselines in minutes
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <InkButton href="/login">Start free →</InkButton>
            <Link href="/docs" className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#9a91ad] decoration-2 underline-offset-4 hover:decoration-[#e9e4f0] transition-colors">Read the docs</Link>
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Home</Link>
            <Link href="/about" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">About</Link>
            <Link href="/mission" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Mission</Link>
            <Link href="/docs" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Docs</Link>
            <Link href="/login" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>

      </div>
    </div>
  )
}
