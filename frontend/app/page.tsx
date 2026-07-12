'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, type ReactNode } from 'react'

// ── Design system: "Amethyst" ────────────────────────────────────────────────
// A mineralogist's field journal: deep plum paper, lavender ink, violet for
// the brand (cut like a crystal, never glowing), red ink reserved strictly
// for anomalies. Newsreader serif for headlines and body, Courier Prime
// typewriter for data, codes, and captions. Figures and tables presented like
// a technical journal; crystals drawn as engraved plates. No gradients, no
// glass, no glow — the anomaly grammar is proofreader's ink:
//   red ink = fired / critical · gold highlighter = drifting · ink ✓ = clean
//   violet = Cernova itself (never used for alerts)

const INK = '#e9e4f0'      // lavender-white — everything written
const RED = '#e0533d'      // anomaly red — fired conditions only
const VIOLET = '#b794f4'   // brand — kickers, numerals, stamps, crystals
const PAPER = '#201a2b'    // deep plum
const RULE = '#3a2f4e'
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

// ── Crystals: the brand mark, cut like an engraving ──────────────────────────

function CrystalMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <polygon points="12,2 20,9 12,22 4,9" fill={VIOLET} fillOpacity="0.22" stroke={VIOLET} strokeWidth="1.6" strokeLinejoin="miter" />
      <path d="M4 9 H20 M12 2 V22" stroke={VIOLET} strokeWidth="0.9" opacity="0.75" fill="none" />
    </svg>
  )
}

