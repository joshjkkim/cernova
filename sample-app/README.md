# Sample App Documentation

## What this app does

This sample app demonstrates end-to-end tracing for Anthropic message calls using the Trace AI SDK.

It starts a local ingest server at http://localhost:8000/ingest, sends real Claude requests through a traced Anthropic client, and prints each trace event as it arrives.

The demo includes:
- A successful intent-classification call
- A successful summarization call
- An intentionally failing call (invalid model) to show error tracing

## How it works

1. Loads environment variables from .env.local and .env.
2. Starts an HTTP server that accepts POST /ingest and logs trace payload fields such as:
   - step_name
   - run_id
   - model
   - token usage
   - latency
   - cost
   - status and error
3. Builds a Tracer instance configured to send traces to http://localhost:8000.
4. Wraps a real Anthropic SDK client with tracer.wrapAnthropic(...).
5. Executes three client.messages.create calls with per-step trace metadata.
6. Waits briefly for fire-and-forget ingest requests, then closes the server.

## Prerequisites

- Node.js 18+
- npm
- A valid Anthropic API key

## Setup

From the sample-app directory:

npm install

Create a .env.local file with:

ANTHROPIC_API_KEY=your_api_key_here

## Run the demo

npm run demo

You should see:
- A startup line for the mock ingest endpoint
- Step progress logs [1/3], [2/3], [3/3]
- One or more TRACE RECEIVED blocks with metrics
- A final "Done. Closing server." line

## Notes on behavior

- The app sends real model requests to Anthropic.
- The third step is expected to fail and is caught intentionally.
- Even failures should produce trace entries (status/error visible in server logs).
- Trace API key is set to a demo value in this app because traces are ingested locally.

## Troubleshooting

If you see "Missing ANTHROPIC_API_KEY. Set it and re-run the demo.":
- Ensure .env.local exists in sample-app.
- Ensure the key name is exactly ANTHROPIC_API_KEY.
- Re-run npm run demo from the sample-app directory.

If requests fail with authentication errors:
- Confirm your Anthropic key is valid and active.

If no trace blocks appear:
- Check that the demo starts the local server without port conflicts on 8000.
- Confirm calls are reaching the wrapped client path in demo.ts.
