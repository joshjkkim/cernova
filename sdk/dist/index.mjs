// src/cost.ts
var PRICING = {
  // Anthropic
  "claude-opus-4-8": { inputPer1M: 15, outputPer1M: 75, contextWindow: 2e5 },
  "claude-opus-4-8-20251101": { inputPer1M: 15, outputPer1M: 75, contextWindow: 2e5 },
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15, contextWindow: 2e5 },
  "claude-sonnet-4-6-20251001": { inputPer1M: 3, outputPer1M: 15, contextWindow: 2e5 },
  "claude-haiku-4-5": { inputPer1M: 0.8, outputPer1M: 4, contextWindow: 2e5 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.8, outputPer1M: 4, contextWindow: 2e5 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3, outputPer1M: 15, contextWindow: 2e5 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4, contextWindow: 2e5 },
  "claude-3-opus-20240229": { inputPer1M: 15, outputPer1M: 75, contextWindow: 2e5 }
};
function getCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return inputTokens / 1e6 * pricing.inputPer1M + outputTokens / 1e6 * pricing.outputPer1M;
}

// src/wrappers/anthropic.ts
function extractOutputCode(response) {
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return text.length > 0 ? text : void 0;
}
function wrapAnthropic(client, tracer) {
  return {
    messages: {
      async create(params) {
        const { _trace, ...cleanParams } = params;
        const stepName = _trace?.stepName ?? "anthropic.messages.create";
        const projectId = _trace?.projectId ?? tracer.projectId;
        const start = Date.now();
        try {
          const response = await client.messages.create(
            cleanParams
          );
          const latency_ms = Date.now() - start;
          const input_tokens = response.usage?.input_tokens ?? 0;
          const output_tokens = response.usage?.output_tokens ?? 0;
          const total_tokens = input_tokens + output_tokens;
          const model = response.model ?? cleanParams.model;
          tracer.ingest({
            run_id: tracer.runId,
            step_name: stepName,
            model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens,
            output_tokens,
            total_tokens,
            latency_ms,
            cost: getCost(model, input_tokens, output_tokens),
            status_success: true,
            output_code: extractOutputCode(response),
            project_id: projectId
          });
          return response;
        } catch (err) {
          const latency_ms = Date.now() - start;
          const message = err instanceof Error ? err.message : String(err);
          tracer.ingest({
            run_id: tracer.runId,
            step_name: stepName,
            model: cleanParams.model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            latency_ms,
            cost: 0,
            status_success: false,
            project_id: projectId,
            error: message
          });
          throw err;
        }
      }
    }
  };
}

// src/tracer.ts
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}
var DEFAULT_API_URL = "https://ingest.trace-ai.com";
var Tracer = class {
  constructor(config) {
    this.apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.runId = config.runId ?? uuid();
    this.projectId = config.projectId;
  }
  ingest(payload) {
    fetch(`${this.apiUrl}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload)
    }).catch((err) => console.warn("[trace-ai] ingest failed:", err));
  }
  wrapAnthropic(client) {
    return wrapAnthropic(client, this);
  }
};
export {
  Tracer,
  getCost
};
//# sourceMappingURL=index.mjs.map