function CrystalPlate() {
  return (
    <figure className="inline-block">
      <svg width="300" height="150" viewBox="0 0 300 150" aria-hidden="true" className="block mx-auto max-w-full">
        {/* rock base */}
        <polygon points="28,132 272,132 252,146 48,146" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.5" />
        {/* shards */}
        <g stroke={VIOLET} strokeWidth="1.6" strokeLinejoin="miter">
          <polygon points="36,132 48,100 60,132" fill={VIOLET} fillOpacity="0.10" />
          <polygon points="52,132 70,52 88,132" fill={VIOLET} fillOpacity="0.14" />
          <polygon points="88,132 118,18 150,132" fill={VIOLET} fillOpacity="0.20" />
          <polygon points="150,132 178,60 202,132" fill={VIOLET} fillOpacity="0.14" />
          <polygon points="202,132 222,92 240,132" fill={VIOLET} fillOpacity="0.10" />
        </g>
        {/* facet lines */}
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
            <Kicker>{`§ ${no} — ${kicker}`}</Kicker>
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

const SPIKE: Step = { name: 'retrieve-context', ms: 8400, tokens: '3tk', bar: RED, note: '+4.1×IQR past fence' }

function LiveRun() {
  const [phase, setPhase] = useState(0) // 0..7 timeline of the story
  useEffect(() => {
    const seq = [700, 700, 700, 700, 900, 800, 800, 2600] // ms per phase
    const t = setTimeout(() => setPhase(p => (p + 1) % seq.length), seq[phase])
    return () => clearTimeout(t)
  }, [phase])

  const spiked = phase >= 5
  const rows = CLEAN.map((s, i) => (i === 1 && spiked ? SPIKE : s))
  const shown = phase >= 4 ? 4 : phase + 1
  const maxMs = 8400
  const score = phase < 5 ? 0 : phase === 5 ? 30 : phase === 6 ? 50 : 110
  const spikedRow = spiked

  return (
    <figure>
      <div className="border-2 border-[#e9e4f0] bg-[#281f38] shadow-[7px_7px_0_#e9e4f0]">
        {/* plate header */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b-2 border-[#e9e4f0]">
          <span className="f-type text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9e4f0]">Fig. 1 — run:a3f9 · support-agent</span>
          <span className="f-type text-[11px] font-bold uppercase tracking-[0.18em] text-[#e0533d]">● live</span>
        </div>

        {/* waterfall */}
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

        {/* score rule */}
        <div className="border-t-2 border-[#e9e4f0] px-6 py-4">
          <div className="flex items-center justify-between f-type text-[11px] mb-2">
            <span className="uppercase tracking-[0.18em] text-[#9a91ad]">anomaly score</span>
            <span className="font-bold" style={{ color: score > 0 ? RED : INK }}>
              {score >= 100 ? `${score}pts — TRIGGERED → #prod-alerts` : score > 0 ? `${score}pts — warning` : '0pts — clean ✓'}
            </span>
          </div>
          <div className="h-2.5 border border-[#e9e4f0]/30 bg-[#332946] relative">
            <div className="h-full transition-all duration-700" style={{ width: `${Math.min(100, score)}%`, background: score >= 100 ? RED : '#d9a441' }} />
            <div className="absolute -top-1 h-[18px] w-[2px] bg-[#e9e4f0]" style={{ left: '90.9%' }} />
          </div>
        </div>
      </div>
      <figcaption className="f-type text-[11px] text-[#9a91ad] mt-3 leading-5">
        Fig. 1 — A production run scored in real time. {spikedRow ? 'The retrieval step has broken its fence; the correction is marked in red.' : 'Four steps against their own baselines.'}
      </figcaption>
    </figure>
  )
}

// ── Column vignettes: Detect → Learn → Confirm → Warm-start ──────────────────

function ScoreMini() {
  const [n, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN(v => (v + 1) % 4), 900); return () => clearInterval(t) }, [])
  const vals = [0, 50, 80, 110]
  const v = vals[n]
  return (
    <div className="f-type text-[11px] space-y-1.5">
      {[['2001', 'json_format'], ['5001', 'latency_iqr'], ['1007', 'token_mismatch']].map(([c, name], i) => (
        <div key={c} className={`flex gap-2 transition-opacity duration-300 ${n > i ? 'opacity-100' : 'opacity-25'}`}>
          <span className="font-bold" style={{ color: RED }}>{c}</span>
          <span className="text-[#e9e4f0]">{name}</span>
        </div>
      ))}
      <div className="h-2 border border-[#e9e4f0]/30 bg-[#332946] mt-2">
        <div className="h-full transition-all duration-500" style={{ width: `${Math.min(100, v)}%`, background: v >= 100 ? RED : '#d9a441' }} />
      </div>
      <div className="text-right font-bold" style={{ color: v >= 100 ? RED : '#9a91ad' }}>{v}pts / 100</div>
    </div>
  )
}

function ContractMini() {
  return (
    <div className="f-type text-[11px] space-y-1.5 text-[#e9e4f0]">
      <div className="text-[#9a91ad]">learned from 200 outputs →</div>
      <div className="border border-[#e9e4f0] bg-[#201a2b] p-2.5 space-y-1">
        <div className="flex justify-between"><span>format</span><span className="font-bold">json</span></div>
        <div className="flex justify-between"><span>required</span><span className="font-bold">name · age · verdict</span></div>
        <div className="flex justify-between"><span>verdict ∈</span><span className="font-bold">approve · deny</span></div>
      </div>
      <div className="italic" style={{ color: '#d9a441' }}>status: proposed — awaiting confirm</div>
    </div>
  )
}

function ConfirmMini() {
  const [on, setOn] = useState<'none' | 'yes' | 'no'>('none')
  useEffect(() => {
    const seq: ('none' | 'yes' | 'no')[] = ['none', 'yes', 'yes', 'none', 'no', 'none']
    let i = 0
    const t = setInterval(() => { i = (i + 1) % seq.length; setOn(seq[i]) }, 1100)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="f-type text-[11px] space-y-3">
      <div className="text-[#e9e4f0]">anomaly 5001 fired on generate-reply.<br />was it real?</div>
      <div className="flex gap-2">
        <span className={`px-3 py-1 border transition-colors ${on === 'yes' ? 'bg-[#e9e4f0] text-[#201a2b] border-[#e9e4f0]' : 'border-[#e9e4f0]/40 text-[#9a91ad]'}`}>✓ confirm</span>
        <span className={`px-3 py-1 border font-bold transition-colors ${on === 'no' ? 'border-[#e0533d] text-[#e0533d]' : 'border-[#e9e4f0]/40 text-[#9a91ad] font-normal'}`}>✕ false alarm</span>
      </div>
      <div className="text-[#9a91ad] italic">{on === 'yes' ? '→ contract enforced, now scores' : on === 'no' ? '→ call re-folded into baseline' : '→ your label. only you can give it.'}</div>
    </div>
  )
}

function BaselineMini() {
  const [n, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN(v => (v >= 200 ? 0 : v + 20)), 500); return () => clearInterval(t) }, [])
  const warm = n >= 20
  return (
    <div className="f-type text-[11px] space-y-2">
      <div className="text-[#9a91ad]">imported from Langfuse →</div>
      <div className="flex items-end gap-[3px] h-12 border-b border-[#e9e4f0]">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex-1 transition-all duration-300" style={{ height: `${20 + ((i * 37) % 60)}%`, background: i * 10 < n ? INK : '#443659' }} />
        ))}
      </div>
      <div className="flex justify-between">
        <span className="text-[#e9e4f0]">baseline n={n}</span>
        <span className="font-bold" style={{ color: warm ? INK : '#9a91ad' }}>{warm ? 'baseline active ✓' : 'warming…'}</span>
      </div>
    </div>
  )
}

