#!/usr/bin/env node
/**
 * Cernova MCP server — exposes the Read API to a coding agent over stdio.
 *
 * Thin 1:1 mapping onto backend/routers/read.py: one tool per endpoint, no
 * composite "investigate" flow. The agent composes them itself, which keeps the
 * surface predictable and verifiable against the HTTP API.
 *
 * The payoff over plain curl is call-site provenance: calls carry code_filepath,
 * code_lineno, code_function and commit_sha, so an agent with the repo checked
 * out can go from "this step is anomalous" to the exact source line.
 *
 * STDIO PROTOCOL NOTE: stdout is the MCP transport. Anything written there that
 * is not a protocol frame corrupts the session — all diagnostics go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { CernovaClient, ReadApiError } from './client.js';

const DEFAULT_API_URL = 'https://trace-production-940c.up.railway.app';

const apiKey = process.env.CERNOVA_API_KEY;
if (!apiKey) {
  console.error(
    'cernova-mcp: CERNOVA_API_KEY is not set.\n' +
      'Add it to the server\'s env block, e.g.\n' +
      '  claude mcp add cernova --env CERNOVA_API_KEY=sk-... -- npx -y @cernova/mcp',
  );
  process.exit(1);
}

const client = new CernovaClient(process.env.CERNOVA_API_URL ?? DEFAULT_API_URL, apiKey);

const server = new McpServer({ name: 'cernova', version: '0.1.0' });

/** Renders a payload as pretty JSON; turns API failures into a readable tool error. */
async function respond(work: () => Promise<unknown>) {
  try {
    const data = await work();
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const msg = err instanceof ReadApiError ? err.message : `Unexpected error: ${(err as Error).message}`;
    return { content: [{ type: 'text' as const, text: msg }], isError: true };
  }
}

server.registerTool(
  'list_anomalies',
  {
    title: 'List detected anomalies',
    description:
      'Anomalies detected in this project\'s LLM pipeline, grouped by run, newest first. ' +
      'Each run carries a total_score, a level ("critical" or "warning"), and the per-step ' +
      'condition codes that fired. Each code carries evidence: `expected` is the rule that ' +
      'was violated and `observed` is the actual value, so you can see how far off it was. ' +
      'Start here, then call get_run with a run_id to see the calls and their source locations.',
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional().describe('Max runs to return (default 50).'),
      cursor: z.string().optional().describe('next_cursor from a previous page.'),
      since: z.string().optional().describe('ISO 8601 timestamp — only anomalies at or after this time.'),
      level: z.enum(['critical', 'warning']).optional(),
      step_name: z.string().optional().describe('Only anomalies for this pipeline step.'),
    },
  },
  async (args) => respond(() => client.listAnomalies(args)),
);

server.registerTool(
  'get_run',
  {
    title: 'Get one run in full',
    description:
      'One run: every LLM call in it (in step order), its anomaly summary, and cost/token/latency ' +
      'totals. Calls include call-site provenance — code_filepath, code_lineno, code_function and ' +
      'commit_sha — identifying where in the source the call was made. Use those to open the ' +
      'offending code. Provenance is null for OTel imports and SDKs older than 0.1.6.',
    inputSchema: {
      run_id: z.string().describe('The run to fetch, e.g. from list_anomalies.'),
    },
  },
  async ({ run_id }) => respond(() => client.getRun(run_id)),
);

server.registerTool(
  'list_calls',
  {
    title: 'List traced LLM calls',
    description:
      'Individual scored LLM calls, newest first, with tokens, latency, cost, status and call-site ' +
      'provenance. Filter by step, run, model, status, or anomalous=true. Use this to compare a ' +
      'failing call against normal ones for the same step.',
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional().describe('Max calls to return (default 50).'),
      cursor: z.string().optional().describe('next_cursor from a previous page.'),
      since: z.string().optional().describe('ISO 8601 timestamp — only calls at or after this time.'),
      step_name: z.string().optional(),
      run_id: z.string().optional(),
      model: z.string().optional(),
      status: z.enum(['success', 'error']).optional(),
      anomalous: z.boolean().optional().describe('true = only calls that triggered an anomaly.'),
    },
  },
  async (args) => respond(() => client.listCalls(args)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('cernova-mcp: ready on stdio');
