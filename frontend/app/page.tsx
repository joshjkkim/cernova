'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

// ── Color system ────────────────────────────────────────────────────────────
// The condition-code palette IS the visual language of the page:
//   red = hard failure · orange = format · blue = numeric · violet = statistical
//   green = clean / healthy · yellow = drifting / warning
// Used deliberately everywhere so the eye learns the severity grammar.

// ── Hero: a live, faithful run ──────────────────────────────────────────────
// Mirrors the real dashboard run-waterfall: steps stream in with latency bars,
// one spikes, the engine scores it, threshold trips, an alert fires. Then loops.

interface Step { name: string; ms: number; tokens: string; c: string; bar: string; note?: string }

const CLEAN: Step[] = [
  { name: 'classify-intent', ms: 84,   tokens: '12tk', c: 'text-gray-300', bar: 'bg-neutral-600' },
  { name: 'retrieve-context', ms: 340, tokens: '89tk', c: 'text-gray-300', bar: 'bg-neutral-600' },
  { name: 'rank-results',    ms: 210,  tokens: '47tk', c: 'text-gray-300', bar: 'bg-neutral-600' },
  { name: 'generate-reply',  ms: 1240, tokens: '312tk',c: 'text-gray-300', bar: 'bg-neutral-600' },
]

const SPIKE: Step = { name: 'retrieve-context', ms: 8400, tokens: '3tk', c: 'text-yellow-300', bar: 'bg-yellow-500', note: '+4.1×IQR past fence' }

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

  return (
    <div className="border border-neutral-800 bg-neutral-950">
      {/* window chrome */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-neutral-800">
        <div className="flex items-center gap-2 font-mono text-[10px] text-gray-600">
          <span className="w-2 h-2 bg-violet-500" />
          run:a3f9 · support-agent
        </div>
        <span className="font-mono text-[10px] text-gray-700">live</span>
      </div>

      {/* waterfall */}
      <div className="p-4 space-y-2 min-h-[232px]">
        {rows.slice(0, shown).map((s, i) => (
          <div key={i} className="font-mono text-[11px]">
            <div className="flex items-center justify-between mb-1">
              <span className={s.c}>{s.name}</span>
              <span className="text-gray-600">{s.ms}ms · {s.tokens}</span>
            </div>
            <div className="h-1.5 bg-neutral-900">
              <div className={`h-full ${s.bar} transition-all duration-500`} style={{ width: `${Math.max(4, (s.ms / maxMs) * 100)}%` }} />
            </div>
            {s.note && <div className="text-yellow-500 text-[10px] mt-1">↳ {s.note}</div>}
          </div>
        ))}
      </div>

      {/* score bar */}
      <div className="border-t border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between font-mono text-[10px] mb-1.5">
          <span className="text-gray-600">anomaly score</span>
          <span className={score >= 100 ? 'text-red-400' : score > 0 ? 'text-yellow-400' : 'text-green-500'}>
            {score >= 100 ? `${score}pts · TRIGGERED → #prod-alerts` : score > 0 ? `${score}pts · warning` : '0pts · clean ✓'}
          </span>
        </div>
        <div className="h-1.5 bg-neutral-900 relative">
          <div
            className={`h-full transition-all duration-700 ${score >= 100 ? 'bg-red-500' : 'bg-yellow-500'}`}
            style={{ width: `${Math.min(100, score)}%` }}
          />
          <div className="absolute top-0 h-full w-px bg-neutral-500" style={{ left: '90.9%' }} />
        </div>
      </div>
    </div>
  )
}

// ── Capability arc: Detect → Learn → Confirm → Warm-start ────────────────────

