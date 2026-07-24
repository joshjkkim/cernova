#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// src/client.ts
var ReadApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "ReadApiError";
  }
  status;
};
var CernovaClient = class {
  constructor(apiUrl, apiKey2) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey2;
  }
  apiUrl;
  apiKey;
  async get(path, params = {}) {
    const url = new URL(path, this.apiUrl.endsWith("/") ? this.apiUrl : this.apiUrl + "/");
    for (const [k, v] of Object.entries(params)) {
      if (v !== void 0 && v !== null) url.searchParams.set(k, String(v));
    }
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    } catch (cause) {
      throw new ReadApiError(0, `Could not reach Cernova at ${url.origin} \u2014 ${cause.message}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const hint = res.status === 401 ? " (check CERNOVA_API_KEY)" : res.status === 404 ? "" : ` \u2014 ${body.slice(0, 200)}`;
      throw new ReadApiError(res.status, `Read API returned ${res.status}${hint}`);
    }
    return res.json();
  }
  listAnomalies(p) {
    return this.get("v1/anomalies", p);
  }
  listCalls(p) {
    return this.get("v1/calls", p);
  }
  getRun(runId) {
    return this.get(`v1/runs/${encodeURIComponent(runId)}`);
  }
};

// src/index.ts
var DEFAULT_API_URL = "https://trace-production-940c.up.railway.app";
var apiKey = process.env.CERNOVA_API_KEY;
if (!apiKey) {
  console.error(
    "cernova-mcp: CERNOVA_API_KEY is not set.\nAdd it to the server's env block, e.g.\n  claude mcp add cernova --env CERNOVA_API_KEY=sk-... -- npx -y @cernova/mcp"
  );
  process.exit(1);
}
var client = new CernovaClient(process.env.CERNOVA_API_URL ?? DEFAULT_API_URL, apiKey);
var server = new McpServer({ name: "cernova", version: "0.1.0" });
async function respond(work) {
  try {
    const data = await work();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const msg = err instanceof ReadApiError ? err.message : `Unexpected error: ${err.message}`;
    return { content: [{ type: "text", text: msg }], isError: true };
  }
}
server.registerTool(
  "list_anomalies",
  {
    title: "List detected anomalies",
    description: 'Anomalies detected in this project\'s LLM pipeline, grouped by run, newest first. Each run carries a total_score, a level ("critical" or "warning"), and the per-step condition codes that fired. Each code carries evidence: `expected` is the rule that was violated and `observed` is the actual value, so you can see how far off it was. Start here, then call get_run with a run_id to see the calls and their source locations.',
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional().describe("Max runs to return (default 50)."),
      cursor: z.string().optional().describe("next_cursor from a previous page."),
      since: z.string().optional().describe("ISO 8601 timestamp \u2014 only anomalies at or after this time."),
      level: z.enum(["critical", "warning"]).optional(),
      step_name: z.string().optional().describe("Only anomalies for this pipeline step.")
    }
  },
  async (args) => respond(() => client.listAnomalies(args))
);
server.registerTool(
  "get_run",
  {
    title: "Get one run in full",
    description: "One run: every LLM call in it (in step order), its anomaly summary, and cost/token/latency totals. Calls include call-site provenance \u2014 code_filepath, code_lineno, code_function and commit_sha \u2014 identifying where in the source the call was made. Use those to open the offending code. Provenance is null for OTel imports and SDKs older than 0.1.6.",
    inputSchema: {
      run_id: z.string().describe("The run to fetch, e.g. from list_anomalies.")
    }
  },
  async ({ run_id }) => respond(() => client.getRun(run_id))
);
server.registerTool(
  "list_calls",
  {
    title: "List traced LLM calls",
    description: "Individual scored LLM calls, newest first, with tokens, latency, cost, status and call-site provenance. Filter by step, run, model, status, or anomalous=true. Use this to compare a failing call against normal ones for the same step.",
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional().describe("Max calls to return (default 50)."),
      cursor: z.string().optional().describe("next_cursor from a previous page."),
      since: z.string().optional().describe("ISO 8601 timestamp \u2014 only calls at or after this time."),
      step_name: z.string().optional(),
      run_id: z.string().optional(),
      model: z.string().optional(),
      status: z.enum(["success", "error"]).optional(),
      anomalous: z.boolean().optional().describe("true = only calls that triggered an anomaly.")
    }
  },
  async (args) => respond(() => client.listCalls(args))
);
var transport = new StdioServerTransport();
await server.connect(transport);
console.error("cernova-mcp: ready on stdio");
