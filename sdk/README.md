# @trace-ai/sdk

TypeScript SDK that wraps Anthropic's `messages.create`, captures tokens/latency/cost, and fire-and-forgets a trace payload to the trace.ai backend.

## Install

```bash
npm install @trace-ai/sdk @anthropic-ai/sdk
```

## Quick start

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { Tracer } from '@trace-ai/sdk';

const tracer = new Tracer({ apiKey: process.env.TRACE_API_KEY! });
const anthropic = tracer.wrapAnthropic(new Anthropic());

const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 256,
  messages: [{ role: 'user', content: 'Hello!' }],
  _trace: { stepName: 'my-step' },  // optional label
});
// response is the normal Anthropic Message — nothing changes for your code
```

## API

### `new Tracer(config)`

| Field | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | yes | Your trace.ai project API key |
| `runId` | `string` | | Groups steps into one workflow run. Auto-UUID if omitted |
| `projectId` | `number` | | Associate traces with a project |
| `apiUrl` | `string` | | Override ingest URL — local dev only |

### `tracer.wrapAnthropic(client)`

Returns a wrapped client with the same `messages.create` signature plus `_trace`.

### `_trace` option

```typescript
_trace: {
  stepName?: string;   // label for this step (default: 'anthropic.messages.create')
  projectId?: number;  // overrides tracer-level projectId for this call
}
```

Stripped before the request is forwarded to Anthropic — the provider never sees it.

### `getCost(model, inputTokens, outputTokens)`

Returns USD cost using the SDK's internal pricing table. Returns `0` for unknown models.

```typescript
import { getCost } from '@trace-ai/sdk';
getCost('claude-haiku-4-5-20251001', 500, 120); // → 0.000088
```

## What gets traced

| Field | Source |
|---|---|
| `run_id` | `tracer.runId` |
| `step_name` | `_trace.stepName` |
| `model` | `response.model` |
| `prompt` | `JSON.stringify({ system, messages })` |
| `input_tokens` / `output_tokens` / `total_tokens` | `response.usage` |
| `latency_ms` | wall-clock ms |
| `cost` | computed from pricing table |
| `status_success` | `true` on success, `false` on error |
| `output_code` | text content from response |
| `error` | error message if call threw |

On error: trace is sent with `status_success: false`, all token fields `0`, then the original exception is re-thrown.

## Ingest is fire-and-forget

The POST to `/ingest` never blocks your app. Network errors are logged to `console.warn` and silently dropped.

## Building (SDK contributors)

```bash
cd sdk
npm install
npm run build      # compile src/ → dist/
npm run dev        # watch mode
npm run typecheck  # tsc --noEmit
```
