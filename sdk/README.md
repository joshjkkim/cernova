# @cernova/sdk

The detection layer for LLM pipelines. Wraps Anthropic's `messages.create`/`messages.stream` and OpenAI's `chat.completions.create` to automatically capture tokens, latency, and cost — [Cernova](https://cernova.dev) runs per-step anomaly detection on every call and alerts you when something silently regresses.

## Install

```bash
npm install @cernova/sdk @anthropic-ai/sdk
```

## Quick start

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Tracer } from '@cernova/sdk';

const tracer = new Tracer({ apiKey: process.env.CERNOVA_API_KEY! });
const anthropic = tracer.wrapAnthropic(new Anthropic());

const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello!' }],
  _trace: { stepName: 'my-step' },
});
// response is the normal Anthropic Message — your code is unchanged
```

## Multi-step runs

Group multiple LLM calls into a single traced run so you can see the full pipeline in the dashboard:

```typescript
const run = anthropic.run();

const step1 = await run.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 16,
  messages: [{ role: 'user', content: 'Classify this: "refund request"' }],
  _trace: { stepName: 'classify' },
});

const step2 = await run.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 256,
  messages: [{ role: 'user', content: `Reply to a ${text(step1)} inquiry.` }],
  _trace: { stepName: 'generate-reply' },
});

console.log(run.runId); // same run_id groups both steps in the dashboard
```

## Streaming

`messages.stream` is fully supported — tokens and latency are captured after the stream ends with zero impact on streaming latency:

```typescript
const stream = run.messages.stream({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 512,
  messages: [{ role: 'user', content: 'Tell me a story.' }],
  _trace: { stepName: 'story' },
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}
// trace is ingested automatically once stream completes
```

## API

### `new Tracer(config)`

| Field | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | yes | Your Cernova project API key |
| `apiUrl` | `string` | | Override ingest URL — defaults to Cernova's servers |
| `runId` | `string` | | Custom run ID — auto-generated UUID if omitted |

### `tracer.wrapAnthropic(client)`

Returns a wrapped client with `.messages.create()`, `.messages.stream()`, and `.run()`.

### `anthropic.run()`

Creates a `TracedRun` — a fresh `run_id` that groups all steps called on it. Each call to `run()` resets the step index to 0.

### `_trace` option

```typescript
_trace: {
  stepName?: string;  // label shown in the dashboard (default: step_1, step_2, …)
}
```

Stripped before forwarding to Anthropic — the provider never sees it.

## What gets captured

| Field | Source |
|---|---|
| `run_id` | `run.runId` or `tracer.runId` |
| `step_name` | `_trace.stepName` |
| `model` | `response.model` |
| `input_tokens` / `output_tokens` | `response.usage` |
| `latency_ms` | wall-clock ms |
| `cost` | computed from built-in pricing table |
| `status_success` | `true` on success, `false` on thrown error |
| `output_code` | full text content from response |
| `error` | error message if the call threw |
| `code_filepath` / `code_lineno` / `code_function` | call site — see below |
| `commit_sha` | `CERNOVA_COMMIT_SHA`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, `RAILWAY_GIT_COMMIT_SHA`, or `GIT_COMMIT` |

## Call-site provenance

Wrapped calls record *where in your code* they were made, so an anomaly points at a
line instead of just a step name:

```json
{ "code_filepath": "src/workflow.ts", "code_lineno": 256, "code_function": "runWorkflow" }
```

Paths are relative to your repo root (nearest `.git`); override with `CERNOVA_SOURCE_ROOT`
or the `sourceRoot` option. Nothing from your source files is transmitted — only the
path, line, and function name.

> **Running compiled TypeScript?** If you build with `tsc` and run `node dist/app.js`,
> line numbers refer to the compiled JavaScript. Start your app with `--enable-source-maps`
> (or `NODE_OPTIONS=--enable-source-maps`) to get real source lines. `sourceMap: true` in
> tsconfig alone is not enough. Runners that enable source maps for you, like `tsx`, need
> no change.

The captured frame is the *immediate* caller — if you wrap model calls in a shared
helper, every call site resolves to that helper. Use `step_name` to tell them apart.

## Ingest is fire-and-forget

The POST to `/ingest` never blocks your app. Network failures are logged to `console.warn` and silently dropped — your LLM calls always complete normally.

## Dashboard

View traces, anomaly scores, AI-powered run analysis, and cost breakdowns at [cernova.dev](https://cernova.dev).