const PILLARS = [
  { no: 'I', k: 'Detect', head: 'Catch what your logs call success.', body: 'A 4-layer engine scores every call — hard failures, format breaks, numeric limits, and statistical drift against each step’s own history. Silent regressions surface loud.', visual: <ScoreMini /> },
  { no: 'II', k: 'Learn', head: 'Contracts it writes itself.', body: 'Cernova induces each step’s output contract from its real history — required keys, JSON shape, enum domains. No schema to hand-write; it learns what “normal output” means.', visual: <ContractMini /> },
  { no: 'III', k: 'Confirm', head: 'One tap tightens detection.', body: 'Confirm a real anomaly or flag a false alarm. Every verdict tunes your project — proprietary labels only your production traffic can produce, feeding the model that watches it.', visual: <ConfirmMini /> },
  { no: 'IV', k: 'Warm-start', head: 'Signal on day one.', body: 'Import your Langfuse or LangSmith history and baselines build from real traffic in minutes — no waiting to accrue calls. Backdated, deduped, silent. You see anomalies immediately.', visual: <BaselineMini /> },
]

function Pillars() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 border-2 border-[#e9e4f0] bg-[#281f38]">
      {PILLARS.map((p, i) => (
        <div key={p.k} className={[
          'p-8 border-[#e9e4f0]',
          i % 2 === 0 ? 'md:border-r' : '',
          i < 2 ? 'border-b' : '',
          i === 2 ? 'border-b md:border-b-0' : '',
        ].join(' ')}>
          <Reveal delay={i * 100}>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="f-news text-2xl italic text-[#b794f4]">{p.no}.</span>
              <span className="f-type text-[11px] font-bold uppercase tracking-[0.22em] text-[#e9e4f0]">{p.k}</span>
            </div>
            <h3 className="f-news font-bold text-[26px] text-[#e9e4f0] mb-3 leading-tight">{p.head}</h3>
            <p className="f-news text-[16px] text-[#c9c2d6] leading-7 mb-6">{p.body}</p>
            <div className="border-t border-[#3a2f4e] pt-5">{p.visual}</div>
          </Reveal>
        </div>
      ))}
    </div>
  )
}

// ── TABLE I — the detection layers ────────────────────────────────────────────

type LayerKey = 'hard' | 'format' | 'numeric' | 'statistical'
const LAYERS: Record<LayerKey, { name: string; codes: string; desc: string; example: { text: string; red?: boolean }[] }> = {
  hard: { name: 'Hard failures', codes: '1001–1008', desc: 'Deterministic. status_success=false, non-empty error, token accounting mismatch, negative values. Any hit → 100pts → immediate trigger. No heuristics.', example: [{ text: 'status_success: false', red: true }, { text: 'error: "context_length_exceeded"', red: true }, { text: '' }, { text: '↳ 1001  status_failure  +100pts  TRIGGERED', red: true }] },
  format: { name: 'Format violations', codes: '2001–2012', desc: 'Prompt-implied contracts. "Return JSON" → output must be JSON. Yes/no prompts, enum constraints, strict JSON (no fences). Learned contracts fold in here too.', example: [{ text: 'prompt:  "return JSON: name, email"' }, { text: 'output:  "The user appears to be..."' }, { text: '' }, { text: '↳ 2001  json_contract_violation  +50pts', red: true }] },
  numeric: { name: 'Numeric limits', codes: '4001–4010', desc: 'Adaptive p95 thresholds for latency, tokens, cost — scoped per step profile. Cross-field plausibility. Stall detection. Defers to the statistical layer once a baseline is warm.', example: [{ text: 'latency_ms:    8400' }, { text: 'output_tokens: 3' }, { text: '' }, { text: '↳ 4007  high_latency_low_output  +20pts', red: true }] },
  statistical: { name: 'Statistical baseline', codes: '5001–5004', desc: 'IQR/log-normal detection against each step’s own call history. Tukey fence in log space — catches multiplicative outliers (5× slower) z-scores miss. Activates after 20 clean calls.', example: [{ text: 'baseline: Q1=240ms Q3=340ms IQR=0.35' }, { text: 'fence: e^(log(Q3)+2.5×IQR) ≈ 510ms' }, { text: 'observed: 1840ms → +3.2×IQR', red: true }, { text: '' }, { text: '↳ 5001  latency_iqr_fence  +30pts', red: true }] },
}

