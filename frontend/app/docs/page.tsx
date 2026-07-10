'use client';

import Link from 'next/link';
import { useState } from 'react';

// ── Shared components ─────────────────────────────────────────────────────────

function Code({ children, lang = 'ts' }: { children: string; lang?: string }) {
  return (
    <div className="border border-neutral-800 overflow-hidden my-5 bg-black">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <span className="text-[10px] font-mono text-gray-700 uppercase tracking-widest">{lang}</span>
      </div>
      <pre className="px-5 py-4 text-xs font-mono text-violet-300 overflow-x-auto leading-6 whitespace-pre">{children}</pre>
    </div>
  );
}

function Callout({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const border = { info: 'border-violet-600', warn: 'border-yellow-600', tip: 'border-green-600' };
  return (
    <div className={`border-l-2 ${border[type]} pl-4 my-5 py-1`}>
      <div className="font-mono text-xs text-gray-500 leading-6">{children}</div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-sans font-black text-xl text-white mt-12 mb-4 first:mt-0">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-sans font-bold text-sm text-white mt-8 mb-3 uppercase tracking-widest">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs text-gray-500 leading-6 mb-4">{children}</p>;
}

function Table({ rows }: { rows: { f: string; t?: string; d: string }[] }) {
  return (
    <div className="border border-neutral-800 overflow-hidden mb-6">
      <table className="w-full">
        <tbody className="divide-y divide-neutral-800">
          {rows.map((r) => (
            <tr key={r.f} className="hover:bg-neutral-900 transition-colors">
              <td className="px-4 py-3 font-mono text-[11px] text-gray-300 align-top w-36 shrink-0">{r.f}</td>
              {r.t && <td className="px-4 py-3 font-mono text-[11px] text-violet-400 align-top w-20">{r.t}</td>}
              <td className="px-4 py-3 font-mono text-[11px] text-gray-600 leading-5">{r.d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rows({ items }: { items: { key: string; label?: string; color?: string; value: string }[] }) {
  return (
    <div className="border border-neutral-800 divide-y divide-neutral-800 mb-6">
      {items.map((r) => (
        <div key={r.key} className="flex gap-4 px-4 py-3 hover:bg-neutral-900 transition-colors">
          <span className={`font-mono text-[11px] shrink-0 w-32 ${r.color ?? 'text-gray-400'}`}>{r.key}</span>
          {r.label && <span className="font-mono text-[11px] text-gray-300 shrink-0 w-20">{r.label}</span>}
          <span className="font-mono text-[11px] text-gray-600 leading-5">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type Lang = 'ts' | 'py';

function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex border border-neutral-800 mb-8 w-fit">
      {(['ts', 'py'] as Lang[]).map((l, i) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={[
            'px-4 py-1.5 font-mono text-xs transition-colors',
            i === 0 ? 'border-r border-neutral-800' : '',
            lang === l ? 'bg-neutral-900 text-white' : 'text-gray-600 hover:text-gray-400',
          ].join(' ')}
        >
          {l === 'ts' ? 'TypeScript' : 'Python'}
        </button>
      ))}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

type Section = 'start' | 'sdk' | 'detection' | 'integrations';

const SECTIONS: { id: Section; label: string; sub: string }[] = [
  { id: 'start',        label: 'Getting started', sub: 'quick start, concepts, install' },
  { id: 'sdk',          label: 'SDK reference',   sub: 'TypeScript · Python / LangChain' },
  { id: 'detection',    label: 'Anomaly detection', sub: 'layers, contracts, confirmations' },
  { id: 'integrations', label: 'Integrations',    sub: 'import, OpenTelemetry, Slack, Sentry' },
];

// ── Section: Getting started ──────────────────────────────────────────────────

function SectionStart({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div>
      <H2>Quick start</H2>
      <P>Two lines to start tracing every LLM call — tokens, latency, cost, and anomaly scores captured automatically.</P>

      <LangSwitch lang={lang} setLang={setLang} />

      {lang === 'ts' ? (
        <>
          <Code>{`import { Tracer } from '@cernova/sdk'
import Anthropic from '@anthropic-ai/sdk'

const tracer    = new Tracer({ apiKey: 'trace_...' })
const anthropic = tracer.wrapAnthropic(new Anthropic())

// Use exactly like the normal Anthropic client
const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello!' }],
})
// Every call is now traced in your dashboard`}</Code>
          <Callout type="info">
            Find your API key in the dashboard under <strong className="text-gray-300">Settings → API Key</strong> for each project.
          </Callout>
        </>
      ) : (
        <>
          <Code lang="bash">{`pip install cernova[langchain]`}</Code>
          <Code lang="python">{`from cernova import Tracer
from cernova.langchain import CernovaCallbackHandler
from langchain_anthropic import ChatAnthropic

tracer  = Tracer(api_key="trace_...")
handler = CernovaCallbackHandler(tracer)

# Attach to any LangChain LLM — works with Anthropic, OpenAI, Gemini, etc.
llm = ChatAnthropic(model="claude-haiku-4-5-20251001", callbacks=[handler])
llm.invoke([{"role": "user", "content": "Hello!"}])
# Every call is now traced in your dashboard`}</Code>
          <Callout type="info">
            Find your API key in the dashboard under <strong className="text-gray-300">Settings → API Key</strong> for each project.
          </Callout>
        </>
      )}

      <H2>Core concepts</H2>
      <Rows items={[
        { key: 'Project', value: 'An isolated workspace with its own API key, dashboard, and alert config. One API key = one project.' },
        { key: 'Run',     value: 'A single end-to-end execution of your AI pipeline — one user request handled by multiple steps. All steps sharing a run_id are grouped together.' },
        { key: 'Step',    value: 'A single LLM call within a run. Named with _trace: { stepName } (TS) or config metadata (Python). Captures model, tokens, latency, cost, and output.' },
        { key: 'Profile', value: 'The semantic identity of a step — derived from its system prompt embedding. Stable across renames and minor prompt tweaks. Foundation of per-step baselines.' },
      ]} />

      <H2>Installation</H2>
      {lang === 'ts' ? (
        <>
          <Code lang="bash">npm install @cernova/sdk</Code>
          <P>No background processes, no native dependencies. Works in Node.js 18+ and any runtime with the Fetch API.</P>
        </>
      ) : (
        <>
          <Code lang="bash">{`pip install cernova              # core only
pip install cernova[langchain]   # + LangChain callback handler`}</Code>
          <P>No background processes. Works in Python 3.9+. The LangChain extra adds langchain-core — no other dependencies.</P>
        </>
      )}
    </div>
  );
}

// ── Section: SDK reference ────────────────────────────────────────────────────

function SectionSDK({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div>
      <LangSwitch lang={lang} setLang={setLang} />

      {lang === 'ts' ? <SectionSDKTS /> : <SectionSDKPy />}
    </div>
  );
}

function SectionSDKTS() {
  return (
    <>
      <H2>new Tracer(config)</H2>
      <P>The entry point. Create one instance per application.</P>
      <Code>{`const tracer = new Tracer({
  apiKey: 'trace_...',   // required
  apiUrl: '...',         // optional — override for self-hosting / local dev
  runId:  '...',         // optional — provide your own run ID
})`}</Code>
      <Table rows={[
        { f: 'apiKey', t: 'string',  d: 'Your project API key. Required.' },
        { f: 'apiUrl', t: 'string?', d: 'Custom ingest URL. Defaults to cernova servers.' },
        { f: 'runId',  t: 'string?', d: 'Override the auto-generated run ID for this tracer.' },
      ]} />

      <H2>wrapAnthropic(client)</H2>
      <P>Returns a drop-in replacement for the Anthropic client. Intercepts every <code className="text-violet-400 font-mono">messages.create()</code> call, forwards it unchanged, and automatically ingests the trace after the response returns.</P>
      <Code>{`const anthropic = tracer.wrapAnthropic(new Anthropic())

await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 512,
  messages: [{ role: 'user', content: 'Summarise...' }],
})`}</Code>
      <Callout type="tip">
        The original client is not modified. Keep both — wrapped for traced calls, original for anything you don&apos;t want traced.
      </Callout>

      <H2>wrapOpenAI(client)</H2>
      <P>The same drop-in pattern for the OpenAI client. Wraps <code className="text-violet-400 font-mono">chat.completions.create()</code>, forwards it unchanged, and ingests the trace once the response returns. Pricing for gpt-4o, gpt-4o-mini, o1, o3-mini and others is built in, so cost is captured automatically.</P>
      <Code>{`import OpenAI from 'openai'

const openai = tracer.wrapOpenAI(new OpenAI())

await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Summarise...' }],
  _trace: { stepName: 'summarize' },
})`}</Code>
      <Callout type="tip">
        Anthropic and OpenAI wrappers share one tracer. Mix providers inside the same <code className="text-gray-300">run()</code> and every step still lands under one run_id.
      </Callout>

      <H2>run()</H2>
      <P><strong className="text-gray-300">Key concept for multi-step pipelines.</strong> Calling <code className="text-violet-400 font-mono">anthropic.run()</code> creates a <code className="text-violet-400 font-mono">TracedRun</code> — a fresh execution context with its own <code className="text-violet-400 font-mono">run_id</code>. Every step on that run is grouped together in the dashboard.</P>
      <Callout type="warn">
        Without <code className="text-gray-300">run()</code>, all calls share the tracer&apos;s single runId and appear as one run. For multi-step workflows, always call <code className="text-gray-300">run()</code> at the start of each user request.
      </Callout>
      <Code>{`async function handleRequest(userMessage: string) {
  const run = anthropic.run()          // new run_id, step_index resets to 0

  const c1 = await run.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16,
    system: 'Classify as: billing, technical, general. Reply with just the category.',
    messages: [{ role: 'user', content: userMessage }],
    _trace: { stepName: 'classify-intent' },
  } as TracedMessageParams)

  const c2 = await run.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: 'You are a support agent. Be concise and helpful.',
    messages: [{ role: 'user', content: userMessage }],
    _trace: { stepName: 'generate-reply' },
  } as TracedMessageParams)

  console.log('run:', run.runId)       // shared ID for both steps
}`}</Code>

      <H2>Streaming</H2>
      <P><code className="text-violet-400 font-mono">messages.stream()</code> is fully supported. Tokens and latency are captured after the stream ends — zero impact on streaming latency.</P>
      <Code>{`const stream = run.messages.stream({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 512,
  messages: [{ role: 'user', content: 'Tell me a story.' }],
  _trace: { stepName: 'story' },
})

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text)
  }
}
// trace ingested automatically once stream completes`}</Code>

      <H2>Naming steps</H2>
      <P>Add <code className="text-violet-400 font-mono">_trace: {'{ stepName: \'...\' }'}</code> to give a step a human-readable name. Without it, steps are auto-named from the first 4 words of the system prompt.</P>
      <Callout type="tip">
        <strong className="text-gray-300">Keep system prompts as static templates.</strong> Dynamic content (user input, runtime values) should live in the messages array, not the system prompt. Cernova uses the system prompt to build a stable semantic fingerprint — dynamic system prompts create duplicate profiles.
      </Callout>
      <Code>{`// ✓ Good — static system prompt, dynamic user message
await run.messages.create({
  system: 'Extract named entities from the user message. Return JSON.',
  messages: [{ role: 'user', content: userInput }],
  _trace: { stepName: 'extract-entities' },
} as TracedMessageParams)

// ✗ Bad — dynamic content in system prompt breaks fingerprinting
await run.messages.create({
  system: \`You are helping \${userName} with \${topic}.\`,
  messages: [{ role: 'user', content: userInput }],
} as TracedMessageParams)`}</Code>

      <H2>Manual ingest</H2>
      <P>For steps outside the Anthropic client — external APIs, custom models, pre-computed results — use <code className="text-violet-400 font-mono">tracer.ingest()</code> directly.</P>
      <Code>{`await tracer.ingest({
  run_id:         'my-run-id',
  step_name:      'fetch-context',
  step_index:     1,
  model:          'custom-model',
  prompt:         JSON.stringify({ system: '...', messages: [...] }),
  input_tokens:   120,
  output_tokens:  48,
  total_tokens:   168,
  latency_ms:     340,
  cost:           0.0014,
  status_success: true,
  output_code:    'The user wants a refund.',
})`}</Code>
      <Table rows={[
        { f: 'run_id',         d: 'Groups steps into one run. Use run.runId from a TracedRun, or any UUID.' },
        { f: 'step_name',      d: 'Human-readable name. Shown in the dashboard and analysis reports.' },
        { f: 'step_index',     d: 'Order within the run. Steps are sorted by this in the run graph.' },
        { f: 'model',          d: 'Model identifier string, e.g. "claude-haiku-4-5-20251001".' },
        { f: 'prompt',         d: 'The prompt sent to the model. Use JSON.stringify({ system, messages }) — the system field is used for step fingerprinting.' },
        { f: 'input_tokens',   d: 'Input token count as reported by the model.' },
        { f: 'output_tokens',  d: 'Output token count.' },
        { f: 'total_tokens',   d: 'Should equal input + output. Mismatch triggers anomaly code 1007.' },
        { f: 'latency_ms',     d: 'Wall-clock time from request start to response received.' },
        { f: 'cost',           d: 'USD cost for this call.' },
        { f: 'status_success', d: 'true if the call completed, false if it errored.' },
        { f: 'output_code',    d: "The model's response text. Used by the anomaly engine for shape analysis." },
        { f: 'error',          d: 'Error message. Required when status_success is false.' },
      ]} />
    </>
  );
}

function SectionSDKPy() {
  return (
    <>
      <H2>Tracer(api_key, api_url)</H2>
      <P>The entry point. Create one instance per application.</P>
      <Code lang="python">{`from cernova import Tracer

tracer = Tracer(
    api_key = "trace_...",                 # required
    api_url = "https://...",               # optional — override for local dev
)`}</Code>
      <Table rows={[
        { f: 'api_key', t: 'str',   d: 'Your project API key. Required.' },
        { f: 'api_url', t: 'str',   d: 'Custom ingest URL. Defaults to cernova servers.' },
      ]} />

      <H2>CernovaCallbackHandler</H2>
      <P>LangChain callback handler — attach to any LangChain LLM or chain. Works with Anthropic, OpenAI, Gemini, Cohere, and every other LangChain-supported provider.</P>
      <Code lang="python">{`from cernova.langchain import CernovaCallbackHandler
from langchain_anthropic import ChatAnthropic

handler = CernovaCallbackHandler(tracer)

# Option 1 — attach at LLM level (traces all calls on this LLM)
llm = ChatAnthropic(model="claude-haiku-4-5-20251001", callbacks=[handler])

# Option 2 — attach at invoke level (one-off)
llm.invoke([...], config={"callbacks": [handler]})`}</Code>

      <H2>Naming steps</H2>
      <P>Pass <code className="text-violet-400 font-mono">step_name</code> in config metadata. Without it, the step is labeled from the LangChain model name (e.g. <code className="text-violet-400 font-mono">ChatAnthropic</code>).</P>
      <Code lang="python">{`chain.invoke(
    {"text": "..."},
    config={"metadata": {"step_name": "summarize"}},
)`}</Code>
      <Callout type="tip">
        <strong className="text-gray-300">Keep system prompts as static templates.</strong> Cernova uses the system prompt to build a stable semantic fingerprint. Dynamic system prompts create a new step profile on every call. Put user-specific data in the human message, not the system prompt.
      </Callout>

      <H2>Multi-step pipelines</H2>
      <P>Steps inside a single <code className="text-violet-400 font-mono">chain.invoke()</code> are automatically grouped into one run. Wrap your workflow in <code className="text-violet-400 font-mono">RunnableLambda</code> and pass config through to each nested <code className="text-violet-400 font-mono">llm.invoke()</code>:</P>
      <Code lang="python">{`from langchain_core.runnables import RunnableLambda
from langchain_core.messages import SystemMessage, HumanMessage

def workflow(inputs, config):
    intent = llm.invoke(
        [SystemMessage(content="Classify as: billing, technical, general."),
         HumanMessage(content=inputs["message"])],
        config={**config, "metadata": {"step_name": "classify-intent"}},
    )
    reply = llm.invoke(
        [SystemMessage(content="You are a support agent. Be concise."),
         HumanMessage(content=inputs["message"])],
        config={**config, "metadata": {"step_name": "generate-reply"}},
    )
    return reply.content

chain = RunnableLambda(workflow)
chain.invoke({"message": "..."}, config={"callbacks": [handler]})
# → both steps share one run_id in the dashboard`}</Code>

      <H2>Manual ingest</H2>
      <P>For models outside LangChain — external APIs, custom models, pre-computed results — use <code className="text-violet-400 font-mono">tracer.ingest()</code> directly. Fire-and-forget: posts in a background thread, never blocks.</P>
      <Code lang="python">{`import time, json

start = time.monotonic()
# ... your model call ...
latency_ms = int((time.monotonic() - start) * 1000)

tracer.ingest(
    run_id        = "my-run-id",
    step_name     = "fetch-context",
    step_index    = 0,
    model         = "my-model",
    prompt        = json.dumps({"messages": [{"role": "system", "content": "..."},
                                             {"role": "user",   "content": "..."}]}),
    input_tokens  = 120,
    output_tokens = 48,
    total_tokens  = 168,
    latency_ms    = latency_ms,
    cost          = 0.0014,
    status_success= True,
    output_code   = "The user wants a refund.",
)`}</Code>
      <Callout type="info">
        For step fingerprinting to work correctly, include the system prompt as <code className="text-gray-300">{`{"role": "system", "content": "..."}`}</code> inside the messages array — or as a top-level <code className="text-gray-300">system</code> field. The system prompt is the stable identity of the step.
      </Callout>
      <Table rows={[
        { f: 'run_id',         d: 'Groups steps into one run. Any UUID string.' },
        { f: 'step_name',      d: 'Human-readable name shown in the dashboard.' },
        { f: 'step_index',     d: 'Order within the run.' },
        { f: 'model',          d: 'Model identifier string, e.g. "claude-haiku-4-5-20251001".' },
        { f: 'prompt',         d: 'JSON-serialized messages. Include system prompt for fingerprinting.' },
        { f: 'input_tokens',   d: 'Input token count as reported by the model.' },
        { f: 'output_tokens',  d: 'Output token count.' },
        { f: 'total_tokens',   d: 'Should equal input + output. Mismatch triggers anomaly code 1007.' },
        { f: 'latency_ms',     d: 'Wall-clock time from request start to response received.' },
        { f: 'cost',           d: 'USD cost for this call.' },
        { f: 'status_success', d: 'True if the call completed, False if it errored.' },
        { f: 'output_code',    d: "The model's response text. Used for shape analysis." },
        { f: 'error',          d: 'Error message string. Required when status_success is False.' },
      ]} />
    </>
  );
}

// ── Section: Anomaly detection ────────────────────────────────────────────────

function SectionDetection() {
  return (
    <div>
      <H2>How it works</H2>
      <P>Every ingested call is scored by a 4-layer engine running in the background. No configuration required. Scores accumulate — a single hard-failure hit (100 pts) is immediately critical. The format, numeric, and statistical layers score 10–60 pts each and require several to fire before crossing threshold. The engine short-circuits once score ≥ 100 pts.</P>

      <div className="border border-neutral-800 divide-y divide-neutral-800 mb-8">
        {[
          { accent: 'border-red-600',    title: 'Hard failures',        desc: 'Deterministic, non-heuristic. status_success=false, error present, token accounting mismatch (total ≠ input+output), negative counts. Any single hit → 100pts → immediate trigger.' },
          { accent: 'border-orange-600', title: 'Format violations',    desc: 'Prompt-implied output contracts. Prompt asks for JSON but output isn\'t valid JSON. Yes/no prompt but output is prose. Enum step returned a non-enumerated value.' },
          { accent: 'border-blue-600',   title: 'Numeric thresholds',   desc: 'Static and adaptive p95 limits for latency, tokens, cost. Stall detection (high latency, near-zero output). Cross-field plausibility checks. Defers 4001/4002/4003 to the statistical layer when a baseline is active.' },
          { accent: 'border-violet-600', title: 'Statistical baseline', desc: 'IQR/log-normal detection against each step\'s own call history. Tukey fence computed in log space — multiplicative detection (is this 5× the 75th percentile?) rather than additive. Activates after 20 clean calls. Owns latency/tokens/cost scoring when active.' },
        ].map((l) => (
          <div key={l.title} className={`flex gap-4 px-4 py-4 border-l-2 ${l.accent} hover:bg-neutral-900 transition-colors`}>
            <div>
              <div className="font-sans font-bold text-sm text-white mb-1">{l.title}</div>
              <p className="font-mono text-[11px] text-gray-600 leading-5">{l.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <H2>Step identity and fingerprinting</H2>
      <P>Each step is assigned a stable semantic identity called a <strong className="text-gray-300">step profile</strong> — derived from the embedding of its system prompt using a local sentence-transformers model (all-MiniLM-L6-v2, 384 dimensions). This identity persists across renames, minor prompt rewrites, and pipeline restructuring.</P>
      <Rows items={[
        { key: '> 0.92',    label: 'matched', color: 'text-green-500',  value: 'Same step. Uses the existing profile — anomaly baselines are stable.' },
        { key: '0.75–0.92', label: 'evolved', color: 'text-yellow-500', value: 'Same step but prompt has meaningfully drifted. Profile kept, last_evolved_at stamped. Baseline resets to post-evolution calls only.' },
        { key: '< 0.75',    label: 'new',     color: 'text-violet-400', value: 'Genuinely new step. A new profile is created with its own baseline.' },
      ]} />
      <Callout type="info">
        Fingerprinting runs asynchronously — it never adds latency to your application. The step_profile_id is backfilled on the CALLS row within a few seconds of ingest.
      </Callout>

      <H2>Statistical baseline detection</H2>
      <P>Once a step has 20+ calls, Cernova builds a per-step baseline using IQR statistics in log space. Every metric (latency, tokens, cost) is treated as log-normal — the right model for LLM data, which is always positive and right-skewed. Detection uses the Tukey fence:</P>
      <div className="border border-neutral-800 bg-black px-5 py-4 mb-5 font-mono text-sm text-gray-300 leading-7">
        <div>upper fence = log(Q3) + k × log-IQR</div>
        <div>lower fence = log(Q1) − k × log-IQR</div>
        <div className="mt-2 text-gray-600 text-xs">k = 2.5 (default) · Q1/Q3 = 25th/75th percentile in log space</div>
      </div>
      <P>A call fires the statistical layer when log(observed) falls outside the fence. The reported score is how many IQR-widths beyond the fence the value sits — e.g. <code className="text-violet-400 font-mono">+3.2×IQR</code> means the log-value is 3.2 fence-widths above the upper fence. This is multiplicative detection: &quot;is this call 5× more expensive than the 75th percentile?&quot; rather than additive &quot;is this call $0.50 above the mean?&quot;</P>
      <Rows items={[
        { key: '5001', label: 'latency_iqr_fence',       color: 'text-violet-400', value: 'Call latency falls outside the Tukey fence in log space (multiplicative latency spike).' },
        { key: '5002', label: 'tokens_iqr_fence',        color: 'text-violet-400', value: 'Total token count falls outside the fence — abnormally large or small output for this step.' },
        { key: '5003', label: 'cost_iqr_fence',          color: 'text-violet-400', value: 'Call cost falls outside the fence — typically caused by unexpected token growth.' },
        { key: '5004', label: 'output_tokens_iqr_fence', color: 'text-violet-400', value: 'Output token count alone falls outside the fence, independent of input.' },
      ]} />
      <Callout type="tip">
        <strong className="text-gray-300">Why IQR/log-normal over z-score?</strong> Z-scores assume normal distribution and are sensitive to outliers — a single past latency spike inflates std, making the detector blind to future spikes. IQR uses the middle 50% of data (Q1–Q3) so outliers don&apos;t shift the fence. Log-space means the test is multiplicative, which matches how LLM anomalies actually manifest.
      </Callout>
      <P>Below 20 calls per step, the statistical layer is inactive and the numeric thresholds serve as fallback. The baseline also excludes: calls using a different model, calls before the last prompt evolution timestamp, and calls that themselves triggered anomalies.</P>

      <H2>Trend detection</H2>
      <P>The Steps tab compares each step&apos;s recent window (last 10 calls) against its baseline window (calls 11–60) to detect gradual degradation that per-call scoring misses. Uses the same IQR/log-normal model as the statistical layer — the recent window mean is checked against the baseline Tukey fence. The reported deviation (<code className="text-violet-400 font-mono">+1.4×IQR</code>) is how many IQR-widths outside the fence the recent average sits.</P>
      <Rows items={[
        { key: 'healthy',   color: 'text-green-500',  value: 'Recent mean is within the baseline IQR box (Q1–Q3). No drift.' },
        { key: 'degrading', color: 'text-yellow-500', value: 'Recent mean has drifted outside the IQR box but within the Tukey fence. Early warning.' },
        { key: 'critical',  color: 'text-red-500',    value: 'Recent mean is outside the Tukey fence (k=2.5). Significant regression — the average of the last 10 calls is anomalous by the statistical layer\'s standards.' },
        { key: 'warming',   color: 'text-gray-600',   value: 'Not enough call history yet. Shows progress toward the 20-call activation threshold.' },
      ]} />
      <P>Trend detection requires at least 30 calls per step (20 baseline + 10 recent). It catches slow latency creep, cost drift, and throughput degradation that individual call scores would miss.</P>

      <H2>Learned output contracts</H2>
      <P>Beyond the prompt-implied checks in the output-format layer, Cernova induces each step&apos;s output contract from its <strong className="text-gray-300">own history</strong> — no schema to hand-write. After 20+ successful outputs it learns the shape: which keys are always present, whether the output is reliably JSON, and small enum domains. New calls are checked against that contract, and structural breaks fold into the anomaly score as output-format codes.</P>
      <Rows items={[
        { key: '2010', label: 'format_not_json',      color: 'text-orange-400', value: 'The contract expects JSON but the output no longer parses.' },
        { key: '2011', label: 'missing_required_key', color: 'text-orange-400', value: 'A key present in effectively every historical output is missing.' },
        { key: '2012', label: 'wrong_type',           color: 'text-orange-400', value: 'A key\'s value type changed from the type the contract learned.' },
      ]} />
      <Callout type="warn">
        <strong className="text-gray-300">Never silently enforced.</strong> A freshly learned contract starts <strong className="text-gray-300">proposed</strong> — it is checked and logged on live traffic but does not affect scores until you confirm it. Soft drifts (a brand-new enum value, an out-of-range number) are logged as drift signals, never scored.
      </Callout>
      <Rows items={[
        { key: 'observing', color: 'text-gray-600',   value: 'Fewer than 20 samples. Still learning — not yet checking.' },
        { key: 'proposed',  color: 'text-yellow-500', value: 'Learned and checked on live traffic, logged only. Awaiting your confirmation.' },
        { key: 'enforced',  color: 'text-green-500',  value: 'Confirmed. Hard violations now fold into the anomaly score.' },
        { key: 'rejected',  color: 'text-red-500',    value: 'Marked wrong. Enforces nothing and will not be re-proposed.' },
      ]} />

      <H2>Confirming detections</H2>
      <P>Detection gets sharper when you tell it what was real. The rare, high-signal moments — a contract proposed, an anomaly fired — take a one-tap human verdict. Verdicts are always stored as labels; for contracts they act immediately. These are proprietary labels only your production traffic can produce — they tune your project now and train the detection model later.</P>
      <Rows items={[
        { key: 'confirm', label: 'contract', color: 'text-green-500', value: 'Promotes a proposed contract to enforced — it starts scoring.' },
        { key: 'reject',  label: 'contract', color: 'text-red-500',   value: 'Retires the contract. It enforces nothing and won\'t be re-proposed.' },
        { key: 'confirm / reject', label: 'anomaly', color: 'text-violet-400', value: 'Marks an anomaly real or a false alarm. Captured as a label for tuning.' },
      ]} />
      <Code lang="bash">{`# List a project's contracts — see what's proposed and worth confirming
curl https://api.cernova.dev/contracts \\
  -H "Authorization: Bearer <CERNOVA_API_KEY>"

# Confirm a contract — promotes proposed -> enforced
curl -X POST https://api.cernova.dev/feedback \\
  -H "Authorization: Bearer <CERNOVA_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{"subject_type":"contract","subject_id":"<step_profile_id>","verdict":"confirm"}'`}</Code>
      <Table rows={[
        { f: 'subject_type', d: 'contract · anomaly · diagnosis — what the verdict is about.' },
        { f: 'subject_id',   d: 'The step_profile_id (contract), anomaly id, or run_id.' },
        { f: 'verdict',      d: 'confirm or reject.' },
        { f: 'detail',       d: 'Optional JSON context — which rule, why.' },
      ]} />

      <H2>AI run analysis</H2>
      <P>Open any run and click <strong className="text-gray-300">✦ Analyze Run</strong>. Cernova sends the full run context — every step, every anomaly score, every condition code — to claude-sonnet-4-6 and returns a structured report.</P>
      <div className="border border-neutral-800 border-l-2 border-l-violet-600 bg-black px-5 py-4 mb-5">
        <div className="font-mono text-[10px] text-violet-500 uppercase tracking-widest mb-3">Example output</div>
        <div className="space-y-3 font-mono text-[11px] text-gray-600 leading-5">
          <div><span className="text-gray-400 font-bold">Root cause</span><p className="mt-1">parse-request returned malformed JSON (unclosed bracket). This propagated into enrich-context causing a stall, then crashed generate-response with a null-reference when it attempted to read the entity list.</p></div>
          <div><span className="text-gray-400 font-bold">Recommendations</span>
            <p className="mt-1">— Add JSON.parse validation after parse-request before passing downstream</p>
            <p>— Add a retry with exponential backoff on enrich-context when input is null</p>
            <p>— Set a latency budget on enrich-context (currently 6.4s with 3 output tokens)</p>
          </div>
        </div>
      </div>
      <Callout type="info">
        Analysis cost is tracked per project in the <strong className="text-gray-300">Usage</strong> tab and counts toward your monthly budget.
      </Callout>
    </div>
  );
}

// ── Section: Integrations ─────────────────────────────────────────────────────

function SectionIntegrations() {
  return (
    <div>
      <P>Cernova is a detection layer, not another pane of glass. Traces flow <strong className="text-gray-300">in</strong> from what you already run — SDKs, OpenTelemetry, or a one-time import — and anomalies flow <strong className="text-gray-300">out</strong> to the tools your team already watches. Slack and Sentry are configured per-project in <strong className="text-gray-300">Settings</strong>, no code changes needed.</P>

      <H2>Slack</H2>
      <P>Paste a Slack <a href="https://api.slack.com/messaging/webhooks" className="text-violet-400 hover:text-violet-300 underline underline-offset-4" target="_blank" rel="noreferrer">Incoming Webhook URL</a> into project settings. Cernova posts alerts when:</P>
      <Rows items={[
        { key: 'Step error',       value: 'Any call where status_success=false fires immediately with step name, model, error message, and run ID.' },
        { key: 'Error rate spike', value: 'If more than N% of the last M calls fail, a rate alert fires. Both thresholds are configurable (default: 25% over 20 calls). 5 min cooldown.' },
        { key: 'Anomaly',          value: 'Fires when a run\'s anomaly score crosses the threshold. Configurable: critical only (≥100pts), warning + critical, or off. 1 min cooldown.' },
        { key: 'Budget exceeded',  value: 'When monthly AI analysis spend crosses your configured budget. One-time alert per hour.' },
      ]} />
      <Callout type="tip">
        Use the <strong className="text-gray-300">Test</strong> button in Settings to confirm delivery before going live.
      </Callout>

      <H2>Sentry</H2>
      <P>Add your Sentry project DSN in Settings. Cernova sends two types of data, isolated from your own backend&apos;s Sentry client:</P>
      <Rows items={[
        { key: 'Performance transactions', value: 'Every LLM call becomes a Sentry transaction named after its step. Latency, tokens, cost, and anomaly score appear as measurements. All steps in the same run share a trace_id so Sentry\'s distributed trace view reconstructs your full pipeline as a waterfall.' },
        { key: 'Anomaly events',           value: 'When a call crosses the anomaly threshold, a structured error event fires into your Sentry issues feed. Repeated failures on the same step fingerprint into one issue rather than spamming.' },
      ]} />

      <H3>Where to find your data</H3>
      <Rows items={[
        { key: 'Explore → Traces', color: 'text-violet-400', value: 'All LLM calls as transactions. Click any row to see the span waterfall — op:ai.inference root, op:ai.model.invoke child with gen_ai.usage.* attributes.' },
        { key: 'Issues',           color: 'text-violet-400', value: 'Anomaly events grouped by step name. Each issue shows the full condition breakdown, anomaly score, and a link to the run.' },
      ]} />

      <H3>Alert levels</H3>
      <Rows items={[
        { key: 'Critical only',      value: 'Anomaly events fire when total score ≥ 100 pts. Sent as error-level.' },
        { key: 'Warning + critical', value: 'Fires for any anomaly hit, even sub-threshold. Warnings sent as warning-level.' },
        { key: 'Off',               value: 'No Sentry output — DSN saved but nothing sent.' },
      ]} />
      <Callout type="info">
        Performance spans follow <a href="https://opentelemetry.io/docs/specs/semconv/gen-ai/" className="text-violet-400 hover:text-violet-300 underline underline-offset-4" target="_blank" rel="noreferrer">OpenTelemetry GenAI semantic conventions</a> — gen_ai.usage.input_tokens, gen_ai.system: &quot;anthropic&quot; — compatible with Sentry&apos;s native AI monitoring.
      </Callout>

      <H2>Webhooks</H2>
      <P>Send the structured anomaly event to any endpoint — PagerDuty, Opsgenie, n8n, or your own automation. Set a <strong className="text-gray-300">Webhook URL</strong> in project Settings; Cernova POSTs this payload whenever an anomaly fires, at the delivery level you choose (critical only, warning + critical, or off).</P>
      <Code lang="json">{`{
  "schema_version": 1,
  "type": "anomaly",
  "event_id": "9f2c…",
  "timestamp": "2026-07-05T01:00:00+00:00",
  "project_id": "…",
  "project_name": "support-agent",
  "run_id": "a3f9…",
  "step_name": "generate-reply",
  "model": "claude-haiku-4-5",
  "total_score": 110,
  "threshold": 100,
  "triggered": true,
  "codes": [
    { "code": 5001, "name": "latency_iqr_fence", "penalty": 30 }
  ]
}`}</Code>
      <P>Every request is signed. The <code className="text-violet-400 font-mono">X-Cernova-Signature</code> header is <code className="text-violet-400 font-mono">sha256=</code> followed by the HMAC-SHA256 of the raw request body, keyed with your project&apos;s signing secret (shown in Settings once a URL is saved). Verify it before trusting the payload:</P>
      <Code lang="python">{`import hashlib, hmac

def verify(secret: str, body: bytes, header: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)`}</Code>
      <Callout type="info">
        The payload is versioned via <code className="text-gray-300">schema_version</code> — fields may be added; renames or removals bump the version. Use the <strong className="text-gray-300">Test</strong> button in Settings to fire a synthetic event at your endpoint.
      </Callout>

      <H2>OpenTelemetry</H2>
      <P>Already emitting OpenTelemetry GenAI spans — via <a href="https://github.com/traceloop/openllmetry" className="text-violet-400 hover:text-violet-300 underline underline-offset-4" target="_blank" rel="noreferrer">OpenLLMetry</a>, Traceloop, or native instrumentation? Point your OTLP exporter at Cernova and every LLM span flows into the same detection pipeline — no SDK, no code change. Cernova reads the <a href="https://opentelemetry.io/docs/specs/semconv/gen-ai/" className="text-violet-400 hover:text-violet-300 underline underline-offset-4" target="_blank" rel="noreferrer">GenAI semantic conventions</a> and ignores non-LLM spans.</P>
      <Code lang="bash">{`# Point any OTLP exporter at Cernova
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.cernova.dev
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <CERNOVA_API_KEY>`}</Code>
      <P>Traces post to <code className="text-violet-400 font-mono">/v1/traces</code> (OTLP/HTTP, JSON or protobuf). The span&apos;s <code className="text-violet-400 font-mono">trace_id</code> becomes the Cernova run, each GenAI span becomes a step, and per-step fingerprinting and anomaly detection run exactly as they do for SDK ingests.</P>
      <Callout type="info">
        OTel spans rarely carry cost, so cost-based statistical detection is skipped for OTel traces — latency and token detection apply as normal. Use a Cernova SDK if you want cost tracking.
      </Callout>

      <H2>Vercel AI SDK</H2>
      <P>The <a href="https://sdk.vercel.ai" className="text-violet-400 hover:text-violet-300 underline underline-offset-4" target="_blank" rel="noreferrer">Vercel AI SDK</a> emits OpenTelemetry telemetry natively. Enable it per call and route the exporter to Cernova — no wrapper needed.</P>
      <Code>{`const result = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: '...',
  experimental_telemetry: { isEnabled: true },
})`}</Code>
      <P>With <code className="text-violet-400 font-mono">OTEL_EXPORTER_OTLP_ENDPOINT</code> and the Authorization header set as above, every generation is traced and scored automatically.</P>

      <H2>Langfuse import</H2>
      <P>Already running on Langfuse? Import your generation history to warm per-step baselines in minutes instead of waiting for live traffic. Cernova pulls your <code className="text-violet-400 font-mono">GENERATION</code> observations, backdates them to their original timestamps, and replays them through the same pipeline — building step profiles and baselines with alerts suppressed, so backfilling months of traffic fires no stale notifications.</P>
      <Code lang="bash">{`curl -X POST https://api.cernova.dev/import/langfuse \\
  -H "Authorization: Bearer <CERNOVA_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "public_key": "pk-lf-...",
    "secret_key": "sk-lf-...",
    "host": "https://cloud.langfuse.com"
  }'`}</Code>
      <P>Credentials are validated immediately — bad keys return <code className="text-violet-400 font-mono">400</code> — then the import runs in the background. Once a step crosses 20 imported calls, statistical detection activates automatically.</P>
      <Callout type="info">
        Imported calls are tagged <code className="text-gray-300">source=langfuse</code> and deduplicated on their Langfuse observation id, so you can re-run the import any time without creating duplicates.
      </Callout>

      <H2>LangSmith import</H2>
      <P>Already on LangSmith? Same warm-start, different source. Cernova queries your <code className="text-violet-400 font-mono">llm</code> runs, backdates them to their original timestamps, and replays them through the pipeline with alerts suppressed — so months of history seed per-step baselines without firing stale notifications.</P>
      <Code lang="bash">{`curl -X POST https://api.cernova.dev/import/langsmith \\
  -H "Authorization: Bearer <CERNOVA_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_key": "lsv2_...",
    "host": "https://api.smith.langchain.com"
  }'`}</Code>
      <P>Add <code className="text-violet-400 font-mono">"session_ids": ["..."]</code> to scope the import to specific LangSmith projects; omit it to pull every project the key can see. As with Langfuse, credentials are validated immediately — bad keys return <code className="text-violet-400 font-mono">400</code> — then the import runs in the background.</P>
      <Callout type="info">
        Imported calls are tagged <code className="text-gray-300">source=langsmith</code> and deduplicated on their LangSmith run id, so re-running the import never creates duplicates.
      </Callout>

      <H2>On the roadmap</H2>
      <P>Planned integrations, in rough priority order:</P>
      <Rows items={[
        { key: 'Read API', label: 'data out', color: 'text-gray-400', value: 'Pull traces, anomalies, and contracts programmatically with your project API key.' },
      ]} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [active, setActive] = useState<Section>('start');
  const [lang, setLang] = useState<Lang>('ts');
  const idx = SECTIONS.findIndex(s => s.id === active);

  const content: Record<Section, React.ReactNode> = {
    start:        <SectionStart lang={lang} setLang={setLang} />,
    sdk:          <SectionSDK lang={lang} setLang={setLang} />,
    detection:    <SectionDetection />,
    integrations: <SectionIntegrations />,
  };

  return (
    <div className="min-h-screen bg-black text-white antialiased">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-neutral-800 bg-black">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-sans font-black text-sm text-white">
            <img src="/logo.svg" alt="" className="w-5 h-5" />
            Cernova
          </Link>
          <div className="flex items-center gap-6">
            <span className="font-mono text-[11px] text-violet-500">docs</span>
            <Link href="/login" className="font-mono text-[11px] text-gray-600 hover:text-white transition-colors">sign in</Link>
            <Link href="/login" className="font-mono text-[11px] font-bold px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white transition-colors">
              get started →
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 pt-16 pb-24 flex gap-0">

        {/* Sidebar */}
        <aside className="hidden lg:block w-52 shrink-0 pt-12 border-r border-neutral-800">
          <div className="sticky top-24 pr-6">
            <p className="font-mono text-[10px] text-gray-700 uppercase tracking-widest mb-4">Documentation</p>
            <div className="space-y-px">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={[
                    'w-full text-left px-3 py-2.5 border-l-2 transition-colors',
                    active === s.id
                      ? 'border-violet-600 bg-neutral-900'
                      : 'border-transparent hover:border-neutral-700 hover:bg-neutral-900',
                  ].join(' ')}
                >
                  <div className={`font-mono text-xs ${active === s.id ? 'text-white' : 'text-gray-500'}`}>{s.label}</div>
                  <div className="font-mono text-[10px] text-gray-700 mt-0.5">{s.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 pt-12 pl-0 lg:pl-12 max-w-2xl">

          {/* Section header */}
          <div className="mb-10 pb-6 border-b border-neutral-800">
            <p className="font-mono text-[10px] text-gray-700 uppercase tracking-widest mb-2">
              {SECTIONS[idx]?.label}
            </p>
            <h1 className="font-sans font-black text-4xl text-white">
              {active === 'start'        && 'Getting started'}
              {active === 'sdk'          && 'SDK reference'}
              {active === 'detection'    && 'Anomaly detection'}
              {active === 'integrations' && 'Integrations'}
            </h1>
          </div>

          {content[active]}

          {/* Bottom pagination */}
          <div className="mt-16 pt-8 border-t border-neutral-800 flex items-center justify-between">
            {idx > 0 ? (
              <button
                onClick={() => setActive(SECTIONS[idx - 1].id)}
                className="font-mono text-xs text-gray-600 hover:text-white transition-colors"
              >
                ← {SECTIONS[idx - 1].label}
              </button>
            ) : <div />}
            {idx < SECTIONS.length - 1 ? (
              <button
                onClick={() => setActive(SECTIONS[idx + 1].id)}
                className="font-mono text-xs text-gray-600 hover:text-white transition-colors"
              >
                {SECTIONS[idx + 1].label} →
              </button>
            ) : (
              <Link href="/login" className="font-mono text-xs font-bold px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white transition-colors">
                get started free →
              </Link>
            )}
          </div>

        </main>
      </div>
    </div>
  );
}
