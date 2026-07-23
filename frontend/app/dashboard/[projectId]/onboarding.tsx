'use client';

// Onboarding surface: the empty-project first-run screen, the product tour, and
// a self-contained demo dataset the tour renders so each tab shows what real data
// looks like instead of an empty state. Demo data is display-only — it is never
// sent to the backend and is swapped out the moment the tour ends or a real trace
// arrives.

import { useState } from 'react';
import type { Call, AnomalyRow, StepHealthRow, ContractRow, Incident, Tab } from './types';

// ── First-run screen ──────────────────────────────────────────────────────────

export function FirstRun({ apiKey, connected, onImport }: { apiKey: string; connected: boolean; onImport: () => void }) {
  const [copied, setCopied] = useState(false);
  const snippet = `npm install @cernova/sdk

import { Tracer } from '@cernova/sdk';
const tracer    = new Tracer({ apiKey: '${apiKey}' });
const anthropic = tracer.wrapAnthropic(new Anthropic());`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — no-op */ }
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="font-sans font-black text-2xl text-[#e9e4f0] mb-2">See what your agent gets wrong.</h1>
      <p className="font-mono text-xs text-[#9a91ad] leading-6 mb-8 max-w-xl">
        Your logs say 200. Your dashboards are green. But the agent is hallucinating,
        misrouting, or quietly drifting. Connect it and Cernova surfaces the silent failures
        your other tools call success.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Import — fast, no code */}
        <div className="bg-[#281f38] border border-[#3a2f4e] p-6 flex flex-col">
          <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">fastest · no code</p>
          <h2 className="font-sans font-black text-sm text-[#e9e4f0] mb-2">Import existing traces</h2>
          <p className="font-mono text-[11px] text-[#9a91ad] leading-5 mb-5 flex-1">
            Already run Langfuse, LangSmith, or OpenTelemetry? Paste a key and we backfill your
            history — baselines and detection light up in about two minutes, zero integration.
          </p>
          <button
            onClick={onImport}
            className="w-full bg-[#b794f4] text-[#201a2b] py-2.5 font-mono text-xs font-bold hover:bg-[#c9b0f8] transition-colors"
          >
            Import traces →
          </button>
        </div>

        {/* SDK — building fresh */}
        <div className="bg-[#281f38] border border-[#3a2f4e] p-6 flex flex-col">
          <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-2">building fresh</p>
          <h2 className="font-sans font-black text-sm text-[#e9e4f0] mb-2">Install the SDK</h2>
          <p className="font-mono text-[11px] text-[#9a91ad] leading-5 mb-3">
            Two lines wrap your model client. Every call is traced automatically — no changes
            to your agent logic.
          </p>
          <pre className="bg-[#201a2b] border border-[#3a2f4e] p-3 mb-3 overflow-x-auto font-mono text-[10px] text-[#c9c2d6] leading-5 flex-1">{snippet}</pre>
          <button
            onClick={copy}
            className="w-full border border-[#3a2f4e] text-[#c9c2d6] py-2.5 font-mono text-xs hover:border-[#4a3d63] hover:text-[#e9e4f0] transition-colors"
          >
            {copied ? '✓ copied' : 'copy snippet'}
          </button>
        </div>
      </div>

      {/* Live indicator — silence should read as "listening", not "broken" */}
      <div className="flex items-center gap-2 mt-8 justify-center">
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#7fb59a] animate-pulse' : 'bg-[#7c7291]'}`} />
        <span className="font-mono text-[10px] text-[#7c7291]">
          {connected ? 'listening live — waiting for your first trace…' : 'connecting…'}
        </span>
      </div>
    </div>
  );
}

// ── Product tour ──────────────────────────────────────────────────────────────
// Copy explains each tab's PURPOSE and points at the demo data on screen, so it
// teaches even before the user has any traffic of their own.

