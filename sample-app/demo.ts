import http from 'node:http';
import { Tracer } from '@trace-ai/sdk';
import Anthropic from '@anthropic-ai/sdk';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

// ── Mock ingest server ──────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/ingest') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const p = JSON.parse(body) as Record<string, unknown>;
      const divider = '─'.repeat(52);
      console.log(`\n┌ ${divider}`);
      console.log(`│  TRACE RECEIVED`);
      console.log(`├ ${divider}`);
      console.log(`│  step       ${p.step_name}`);
      console.log(`│  run_id     ${p.run_id}`);
      console.log(`│  model      ${p.model}`);
      console.log(`│  tokens     ${p.input_tokens} in / ${p.output_tokens} out  (total ${p.total_tokens})`);
      console.log(`│  latency    ${p.latency_ms}ms`);
      console.log(`│  cost       $${Number(p.cost_usd).toFixed(6)}`);
      if (p.context_utilization !== undefined) {
        const pct = (Number(p.context_utilization) * 100).toFixed(1);
        console.log(`│  ctx used   ${pct}%`);
      }
      console.log(`│  status     ${p.status}${p.error ? ` — ${p.error}` : ''}`);
      console.log(`└ ${divider}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// ── Demo ────────────────────────────────────────────────────────────────────

server.listen(8000, async () => {
  console.log('Mock ingest server   →  http://localhost:8000/ingest');
  console.log('Firing demo Anthropic calls...\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY. Set it and re-run the demo.');
    server.close();
    return;
  }

  const tracer = new Tracer({
    apiKey: 'demo-key',
    apiUrl: 'http://localhost:8000',
  });

  const client = tracer.wrapAnthropic(
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as any,
  );

  // Step 1 — simple Q&A
  console.log('[1/3] classify-intent ...');
  await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [{ role: 'user', content: 'Is "I need help with my bill" a billing or support issue? Reply in one word.' }],
    _trace: { stepName: 'classify-intent' },
  } as any);

  // Step 2 — slightly heavier summarisation
  console.log('[2/3] summarise-article ...');
  await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{
      role: 'user',
      content: 'Summarise in two sentences: The quick brown fox jumps over the lazy dog. ' +
               'This sentence contains every letter of the English alphabet at least once. ' +
               'It has been used since the 19th century to test typewriters and printers.',
    }],
    _trace: { stepName: 'summarise-article' },
  } as any);

  // Step 3 — trigger a deliberate error (bad model name) so we see error tracing
  console.log('[3/3] bad-model-call (expect error trace) ...');
  try {
    await client.messages.create({
      model: 'claude-does-not-exist',
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Hello' }],
      _trace: { stepName: 'bad-model-call' },
    } as any);
  } catch {
    // error is expected — trace-ai will have already logged it
  }

  // Give the fire-and-forget ingest POSTs time to land before closing
  await new Promise((r) => setTimeout(r, 500));
  console.log('\nDone. Closing server.');
  server.close();
});
