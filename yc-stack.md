# YC — Tech stack (draft, delete later)

Python and FastAPI on Railway, Postgres and Supabase with pgvector, and Next.js on Vercel.

Our detection engine runs in four layers, learning what each step of your agent normally outputs, what it should cost, and how long it should take — and because one layer is conformal, our false-positive rate is a bound we can prove rather than a threshold we picked and hoped about. There's no LLM in the detection path, which is why we run on every call instead of sampling; the only AI models we use are a small embedding model, run locally to fingerprint each step, and Claude for the diagnosis that explains what broke and how to fix it. Data comes in through our TypeScript and Python (LangChain) SDKs or OpenTelemetry, and an MCP server lets Claude Code and Cursor pull traces and the exact call site.

We build the product with Claude Code (Claude Opus) and Cursor.