export const TOUR_STEPS: { tab: Tab; title: string; body: string }[] = [
  {
    tab: 'overview',
    title: 'Overview — the pulse',
    body: 'Cost, latency, tokens, and volume across your whole agent. The numbers below are a sample run so you can see the shape — yours replace them the moment your first trace lands. Start here to answer "is anything off right now?"',
  },
  {
    tab: 'runs',
    title: 'Runs & logs — the full story',
    body: 'Every call and every multi-step run, end to end. The sample below is a 3-step support agent: classify → retrieve → reply. Click a run to open its timeline, then any step to read its exact prompt and output — this is where you drill in when something looks wrong.',
  },
  {
    tab: 'anomalies',
    title: 'Detections — why Cernova exists',
    body: 'When a call looks fine but isn’t — the right shape, a 200, but the wrong answer — it surfaces here. The sample incident below shows the same failure hitting several runs at once, collapsed into ONE alert instead of a storm. Confirm or dismiss each to teach the detector.',
  },
  {
    tab: 'steps',
    title: 'Steps — the heart of Cernova',
    body: 'Cernova splits your agent into steps and learns two things about each: its normal behavior (latency, cost, tokens) and its expected output shape. The sample shows one healthy step and one drifting — expand any step to see the drift, and to confirm the output shape it learned. Confirming turns a watched shape into an enforced check.',
  },
  {
    tab: 'settings',
    title: 'Settings — connect & route',
    body: 'Connect your data (or import existing traces to skip the cold start), send alerts to Slack, webhooks, or Sentry, and tune detection sensitivity per project. When you’re ready to go live, this is your one stop. That’s the tour — go break something.',
  },
];

