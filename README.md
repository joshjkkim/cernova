# Cernova

The detection layer for LLM pipelines. Cernova watches every step of your AI workflow against its own statistical baseline and tells you when something silently regresses — a prompt change, a model update, cost or latency drift, broken output — before your users notice.

Observability tools log what happened and wait for you to look. Cernova is active: per-step anomaly detection (log-space IQR fences scoped to each step's semantic fingerprint), trend detection, and AI root-cause analysis — with alerts delivered into the tools your team already watches. It complements your existing stack; it doesn't replace it.

## Repo layout

| Directory | What it is |
|---|---|
| `sdk/` | TypeScript SDK (`@cernova/sdk`, published on npm) |
| `python-sdk/` | Python SDK (`cernova`, published on PyPI) |
| `backend/` | FastAPI ingest API + anomaly detection + Supabase |
| `frontend/` | Next.js live dashboard (Supabase Realtime) |
| `sample-app/` | Demo chatbots: `chatbot.ts` (TypeScript) and `chatbot.py` (Python) |

---

## Quickstart

### TypeScript

```bash
npm install @cernova/sdk
```

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Tracer } from "@cernova/sdk";

const tracer = new Tracer({ apiKey: process.env.CERNOVA_API_KEY! });
const anthropic = tracer.wrapAnthropic(new Anthropic());

const response = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 256,
  messages: [{ role: "user", content: "Hello!" }],
  _trace: { stepName: "my-step" },
});
```

### TypeScript (OpenAI)

```ts
import OpenAI from "openai";
import { Tracer } from "@cernova/sdk";

const tracer = new Tracer({ apiKey: process.env.CERNOVA_API_KEY! });
const openai = tracer.wrapOpenAI(new OpenAI());

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
  _trace: { stepName: "my-step" },
});
```

### Python (LangChain)

```bash
pip install cernova[langchain]
```

```python
from cernova import Tracer
from cernova.langchain import CernovaCallbackHandler
from langchain_anthropic import ChatAnthropic

tracer  = Tracer(api_key="...")
handler = CernovaCallbackHandler(tracer)

llm = ChatAnthropic(model="claude-haiku-4-5-20251001", callbacks=[handler])
llm.invoke("Hello!")
```

See [`sdk/README.md`](sdk/README.md) and [`python-sdk/README.md`](python-sdk/README.md) for full docs.

---

## Works with your stack

Traces in from what you already run, alerts out to where you already look.

| Integration | Direction | Status |
|---|---|---|
| Anthropic SDK (TypeScript) | traces in | ✅ live |
| OpenAI SDK (TypeScript) | traces in | ✅ live |
| LangChain (Python — Anthropic, OpenAI, Gemini, any provider) | traces in | ✅ live |
| Manual ingest (any model, TS + Python) | traces in | ✅ live |
| OpenTelemetry GenAI ingest (OTLP `/v1/traces`, JSON + protobuf) | traces in | ✅ live |
| Vercel AI SDK telemetry (via OTLP) | traces in | ✅ live |
| Slack | alerts out | ✅ live |
| Sentry (performance transactions + anomaly issues) | alerts out | ✅ live |
| Langfuse import (warm-start baselines from existing traces) | traces in | ✅ live |
| LangSmith import (warm-start baselines from existing traces) | traces in | ✅ live |
| Generic outbound webhooks (signed events) | alerts out | ✅ live |
| Read API (`/v1` — pull scored traces & anomalies, paginated) | data out | ✅ live |

---

## How it works

```
Your app
  └─ @cernova/sdk  or  CernovaCallbackHandler
       ├─ calls the LLM normally → response returned unchanged
       └─ fire-and-forget POST /ingest → FastAPI backend
                                           ├─ fingerprinter (step identity)
                                           ├─ anomaly detector (4 layers)
                                           └─ Supabase INSERT
                                                   └─ Realtime → dashboard
```

Every LLM call is intercepted, wall-clock latency is measured, tokens and cost are extracted, and a trace payload is sent to `/ingest` without blocking the caller.

---

## Anomaly detection

Each ingest runs through 4 detection layers:

| Layer | What it checks |
|---|---|
| Hard failures | Status failures, errors, token-accounting mismatches |
| Output format | Prompt-implied contracts: JSON / enum / yes-no violations |
| Numeric thresholds | Latency / token / cost limits + cross-field plausibility |
| Statistical baseline | Per-step IQR fence (log space) on latency, tokens, cost |

The statistical layer uses a **Tukey fence in log space** — multiplicative detection that handles LLM data's right-skewed distribution correctly. Baselines are scoped per **step profile** (semantic fingerprint of the system prompt), not per project.

---

## Local dev

Prerequisites: Node.js 18+, Python 3.11+, Supabase project.

```bash
# Install all dependencies
npm install
cd backend && python3 -m venv .venv && .venv/bin/pip install -r ../requirements.txt

# Copy and fill in env files
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
cp sample-app/.env.local.example sample-app/.env.local

# Run everything (sdk:watch + backend + frontend in parallel)
npm run dev
```

### Python demo chatbot

```bash
cd sample-app
python3 -m venv .venv && source .venv/bin/activate
pip install langchain-anthropic python-dotenv cernova[langchain]
python3 chatbot.py   # runs on :3002
```

---

## Deployment

- **Backend**: Railway (`https://trace-production-940c.up.railway.app`)
- **Frontend**: Vercel (`https://cernova.dev`)
- **Database**: Supabase (Postgres + pgvector + Realtime)