function ScoreMini() {
  const [n, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN(v => (v + 1) % 4), 900); return () => clearInterval(t) }, [])
  const vals = [0, 50, 80, 110]
  const v = vals[n]
  return (
    <div className="font-mono text-[10px] space-y-1.5">
      {[['2001', 'json_format', 'text-orange-400'], ['5001', 'latency_iqr', 'text-violet-400'], ['1007', 'token_mismatch', 'text-red-400']].map(([c, name, col], i) => (
        <div key={c} className={`flex justify-between transition-opacity duration-300 ${n > i ? 'opacity-100' : 'opacity-20'}`}>
          <span className={col as string}>{c} {name}</span>
        </div>
      ))}
      <div className="h-1 bg-neutral-900 mt-2"><div className={`h-full transition-all duration-500 ${v >= 100 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
      <div className={`text-right ${v >= 100 ? 'text-red-400' : 'text-gray-600'}`}>{v}pts / 100</div>
    </div>
  )
}

function ContractMini() {
  return (
    <div className="font-mono text-[10px] space-y-1 text-gray-500">
      <div className="text-gray-600">learned from 200 outputs →</div>
      <div className="border border-neutral-800 p-2 space-y-1">
        <div className="flex justify-between"><span className="text-gray-400">format</span><span className="text-violet-400">json</span></div>
        <div className="flex justify-between"><span className="text-gray-400">required</span><span className="text-violet-400">name · age · verdict</span></div>
        <div className="flex justify-between"><span className="text-gray-400">verdict ∈</span><span className="text-violet-400">approve · deny</span></div>
      </div>
      <div className="text-yellow-500">status: proposed — awaiting confirm</div>
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
    <div className="font-mono text-[10px] space-y-3">
      <div className="text-gray-500">anomaly 5001 fired on generate-reply.<br />was it real?</div>
      <div className="flex gap-2">
        <span className={`px-3 py-1 border transition-colors ${on === 'yes' ? 'border-green-500 bg-green-950 text-green-400' : 'border-neutral-800 text-gray-600'}`}>✓ confirm</span>
        <span className={`px-3 py-1 border transition-colors ${on === 'no' ? 'border-red-500 bg-red-950 text-red-400' : 'border-neutral-800 text-gray-600'}`}>✕ false alarm</span>
      </div>
      <div className="text-gray-700">{on === 'yes' ? '→ contract enforced, now scores' : on === 'no' ? '→ call re-folded into baseline' : '→ your label. only you can give it.'}</div>
    </div>
  )
}

function BaselineMini() {
  const [n, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN(v => (v >= 200 ? 0 : v + 20)), 500); return () => clearInterval(t) }, [])
  const warm = n >= 20
  return (
    <div className="font-mono text-[10px] space-y-2">
      <div className="text-gray-600">imported from Langfuse →</div>
      <div className="flex items-end gap-0.5 h-12">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className={`flex-1 transition-all duration-300 ${i * 10 < n ? 'bg-violet-500' : 'bg-neutral-800'}`} style={{ height: `${20 + ((i * 37) % 60)}%` }} />
        ))}
      </div>
      <div className="flex justify-between">
        <span className="text-gray-500">baseline n={n}</span>
        <span className={warm ? 'text-green-500' : 'text-gray-700'}>{warm ? 'L5 active ✓' : 'warming…'}</span>
      </div>
    </div>
  )
}

const PILLARS = [
  { k: 'Detect', accent: 'text-red-400', bar: 'border-red-500', head: 'Catch what your logs call success.', body: 'A 4-layer engine scores every call — hard failures, format breaks, numeric limits, and statistical drift against each step’s own history. Silent regressions surface loud.', visual: <ScoreMini /> },
  { k: 'Learn', accent: 'text-violet-400', bar: 'border-violet-500', head: 'Contracts it writes itself.', body: 'Cernova induces each step’s output contract from its real history — required keys, JSON shape, enum domains. No schema to hand-write; it learns what “normal output” means.', visual: <ContractMini /> },
  { k: 'Confirm', accent: 'text-green-400', bar: 'border-green-500', head: 'One tap tightens detection.', body: 'Confirm a real anomaly or flag a false alarm. Every verdict tunes your project — proprietary labels only your production traffic can produce, feeding the model that watches it.', visual: <ConfirmMini /> },
  { k: 'Warm-start', accent: 'text-blue-400', bar: 'border-blue-500', head: 'Signal on day one.', body: 'Import your Langfuse history and baselines build from real traffic in minutes — no waiting to accrue calls. Backdated, deduped, silent. You see anomalies immediately.', visual: <BaselineMini /> },
]

function Pillars() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-neutral-800 border border-neutral-800">
      {PILLARS.map((p, i) => (
        <div key={p.k} className="bg-black p-6">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-mono text-[10px] text-gray-700">0{i + 1}</span>
            <span className={`font-mono text-[11px] uppercase tracking-widest ${p.accent}`}>{p.k}</span>
          </div>
          <h3 className="font-sans font-black text-2xl text-white mb-3 leading-tight">{p.head}</h3>
          <p className="font-mono text-xs text-gray-500 leading-6 mb-6">{p.body}</p>
          <div className={`border-l-2 ${p.bar} pl-4 py-1`}>{p.visual}</div>
        </div>
      ))}
    </div>
  )
}

// ── Detection layer explorer (kept — interactive) ────────────────────────────

type LayerKey = 'L1' | 'L2' | 'L4' | 'L5'
const LAYERS: Record<LayerKey, { name: string; accent: string; desc: string; example: { text: string; c?: string }[] }> = {
  L1: { name: 'Hard failures', accent: 'text-red-400', desc: 'Deterministic. status_success=false, non-empty error, token accounting mismatch, negative values. Any hit → 100pts → immediate trigger. No heuristics.', example: [{ text: 'status_success: false', c: 'text-red-400' }, { text: 'error: "context_length_exceeded"', c: 'text-red-300' }, { text: '' }, { text: '↳ 1001  status_failure  +100pts  TRIGGERED', c: 'text-red-400' }] },
  L2: { name: 'Format violations', accent: 'text-orange-400', desc: 'Prompt-implied contracts. "Return JSON" → output must be JSON. Yes/no prompts, enum constraints, strict JSON (no fences). Learned contracts fold in here too.', example: [{ text: 'prompt:  "return JSON: name, email"', c: 'text-gray-600' }, { text: 'output:  "The user appears to be..."', c: 'text-orange-300' }, { text: '' }, { text: '↳ 2001  json_contract_violation  +50pts', c: 'text-orange-400' }] },
  L4: { name: 'Numeric limits', accent: 'text-blue-400', desc: 'Adaptive p95 thresholds for latency, tokens, cost — scoped per step profile. Cross-field plausibility. Stall detection. Defers to L5 once a baseline is warm.', example: [{ text: 'latency_ms:    8400', c: 'text-blue-300' }, { text: 'output_tokens: 3', c: 'text-blue-300' }, { text: '' }, { text: '↳ 4007  high_latency_low_output  +20pts', c: 'text-blue-400' }] },
  L5: { name: 'Statistical baseline', accent: 'text-violet-400', desc: 'IQR/log-normal detection against each step’s own call history. Tukey fence in log space — catches multiplicative outliers (5× slower) z-scores miss. Activates after 20 clean calls.', example: [{ text: 'baseline: Q1=240ms Q3=340ms IQR=0.35', c: 'text-gray-600' }, { text: 'fence: e^(log(Q3)+2.5×IQR) ≈ 510ms', c: 'text-gray-600' }, { text: 'observed: 1840ms → +3.2×IQR', c: 'text-violet-300' }, { text: '' }, { text: '↳ 5001  latency_iqr_fence  +30pts', c: 'text-violet-400' }] },
}

function LayerExplorer() {
  const [active, setActive] = useState<LayerKey | null>('L5')
  const layers = Object.keys(LAYERS) as LayerKey[]
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-800">
        {layers.map((k) => {
          const l = LAYERS[k]; const on = active === k
          return (
            <button key={k} onClick={() => setActive(on ? null : k)} className={['p-5 text-left transition-colors', on ? 'bg-white text-black' : 'bg-black hover:bg-neutral-900'].join(' ')}>
              <div className={`text-xs font-bold font-mono mb-1 ${on ? 'text-black' : l.accent}`}>{k}</div>
              <div className={`text-sm font-sans font-bold ${on ? 'text-black' : 'text-white'}`}>{l.name}</div>
              <div className={`text-[10px] font-mono mt-3 ${on ? 'text-gray-600' : 'text-gray-700'}`}>{on ? 'click to close' : 'expand →'}</div>
            </button>
          )
        })}
      </div>
      {active && (
        <div className="border border-neutral-800 border-t-0 p-6 bg-neutral-950">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className={`text-[10px] font-mono font-bold uppercase tracking-widest mb-3 ${LAYERS[active].accent}`}>{active} — {LAYERS[active].name}</div>
              <p className="text-sm font-mono text-gray-400 leading-7">{LAYERS[active].desc}</p>
            </div>
            <div className="bg-black border border-neutral-800 p-4 font-mono text-xs leading-6">
              {LAYERS[active].example.map((l, i) => (<div key={i} className={l.c ?? 'text-gray-400'}>{l.text || ' '}</div>))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Product board: the real dashboard, faithfully ────────────────────────────

const STEPS_HEALTH = [
  { step: 'classify-intent',  p95: '96ms',   cost: '$0.00001', status: 'healthy',   note: 'within IQR box', dot: 'bg-green-500', txt: 'text-green-500' },
  { step: 'retrieve-context', p95: '410ms',  cost: '$0.00009', status: 'drifting',  note: '+1.8×IQR latency', dot: 'bg-yellow-500', txt: 'text-yellow-500' },
  { step: 'rank-results',     p95: '240ms',  cost: '$0.00004', status: 'healthy',   note: 'within IQR box', dot: 'bg-green-500', txt: 'text-green-500' },
  { step: 'generate-reply',   p95: '1.6s',   cost: '$0.00062', status: 'critical',  note: '+3.4×IQR cost',   dot: 'bg-red-500',    txt: 'text-red-500' },
]

function ProductBoard() {
  const [tab, setTab] = useState<'steps' | 'runs'>('steps')
  const [pulse, setPulse] = useState(false)
  useEffect(() => { const t = setInterval(() => setPulse(p => !p), 1400); return () => clearInterval(t) }, [])
  return (
    <div className="border border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-6 px-5 h-11 border-b border-neutral-800 font-mono text-[11px]">
        <span className="text-white font-bold">support-agent</span>
        {(['steps', 'runs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`transition-colors ${tab === t ? 'text-violet-400 border-b-2 border-violet-500 -mb-px h-11 flex items-center' : 'text-gray-600 hover:text-gray-400'}`}>
            {t}{t === 'steps' ? ' (2 drifting)' : ''}
          </button>
        ))}
        <span className="ml-auto text-gray-700 hidden sm:block">last 24h · 4,102 calls</span>
      </div>

      {tab === 'steps' ? (
        <div>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-neutral-800 font-mono text-[10px] text-gray-700 uppercase tracking-widest">
            <span>step profile</span><span className="text-right w-16">p95</span><span className="text-right w-20">avg cost</span><span className="text-right w-24">trend</span>
          </div>
          {STEPS_HEALTH.map((r, i) => (
            <div key={r.step} className={`grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 border-b border-neutral-800 font-mono text-[11px] items-center ${i === 1 && pulse ? 'bg-yellow-950' : ''} transition-colors`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 shrink-0 ${r.dot}`} />
                <span className="text-gray-300 truncate">{r.step}</span>
              </div>
              <span className="text-gray-500 text-right w-16">{r.p95}</span>
              <span className="text-gray-500 text-right w-20">{r.cost}</span>
              <span className={`text-right w-24 ${r.txt}`}>{r.status}</span>
            </div>
          ))}
          <div className="px-5 py-3 font-mono text-[10px] text-gray-700">
            <span className="text-yellow-500">retrieve-context</span> {STEPS_HEALTH[1].note} · <span className="text-red-500">generate-reply</span> {STEPS_HEALTH[3].note}
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-3">
          {CLEAN.map((s, i) => (
            <div key={i} className="font-mono text-[11px]">
              <div className="flex justify-between mb-1"><span className="text-gray-400">{s.name}</span><span className="text-gray-600">{s.ms}ms</span></div>
              <div className="h-2 bg-neutral-900"><div className="h-full bg-violet-600" style={{ width: `${Math.max(6, (s.ms / 1400) * 100)}%`, marginLeft: `${i * 12}%` }} /></div>
            </div>
          ))}
          <div className="font-mono text-[10px] text-gray-700 pt-1">run:a3f9 · 4 steps · 1.87s · $0.00072 · <span className="text-green-500">clean</span></div>
        </div>
      )}
    </div>
  )
}