export function TourOverlay({ step, index, total, onBack, onNext, onSkip }: {
  step: { tab: Tab; title: string; body: string };
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const last = index === total - 1;
  const tabLabel = step.tab === 'anomalies' ? 'detections' : step.tab;
  return (
    // No dark backdrop: the demo-populated tab stays fully visible above the card.
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pointer-events-none">
      <div className="w-full max-w-md bg-[#281f38] border border-[#b794f4]/50 shadow-2xl pointer-events-auto">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="font-mono text-[10px] text-[#7c7291]">{index + 1} / {total}</span>
          <button onClick={onSkip} className="font-mono text-[10px] text-[#7c7291] hover:text-[#e9e4f0] transition-colors">skip tour ✕</button>
        </div>
        <div className="px-5 pb-5 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#b794f4]" />
            <span className="font-mono text-[10px] text-[#c4a6f2] uppercase tracking-widest">{tabLabel}</span>
          </div>
          <h2 className="font-sans font-black text-lg text-[#e9e4f0] mb-2">{step.title}</h2>
          <p className="font-mono text-[11px] text-[#9a91ad] leading-6">{step.body}</p>
        </div>
        <div className="flex items-center justify-between border-t border-[#3a2f4e] px-5 py-3">
          <button
            onClick={onBack}
            disabled={index === 0}
            className="font-mono text-[11px] text-[#9a91ad] hover:text-[#e9e4f0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← back
          </button>
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full ${i === index ? 'bg-[#b794f4]' : 'bg-[#3a2f4e]'}`} />
            ))}
          </div>
          <button
            onClick={onNext}
            className="bg-[#b794f4] text-[#201a2b] px-4 py-1.5 font-mono text-[11px] font-bold hover:bg-[#c9b0f8] transition-colors"
          >
            {last ? 'done' : 'next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Demo dataset ──────────────────────────────────────────────────────────────
// Rendered only while the tour runs on an empty project. Realistic enough to show
// what each tab feels like with traffic; timestamps are relative to load so it
// always reads as "recent".

const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();

const RUN_A = 'run_demo_9f2a';   // healthy 3-step run
const RUN_B = 'run_demo_4c7d';   // silent failure — flagged
const RUN_C = 'run_demo_1b83';   // another normal run

export const DEMO_CALLS: Call[] = [
  // RUN_B first (most recent) — the flagged one
  { id: 'c-b1', run_id: RUN_B, step_index: 0, step_name: 'classify-intent', model: 'claude-sonnet-5', input_tokens: 320, output_tokens: 12, total_tokens: 332, latency_ms: 410, cost: 0.0014, status_success: true, created_at: ago(3),
    prompt: '{"messages":[{"role":"user","content":"my invoice is wrong, i was double charged"}]}', output_code: 'billing' },
  { id: 'c-b2', run_id: RUN_B, step_index: 1, step_name: 'generate-reply', model: 'claude-sonnet-5', input_tokens: 1180, output_tokens: 240, total_tokens: 1420, latency_ms: 3120, cost: 0.0121, status_success: true, created_at: ago(3),
    prompt: '{"messages":[{"role":"user","content":"my invoice is wrong, i was double charged"}]}', output_code: 'Our restaurant is open until 10pm on weekdays! Let me know if you would like a reservation.' },

  // RUN_A — clean 3-step
  { id: 'c-a1', run_id: RUN_A, step_index: 0, step_name: 'classify-intent', model: 'claude-sonnet-5', input_tokens: 300, output_tokens: 11, total_tokens: 311, latency_ms: 380, cost: 0.0013, status_success: true, created_at: ago(11),
    prompt: '{"messages":[{"role":"user","content":"what are your hours?"}]}', output_code: 'general' },
  { id: 'c-a2', run_id: RUN_A, step_index: 1, step_name: 'retrieve-context', model: 'text-embedding-3-small', input_tokens: 64, output_tokens: 0, total_tokens: 64, latency_ms: 120, cost: 0.0000, status_success: true, created_at: ago(11),
    prompt: '{"messages":[{"role":"user","content":"what are your hours?"}]}', output_code: '["hours: 9-10pm weekdays","location: 5th ave"]' },
  { id: 'c-a3', run_id: RUN_A, step_index: 2, step_name: 'generate-reply', model: 'claude-sonnet-5', input_tokens: 640, output_tokens: 38, total_tokens: 678, latency_ms: 900, cost: 0.0041, status_success: true, created_at: ago(11),
    prompt: '{"messages":[{"role":"user","content":"what are your hours?"}]}', output_code: 'We are open 9am–10pm on weekdays. Hope to see you soon!' },

  // RUN_C — normal
  { id: 'c-c1', run_id: RUN_C, step_index: 0, step_name: 'classify-intent', model: 'claude-sonnet-5', input_tokens: 290, output_tokens: 10, total_tokens: 300, latency_ms: 360, cost: 0.0012, status_success: true, created_at: ago(24),
    prompt: '{"messages":[{"role":"user","content":"do you take reservations?"}]}', output_code: 'general' },
  { id: 'c-c2', run_id: RUN_C, step_index: 1, step_name: 'generate-reply', model: 'claude-sonnet-5', input_tokens: 610, output_tokens: 44, total_tokens: 654, latency_ms: 880, cost: 0.0039, status_success: true, created_at: ago(24),
    prompt: '{"messages":[{"role":"user","content":"do you take reservations?"}]}', output_code: 'Yes! We take reservations for parties of two or more. What time works for you?' },
];

// RUN_B is the silent failure: fluent, 200, valid-looking — but answers a billing
// question with restaurant hours. Fences + hard checks pass; semantic surprise fires.
export const DEMO_ANOMALIES: AnomalyRow[] = [
  { id: 9001, step_name: 'generate-reply', run_id: RUN_B, project_id: null, error_code: 5010, penalty_score: 40, created_at: ago(3) },
  { id: 9002, step_name: 'generate-reply', run_id: RUN_B, project_id: null, error_code: 5001, penalty_score: 30, created_at: ago(3) },
  { id: 9003, step_name: 'generate-reply', run_id: RUN_B, project_id: null, error_code: 2011, penalty_score: 40, created_at: ago(3) },
];

export const DEMO_STEP_HEALTH: StepHealthRow[] = [
  { step_profile_id: 'sp-classify', step_name: 'classify-intent', status: 'healthy', sample_count: 214,
    trends: [] },
  { step_profile_id: 'sp-retrieve', step_name: 'retrieve-context', status: 'degrading', sample_count: 156,
    trends: [{ metric: 'latency_ms', baseline_mean: 118, recent_mean: 240, sigma: 2.3, direction: 'up' }] },
  { step_profile_id: 'sp-reply', step_name: 'generate-reply', status: 'critical', sample_count: 198,
    trends: [{ metric: 'latency_ms', baseline_mean: 890, recent_mean: 3120, sigma: 4.1, direction: 'up' }] },
  { step_profile_id: 'sp-summarize', step_name: 'summarize-ticket', status: 'warming', sample_count: 12,
    trends: [] },
];

export const DEMO_CONTRACTS: ContractRow[] = [
  {
    step_profile_id: 'sp-classify',
    step_name: 'classify-intent',
    status: 'proposed',
    format: 'json',
    json_rate: 0.98,
    required_keys: ['category', 'confidence'],
    keys: {
      category:   { name: 'category', presence: 1.0, types: ['string'], enum_values: ['general', 'billing', 'technical', 'account'] },
      confidence: { name: 'confidence', presence: 0.97, types: ['number'], num_min: 0, num_max: 1 },
    },
    sample_count: 42,
  },
];

export const DEMO_INCIDENTS: Incident[] = [
  { id: 7001, step_name: 'generate-reply', error_code: 5010, run_count: 6, window_min: 10, status: 'open', opened_at: ago(4) },
];
