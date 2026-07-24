// Proof: drive the REAL built @cernova/sdk bundle and watch call-site capture
// print live. Stub Anthropic client — no API key, no network, no spend. Mirrors
// the chatbot's classify → extract → generate workflow, plus a nested helper,
// a TracedRun, an arrow callback, and a streaming call.
//
// Run:  CERNOVA_CALLSITE_DEBUG=1 node sample-app/callsite-live.mjs

import { Tracer } from '../sdk/dist/index.mjs';
import { createServer } from 'node:http';

// Throwaway server to capture what the SDK actually POSTs to /ingest.
const received = [];
const server = createServer((req, res) => {
  let buf = '';
  req.on('data', (c) => (buf += c));
  req.on('end', () => {
    try { received.push(JSON.parse(buf)); } catch {}
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ trace_id: 'stub' }));
  });
});
await new Promise((r) => server.listen(0, r));
const PORT_INGEST = server.address().port;

// commit_sha comes from the real GIT_COMMIT env passed on the command line.

// ── Stub Anthropic client (satisfies AnthropicClientLike) ─────────────────────
const reply = (model, text) => ({
  id: 'msg_stub', type: 'message', role: 'assistant', model,
  content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 4 },
});
const stubAnthropic = {
  messages: {
    async create(params) { await new Promise((r) => setTimeout(r, 3)); return reply(params.model, 'stub'); },
    stream(params) {
      const final = reply(params.model, 'stub-stream');
      return { finalMessage: async () => final, async *[Symbol.asyncIterator]() {} };
    },
  },
};

const tracer = new Tracer({ apiKey: 'demo', apiUrl: `http://127.0.0.1:${PORT_INGEST}` });
const anthropic = tracer.wrapAnthropic(stubAnthropic);
const MODEL = 'claude-haiku-4-5-20251001';

// ── Chatbot-style workflow ────────────────────────────────────────────────────
async function classifyIntent(text) {
  return anthropic.messages.create({
    model: MODEL, max_tokens: 16, system: 'Classify the intent.',
    messages: [{ role: 'user', content: text }], _trace: { stepName: 'classify-intent' },
  });
}

async function extractContext(text) {
  return anthropic.messages.create({
    model: MODEL, max_tokens: 64, system: 'Extract order + account context.',
    messages: [{ role: 'user', content: text }], _trace: { stepName: 'extract-context' },
  });
}

// nested one level below the "step" — capture should land HERE, not on the caller
async function callGenerator(payload) {
  return anthropic.messages.create({
    model: MODEL, max_tokens: 256, system: 'Write the support reply.',
    messages: [{ role: 'user', content: payload }], _trace: { stepName: 'generate-reply' },
  });
}
async function generateReply(text) {
  return callGenerator(`context for: ${text}`);
}

async function main() {
  const msg = 'my order never arrived';

  await classifyIntent(msg);
  await extractContext(msg);
  await generateReply(msg);

  // arrow / anonymous callback
  await Promise.all(['a', 'b'].map((t) =>
    anthropic.messages.create({
      model: MODEL, max_tokens: 8, messages: [{ role: 'user', content: t }],
      _trace: { stepName: 'fanout' },
    }),
  ));

  // TracedRun path (separate wrapper implementation)
  const run = anthropic.run();
  await run.messages.create({
    model: MODEL, max_tokens: 8, messages: [{ role: 'user', content: 'run-step' }],
    _trace: { stepName: 'traced-run-step' },
  });

  // streaming path
  const stream = anthropic.messages.stream({
    model: MODEL, max_tokens: 8, messages: [{ role: 'user', content: 'stream me' }],
    _trace: { stepName: 'stream-step' },
  });
  await stream.finalMessage();
}

await main();

// Give the fire-and-forget ingests a moment to land, then show what arrived.
await new Promise((r) => setTimeout(r, 200));
console.log('\n=== payloads received on the wire (/ingest) ===');
for (const p of received.sort((a, b) => (a.step_index ?? 0) - (b.step_index ?? 0))) {
  console.log(
    `  ${(p.step_name ?? '?').padEnd(16)} code=${p.code_filepath}:${p.code_lineno} fn=${p.code_function} commit=${p.commit_sha}`,
  );
}
// Emit the real captured payloads for the DB round-trip + self-verification step.
import { writeFileSync } from 'node:fs';
const OUT = process.env.CAPTURE_OUT;
if (OUT) {
  writeFileSync(OUT, JSON.stringify(received, null, 2));
  console.log(`\nwrote ${received.length} captured payloads → ${OUT}`);
}
server.close();