// ── Small helpers ────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }} className="text-[10px] font-mono text-gray-700 hover:text-gray-400 transition-colors">
      {done ? 'copied ✓' : 'copy'}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white antialiased">
      <style>{`
        @keyframes t { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .tk { animation: t 32s linear infinite; }
        .tk:hover { animation-play-state: paused; }
      `}</style>

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-sans font-black text-sm text-white">
            <img src="/logo.svg" alt="" className="w-5 h-5" />
            Cernova
          </Link>
          <div className="flex items-center gap-6">
            <a href="#how" className="text-[11px] font-mono text-gray-600 hover:text-white transition-colors hidden sm:block">how it works</a>
            <a href="#product" className="text-[11px] font-mono text-gray-600 hover:text-white transition-colors hidden sm:block">product</a>
            <a href="#stack" className="text-[11px] font-mono text-gray-600 hover:text-white transition-colors hidden sm:block">integrations</a>
            <Link href="/docs" className="text-[11px] font-mono text-gray-600 hover:text-white transition-colors hidden sm:block">docs</Link>
            <Link href="/login" className="text-[11px] font-mono text-gray-600 hover:text-white transition-colors">sign in</Link>
            <Link href="/login" className="text-[11px] font-mono font-bold px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white transition-colors">get started →</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-16 px-6 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="font-mono text-[11px] text-gray-600 mb-8 tracking-widest uppercase">the detection layer for llm pipelines · open beta</p>
            <h1 className="font-sans font-black text-6xl sm:text-7xl leading-[0.95] text-white mb-8">
              Your LLM<br />is failing.<br /><span className="text-violet-500">Silently.</span>
            </h1>
            <p className="font-mono text-sm text-gray-500 leading-7 max-w-md mb-10">
              LLMs don&apos;t throw exceptions. They hallucinate, break JSON, spike cost, and drift — while your logs stay green. Cernova scores every call, learns each step&apos;s normal, and tells you the moment one breaks.
            </p>
            <div className="flex items-center gap-4 mb-14">
              <Link href="/login" className="font-mono text-sm font-bold px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white transition-colors">start free →</Link>
              <Link href="/docs" className="font-mono text-sm text-gray-600 hover:text-white transition-colors underline underline-offset-4">read docs</Link>
            </div>
            <div className="pt-8 border-t border-neutral-800 grid grid-cols-3 gap-6">
              {[['4', 'detection layers'], ['~1ms', 'overhead per call'], ['0', 'config files']].map(([v, l]) => (
                <div key={l}>
                  <div className="font-sans font-black text-3xl text-white">{v}</div>
                  <div className="font-mono text-[10px] text-gray-600 mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:pt-4">
            <p className="font-mono text-[10px] text-gray-700 mb-3 uppercase tracking-widest">live — a run being scored in real time</p>
            <LiveRun />
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="border-b border-neutral-800 py-3 overflow-hidden bg-black">
        <div className="flex whitespace-nowrap tk">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex shrink-0">
              {[['1001', 'status_failure', 'text-red-600'], ['1007', 'token_accounting_mismatch', 'text-red-600'], ['2001', 'json_contract_violation', 'text-orange-500'], ['2011', 'missing_required_key', 'text-orange-500'], ['4007', 'high_latency_low_output', 'text-blue-500'], ['5001', 'latency_iqr_fence', 'text-violet-500'], ['5002', 'tokens_iqr_fence', 'text-violet-500'], ['2003', 'enum_contract_violation', 'text-orange-500'], ['5003', 'cost_iqr_fence', 'text-violet-500'], ['1003', 'empty_output_on_success', 'text-red-600']].map(([code, name, c]) => (
                <span key={code} className="inline-flex items-center gap-2.5 px-6 font-mono text-[11px]">
                  <span className={`font-bold ${c}`}>{code}</span><span className="text-gray-800">{name}</span><span className="text-gray-900 mx-3">·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works: capability arc ── */}
      <section id="how" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">How it works</p>
              <h2 className="font-sans font-black text-4xl sm:text-5xl text-white">Detect. Learn.<br />Confirm. Warm-start.</h2>
            </div>
            <p className="font-mono text-xs text-gray-600 max-w-xs text-right leading-6 hidden lg:block">Four moves that turn raw traces into a detector that gets sharper the more you use it.</p>
          </div>
          <Pillars />
        </div>
      </section>

      {/* ── Detection engine ── */}
      <section id="detection" className="pt-4 pb-4 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">Inside the engine</p>
              <h2 className="font-sans font-black text-4xl sm:text-5xl text-white">L1 · L2 · L4 · L5</h2>
            </div>
            <p className="font-mono text-xs text-gray-600 max-w-xs text-right leading-6 hidden lg:block">Four layers, each catching something different. Scores accumulate — once total ≥ 100pts, it fires.</p>
          </div>
          <LayerExplorer />
        </div>
      </section>

      {/* ── Product board ── */}
      <section id="product" className="py-20 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
          <div className="lg:col-span-2">
            <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">The dashboard</p>
            <h2 className="font-sans font-black text-4xl text-white mb-5 leading-tight">Not another<br />pane of glass.</h2>
            <p className="font-mono text-xs text-gray-500 leading-7 mb-6">Every step gets a semantic profile and its own baseline. The steps view ranks what&apos;s <span className="text-yellow-500">drifting</span> and what&apos;s <span className="text-red-500">critical</span> — latency creep and cost drift that per-call checks miss. Click any run for the full waterfall and one-tap AI root-cause.</p>
            <Link href="/login" className="font-mono text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">open a live demo project →</Link>
          </div>
          <div className="lg:col-span-3"><ProductBoard /></div>
        </div>
      </section>

      {/* ── Features (violet) ── */}
      <section className="bg-violet-700 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[10px] text-violet-300 uppercase tracking-widest mb-4">Everything included</p>
          <h2 className="font-sans font-black text-4xl sm:text-5xl text-white mb-14">The full stack.<br />No config files.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-0">
            {[
              ['Learned output contracts', 'Each step’s output shape induced from its own history — required keys, JSON format, enum domains. Proposed, never silently enforced, until you confirm.'],
              ['Statistical drift baselines', 'Per-step IQR/log-normal fences. Multiplicative outlier detection that survives past spikes — no z-score blind spots.'],
              ['Confirmation flywheel', 'Confirm anomalies or flag false alarms. Proprietary labels only your production traffic can make — they tune detection now, train the model later.'],
              ['Warm-start import', 'Pull Langfuse history and build baselines from real traffic in minutes. Backdated, deduped, alert-suppressed. Signal on day one.'],
              ['AI root-cause analysis', 'One click runs claude-sonnet over an entire run — every step, every score — and tells you what broke and why.'],
              ['Step identity & profiles', 'System prompts embedded locally. Each step gets a stable semantic profile that survives renames and rewrites. Baselines are per-step, not project-wide.'],
              ['Slack + Sentry, out of the box', 'Errors, rate spikes, and anomalies to your channel. Every call as a Sentry performance transaction, anomalies as fingerprinted issues.'],
              ['Per-step cost & token tracking', 'Every call captured — tokens, latency, cost, model. Per-run Gantt waterfall. Monthly budget alerts.'],
            ].map(([title, desc]) => (
              <div key={title as string} className="py-6 border-b border-violet-600 last:border-b-0 md:[&:nth-child(7)]:border-b-0 md:[&:nth-child(8)]:border-b-0">
                <div className="font-sans font-bold text-white mb-1.5 text-sm">{title}</div>
                <div className="font-mono text-xs text-violet-200 leading-6">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Works with your stack ── */}
      <section id="stack" className="py-20 px-6 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">Works with your stack</p>
              <h2 className="font-sans font-black text-4xl sm:text-5xl text-white">Keep your stack.<br />Add detection.</h2>
            </div>
            <p className="font-mono text-xs text-gray-600 max-w-xs text-right leading-6 hidden lg:block">Traces in from what you already run. Alerts out to where you already look. Cernova sits on top — it doesn&apos;t replace anything.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-800 border border-neutral-800">
            {[
              ['Anthropic SDK', 'traces in', 'in', true], ['OpenAI SDK', 'traces in', 'in', true],
              ['LangChain', 'python · any provider', 'in', true], ['OpenTelemetry', 'genai ingest', 'in', true],
              ['Vercel AI SDK', 'telemetry ingest', 'in', true], ['Langfuse', 'warm-start import', 'in', true],
              ['Slack', 'alerts out', 'out', true], ['Sentry', 'transactions + issues', 'out', true],
              ['Webhooks', 'signed events out', 'out', true],
            ].map(([name, sub, dir, live]) => (
              <div key={name as string} className="bg-black p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-mono text-[9px] uppercase tracking-widest ${dir === 'in' ? 'text-violet-500' : 'text-blue-500'}`}>{dir === 'in' ? '→ in' : 'out →'}</span>
                  <span className={`font-mono text-[10px] ${live ? 'text-green-500' : 'text-gray-700'}`}>{live ? 'live' : 'soon'}</span>
                </div>
                <div className="font-sans font-bold text-sm text-white mb-1">{name}</div>
                <div className="font-mono text-[11px] text-gray-600">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Setup ── */}
      <section className="py-20 px-6 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[10px] text-gray-600 uppercase tracking-widest mb-3">Setup</p>
          <h2 className="font-sans font-black text-4xl sm:text-5xl text-white mb-4">Three steps.<br />Under five minutes.</h2>
          <p className="font-mono text-xs text-gray-600 mb-14">Or skip the wait — <span className="text-violet-400">import your Langfuse history</span> and start with warm baselines.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { n: '01', title: 'Install', code: 'npm install @cernova/sdk' },
              { n: '02', title: 'Wrap your client', code: `const tracer = new Tracer({ apiKey })
const anthropic = tracer.wrapAnthropic(
  new Anthropic()
)` },
              { n: '03', title: 'Use normally', code: `await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  messages: [...],
  _trace: { stepName: 'classify' },
})` },
            ].map((s) => (
              <div key={s.n}>
                <div className="font-sans font-black text-[80px] text-neutral-900 leading-none mb-6 select-none">{s.n}</div>
                <div className="font-sans font-bold text-white text-sm mb-4">{s.title}</div>
                <div className="border border-neutral-800 bg-neutral-950 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
                    <span className="font-mono text-[10px] text-gray-700">typescript</span>
                    <CopyBtn text={s.code} />
                  </div>
                  <pre className="px-4 py-4 font-mono text-xs text-violet-300 whitespace-pre leading-6 overflow-x-auto">{s.code}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-sans font-black text-5xl sm:text-7xl text-white leading-[0.95] mb-10">Dashboards show you.<br /><span className="text-violet-500">Cernova tells you.</span></h2>
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/login" className="font-mono font-bold text-sm px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white transition-colors">get started free →</Link>
            <Link href="/docs" className="font-mono text-sm text-gray-600 hover:text-white transition-colors underline underline-offset-4">read the docs</Link>
            <span className="font-mono text-[11px] text-gray-700">no credit card · free to start</span>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-neutral-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-sans font-black text-sm text-white">
            <img src="/logo.svg" alt="" className="w-5 h-5" />
            Cernova
          </Link>
          <div className="flex items-center gap-8">
            <Link href="/docs" className="font-mono text-[11px] text-gray-700 hover:text-white transition-colors">docs</Link>
            <Link href="/login" className="font-mono text-[11px] text-gray-700 hover:text-white transition-colors">sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
