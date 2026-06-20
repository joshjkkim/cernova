# @trace-ai/sdk

TypeScript SDK that wraps your Anthropic (Claude) client, captures tokens, latency, and cost per call, and POSTs traces to your ingest endpoint.

## Install (local dev)

```bash
cd sdk
npm install
npm run build
```

## Usage

```ts
import Anthropic from '@anthropic-ai/sdk';
import { Tracer } from '@trace-ai/sdk';

const tracer = new Tracer({
  apiKey: process.env.TRACE_API_KEY!,
  apiUrl: process.env.INGEST_URL ?? 'http://localhost:8000', // local dev
});

const anthropic = tracer.wrapAnthropic(
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
);

// Use the wrapped client exactly like the normal Anthropic client.
// Each call is traced and POSTed to `${apiUrl}/ingest`.
const res = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a palindrome checker in Python.' }],
});

console.log(res);
```

## Scripts

- `npm run build` — bundle to `dist/` with tsup (ESM, CJS, and `.d.ts`)
- `npm run dev` — rebuild on change
- `npm run typecheck` — `tsc --noEmit`