function LayerTable() {
  const [active, setActive] = useState<LayerKey | null>('statistical')
  const layers = Object.keys(LAYERS) as LayerKey[]
  return (
    <Reveal>
      <div className="border-2 border-[#e9e4f0] bg-[#281f38]">
        <div className="px-5 py-2.5 border-b-2 border-[#e9e4f0] f-type text-[11px] font-bold uppercase tracking-[0.18em] text-[#e9e4f0]">
          Table I — The four detection layers
        </div>
        {layers.map((k) => {
          const l = LAYERS[k]; const on = active === k
          return (
            <div key={k} className="border-b border-[#3a2f4e] last:border-b-0">
              <button
                onClick={() => setActive(on ? null : k)}
                className={`w-full text-left px-5 py-4 grid grid-cols-[1fr_auto] sm:grid-cols-[220px_110px_1fr_auto] gap-4 items-baseline transition-colors ${on ? 'bg-[#2d2440]' : 'hover:bg-[#2d2440]/60'}`}
              >
                <span className={`f-news font-bold text-lg ${on ? 'text-[#b794f4]' : 'text-[#e9e4f0]'}`}>{l.name}</span>
                <span className="f-type text-[11px] text-[#9a91ad] hidden sm:block">{l.codes}</span>
                <span className="f-news text-[15px] text-[#c9c2d6] leading-6 hidden sm:block truncate">{l.desc.split('.')[0]}.</span>
                <span className="f-type text-[11px] text-[#9a91ad]">{on ? '– close' : '+ open'}</span>
              </button>
              {on && (
                <div className="px-5 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-[#2d2440]">
                  <p className="f-news text-[16px] text-[#c9c2d6] leading-7">{l.desc}</p>
                  <div className="border border-[#e9e4f0] bg-[#201a2b] p-4 f-type text-[12px] leading-6">
                    {l.example.map((e, i) => (
                      <div key={i} className={e.red ? 'font-bold' : ''} style={{ color: e.red ? RED : '#c9c2d6' }}>{e.text || ' '}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="f-type text-[11px] text-[#9a91ad] mt-3">Scores accumulate per call; once the total crosses 100pts the call is flagged and the alert fires.</p>
    </Reveal>
  )
}

// ── FIG. 2 — the steps ledger ─────────────────────────────────────────────────

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
              <span style={{ background: HILITE, color: PAPER, padding: '0 3px' }}>retrieve-context</span> +1.8×IQR latency · <span className="font-bold" style={{ color: RED }}>generate-reply</span> +3.4×IQR cost
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

// ── Small helpers ─────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }} className="f-type text-[10px] uppercase tracking-[0.14em] text-[#9a91ad] hover:text-[#b794f4] transition-colors">
      {done ? 'copied ✓' : 'copy'}
    </button>
  )
}

const TICKER: [string, string][] = [
  ['1001', 'status_failure'],
  ['1007', 'token_accounting_mismatch'],
  ['2001', 'json_contract_violation'],
  ['2011', 'missing_required_key'],
  ['4007', 'high_latency_low_output'],
  ['5001', 'latency_iqr_fence'],
  ['5002', 'tokens_iqr_fence'],
  ['2003', 'enum_contract_violation'],
  ['5003', 'cost_iqr_fence'],
  ['1003', 'empty_output_on_success'],
]

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
        .tk { animation: t 40s linear infinite; }
        .tk:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .tk { animation: none !important; } }
        .dropcap::first-letter { float: left; font-size: 3.4em; line-height: .85; padding-right: 10px; padding-top: 4px; font-weight: 700; color: ${VIOLET}; }
      `}</style>

      {/* ── Masthead ── */}
      <nav className="sticky top-0 z-50 bg-[#201a2b] border-b-2 border-[#e9e4f0]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 f-news font-bold text-xl tracking-tight text-[#e9e4f0]">
            <CrystalMark size={17} />
            Cernova
          </Link>
          <div className="flex items-center gap-7">
            <a href="#how" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors hidden sm:block">How it works</a>
            <a href="#product" className="f-type text-[11px] uppercase tracking-[0.16em] text-[#9a91ad] hover:text-[#b794f4] transition-colors hidden sm:block">Product</a>
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
          {/* dateline */}
          <div className="border-b border-[#e9e4f0] pb-2 mb-12 flex items-center justify-between f-type text-[10px] uppercase tracking-[0.22em] text-[#9a91ad]">
            <span>Vol. I — The detection layer for LLM pipelines</span>
            <span className="hidden sm:block">Open beta · free to start</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
            <Reveal>
              <h1 className="f-news font-bold text-6xl sm:text-[84px] leading-[0.98] tracking-tight text-[#e9e4f0] mb-8">
                Your LLM is failing. <em className="not-italic" style={{ color: VIOLET }}><span className="italic">Silently.</span></em>
              </h1>
              <p className="f-news text-xl text-[#c9c2d6] leading-8 max-w-lg mb-10">
                LLMs don&apos;t throw exceptions. They hallucinate, break JSON, spike cost, and drift — while your logs stay green. Cernova scores every call, learns each step&apos;s normal, and tells you the moment one breaks.
              </p>
              <div className="flex items-center gap-7 mb-12">
                <InkButton href="/login">Start free →</InkButton>
                <Link href="/docs" className="f-type text-[12px] uppercase tracking-[0.14em] text-[#e9e4f0] underline decoration-[#b794f4] decoration-2 underline-offset-4 hover:text-[#b794f4] transition-colors">Read the docs</Link>
              </div>
              <div className="border-y border-[#e9e4f0] py-3 f-type text-[11px] uppercase tracking-[0.16em] text-[#e9e4f0] flex flex-wrap gap-x-6 gap-y-1">
                <span><b>4</b> detection layers</span>
                <span>·</span>
                <span><b>~1ms</b> overhead per call</span>
                <span>·</span>
                <span><b>0</b> config files</span>
              </div>
            </Reveal>
            <Reveal delay={150}>
              <LiveRun />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Wire ticker ── */}
      <div className="border-y-2 border-[#e9e4f0] py-2.5 overflow-hidden bg-[#332946]">
        <div className="flex whitespace-nowrap tk">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex shrink-0">
              {TICKER.map(([code, name]) => (
                <span key={code} className="inline-flex items-baseline gap-2 px-6 f-type text-[11px]">
                  <span className="font-bold" style={{ color: RED }}>{code}</span>
                  <span className="text-[#c9c2d6]">{name}</span>
                  <span className="text-[#5c5273] pl-4">///</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── § 1 — How it works ── */}
      <section id="how" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="1"
            kicker="How it works"
            title={<>Detect. Learn. Confirm.<br />Warm-start.</>}
            aside="Four moves that turn raw traces into a detector that gets sharper the more you use it."
          />
          <Pillars />
        </div>
      </section>

      {/* ── § 2 — The engine ── */}
      <section id="detection" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="2"
            kicker="Inside the engine"
            title={<>Four layers.<br />Nothing slips past.</>}
            aside="Hard failures, format breaks, numeric limits, statistical drift — each layer catches what the others can't."
          />
          <LayerTable />
        </div>
      </section>

      {/* ── § 3 — The product ── */}
      <section id="product" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="3"
            kicker="The dashboard"
            title={<>Not another<br />pane of glass.</>}
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-14 items-start">
            <Reveal className="lg:col-span-2">
              <p className="dropcap f-news text-[17px] text-[#c9c2d6] leading-8 mb-6">
                Every step gets a semantic profile and its own baseline. The steps view ranks what&apos;s drifting and what&apos;s critical — latency creep and cost drift that per-call checks miss. Click any run for the full waterfall and one-tap AI root-cause.
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

      {/* ── § 4 — Everything included ── */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="4"
            kicker="Everything included"
            title={<>The full stack.<br />No config files.</>}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16">
            {[
              ['Learned output contracts', 'Each step’s output shape induced from its own history — required keys, JSON format, enum domains. Proposed, never silently enforced, until you confirm.'],
              ['Statistical drift baselines', 'Per-step IQR/log-normal fences. Multiplicative outlier detection that survives past spikes — no z-score blind spots.'],
              ['Confirmation flywheel', 'Confirm anomalies or flag false alarms. Proprietary labels only your production traffic can make — they tune detection now, train the model later.'],
              ['Warm-start import', 'Pull Langfuse or LangSmith history and build baselines from real traffic in minutes. Backdated, deduped, alert-suppressed. Signal on day one.'],
              ['AI root-cause analysis', 'One click runs claude-sonnet over an entire run — every step, every score — and tells you what broke and why.'],
              ['Step identity & profiles', 'System prompts embedded locally. Each step gets a stable semantic profile that survives renames and rewrites. Baselines are per-step, not project-wide.'],
              ['Slack + Sentry, out of the box', 'Errors, rate spikes, and anomalies to your channel. Every call as a performance transaction, anomalies as fingerprinted issues.'],
              ['Per-step cost & token tracking', 'Every call captured — tokens, latency, cost, model. Per-run Gantt waterfall. Monthly budget alerts.'],
            ].map(([title, desc], i) => (
              <Reveal key={title as string} delay={(i % 2) * 80}>
                <div className="py-6 border-b border-[#3a2f4e] flex gap-4">
                  <span className="f-type text-[11px] font-bold pt-1.5 shrink-0" style={{ color: VIOLET }}>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="f-news font-bold text-[19px] text-[#e9e4f0] mb-1.5">{title}</div>
                    <div className="f-news text-[15px] text-[#c9c2d6] leading-7">{desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── § 5 — Works with your stack ── */}
      <section id="stack" className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="5"
            kicker="Works with your stack"
            title={<>Keep your stack.<br />Add detection.</>}
            aside="Traces in from what you already run. Alerts out to where you already look. Cernova sits on top — it doesn't replace anything."
          />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {([
              ['Anthropic SDK', 'traces in', 'in'], ['OpenAI SDK', 'traces in', 'in'],
              ['LangChain', 'any provider', 'in'], ['OpenTelemetry', 'genai ingest', 'in'],
              ['Vercel AI SDK', 'telemetry', 'in'], ['Langfuse', 'warm-start import', 'in'],
              ['LangSmith', 'warm-start import', 'in'],
              ['Slack', 'alerts out', 'out'], ['Sentry', 'issues + traces', 'out'],
              ['Webhooks', 'signed events', 'out'], ['Read API', 'pull traces + anomalies', 'out'],
            ] as [string, string, string][]).map(([name, sub, dir], i) => (
              <Reveal key={name} delay={(i % 5) * 70}>
                <div className="relative border border-[#e9e4f0] bg-[#281f38] p-5 h-full hover:shadow-[4px_4px_0_#e9e4f0] hover:-translate-x-[2px] hover:-translate-y-[2px] transition-all duration-150">
                  <span className="absolute -top-2.5 right-3 rotate-[4deg] border-2 border-[#b794f4] text-[#b794f4] f-type text-[9px] font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 bg-[#281f38]">Live</span>
                  <div className="f-type text-[9px] uppercase tracking-[0.2em] text-[#9a91ad] mb-2">{dir === 'in' ? '→ in' : 'out →'}</div>
                  <div className="f-news font-bold text-[17px] text-[#e9e4f0] mb-0.5">{name}</div>
                  <div className="f-type text-[11px] text-[#9a91ad]">{sub}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Appendix A — Setup ── */}
      <section className="px-6 py-24">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            no="6"
            kicker="Appendix A — Setup"
            title={<>Three steps.<br />Under five minutes.</>}
            aside="Or skip the wait — import your Langfuse or LangSmith history and start with warm baselines."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: 'Step 1', title: 'Install', code: 'npm install @cernova/sdk' },
              { n: 'Step 2', title: 'Wrap your client', code: `const tracer = new Tracer({ apiKey })
const anthropic = tracer.wrapAnthropic(
  new Anthropic()
)` },
              { n: 'Step 3', title: 'Use normally', code: `await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  messages: [...],
  _trace: { stepName: 'classify' },
})` },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 110}>
                <div className="f-type text-[11px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: VIOLET }}>{s.n}</div>
                <div className="f-news font-bold text-2xl text-[#e9e4f0] mb-4">{s.title}</div>
                <div className="border-2 border-[#e9e4f0] bg-[#281f38]">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[#e9e4f0]">
                    <span className="f-type text-[10px] uppercase tracking-[0.16em] text-[#9a91ad]">typescript</span>
                    <CopyBtn text={s.code} />
                  </div>
                  <pre className="px-4 py-4 f-type text-[12px] text-[#e9e4f0] whitespace-pre leading-6 overflow-x-auto">{s.code}</pre>
                </div>
              </Reveal>
            ))}
          </div>
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
            <CrystalMark size={14} />
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
  )
}
