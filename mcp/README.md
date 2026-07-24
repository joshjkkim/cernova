# @cernova/mcp

MCP server exposing the Cernova Read API to a coding agent. Lets Claude Code (or
any MCP client) pull scored LLM traces and detected anomalies — and, because calls
carry call-site provenance, jump from "this step is anomalous" straight to the
source line that produced it.

## Tools

Thin 1:1 mapping onto the Read API (`backend/routers/read.py`). The agent composes
them; there is no baked-in investigation flow.

| Tool | Endpoint | Use |
| --- | --- | --- |
| `list_anomalies` | `GET /v1/anomalies` | Anomalies grouped by run, newest first. Filter by `level`, `step_name`, `since`. Start here. |
| `get_run` | `GET /v1/runs/{run_id}` | One run: every call in step order, anomaly summary, cost/token/latency totals. |
| `list_calls` | `GET /v1/calls` | Individual calls. Filter by `step_name`, `run_id`, `model`, `status`, `anomalous`. |

Calls include `code_filepath`, `code_lineno`, `code_function` and `commit_sha`.
These are `null` for OTel imports and SDKs older than 0.1.6.

## Setup

```bash
cd mcp && npm install && npm run build
```

Register with Claude Code:

```bash
claude mcp add cernova \
  --env CERNOVA_API_KEY=<your project API key> \
  -- node /absolute/path/to/mcp/dist/index.js
```

| Env var | Required | Default |
| --- | --- | --- |
| `CERNOVA_API_KEY` | yes | — same key the SDK sends traces with |
| `CERNOVA_API_URL` | no | `https://trace-production-940c.up.railway.app` |

Point `CERNOVA_API_URL` at `http://localhost:8000` to work against a local backend.

## Notes

Transport is stdio, so **stdout carries the MCP protocol** — all diagnostics go to
stderr. Anything printed to stdout will corrupt the session.

Line numbers are only as good as the source maps at capture time. A Node app
started without `--enable-source-maps` reports lines in the *compiled* JS, not the
TypeScript source — see `sdk/src/callsite.ts`.
