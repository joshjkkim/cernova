// End-to-end test: SDK -> live FastAPI backend -> Postgres -> read back.
// Requires the backend running on :8000 (uvicorn main:app --app-dir backend).
//
//   npm run build && node e2e-test.mjs

import { Tracer } from './dist/index.mjs';

const API_URL = process.env.INGEST_URL ?? 'http://localhost:8000';

// Unique run id so we can find exactly this trace afterwards.
const runId = `e2e-${Date.now()}`;

const tracer = new Tracer({
  apiKey: 'test-key',
  apiUrl: API_URL,
  runId,
});

// Fake Anthropic client (no API key / no spend) — runtime only needs messages.create.
const fakeAnthropic = {
  messages: {
    create: async (params) => ({
      model: params.model,
      content: [{ type: 'text', text: 'def is_palindrome(s): return s == s[::-1]' }],
      usage: { input_tokens: 42, output_tokens: 17 },
    }),
  },
};

const anthropic = tracer.wrapAnthropic(fakeAnthropic);

await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a palindrome checker.' }],
  _trace: { stepName: 'e2e_test' },
});

// ingest() is fire-and-forget; give it a moment to reach the DB.
await new Promise((r) => setTimeout(r, 500));

// Read it back from the live backend.
const res = await fetch(`${API_URL}/traces?limit=50`);
if (!res.ok) {
  console.error(`FAIL ❌ — GET /traces returned ${res.status}`);
  process.exit(1);
}
const traces = await res.json();
const mine = traces.find((t) => t.run_id === runId);

console.log('\n--- trace read back from backend ---');
console.log(JSON.stringify(mine, null, 2));

const ok =
  mine &&
  mine.step_name === 'e2e_test' &&
  mine.model === 'claude-sonnet-4-6' &&
  mine.total_tokens === 59 &&
  mine.status === 'success';

console.log(`\n${ok ? 'PASS ✅ — trace made the full round-trip SDK -> backend -> DB -> back' : 'FAIL ❌ — trace not found / mismatched'}`);
process.exit(ok ? 0 : 1);
