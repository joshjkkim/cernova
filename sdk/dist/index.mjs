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
  "claude-3-opus-20240229": { inputPer1M: 15, outputPer1M: 75, contextWindow: 2e5 },
  // OpenAI
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10, contextWindow: 128e3 },
  "gpt-4o-2024-11-20": { inputPer1M: 2.5, outputPer1M: 10, contextWindow: 128e3 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6, contextWindow: 128e3 },
  "gpt-4o-mini-2024-07-18": { inputPer1M: 0.15, outputPer1M: 0.6, contextWindow: 128e3 },
  "gpt-4-turbo": { inputPer1M: 10, outputPer1M: 30, contextWindow: 128e3 },
  "gpt-4-turbo-2024-04-09": { inputPer1M: 10, outputPer1M: 30, contextWindow: 128e3 },
  "gpt-4": { inputPer1M: 30, outputPer1M: 60, contextWindow: 8192 },
  "gpt-3.5-turbo": { inputPer1M: 0.5, outputPer1M: 1.5, contextWindow: 16385 },
  "o1": { inputPer1M: 15, outputPer1M: 60, contextWindow: 2e5 },
  "o1-mini": { inputPer1M: 1.1, outputPer1M: 4.4, contextWindow: 128e3 },
  "o3-mini": { inputPer1M: 1.1, outputPer1M: 4.4, contextWindow: 2e5 }
};
function getCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return inputTokens / 1e6 * pricing.inputPer1M + outputTokens / 1e6 * pricing.outputPer1M;
}

// src/context.ts
import { AsyncLocalStorage } from "async_hooks";
var spanStorage = new AsyncLocalStorage();
function getActiveSpanId() {
  return spanStorage.getStore()?.spanId ?? null;
}
function runWithSpan(spanId, fn) {
  return spanStorage.run({ spanId }, fn);
}

// src/callsite.ts
import { existsSync } from "fs";
import { findSourceMap } from "module";
import { dirname, join, resolve, relative, isAbsolute } from "path";
import { fileURLToPath } from "url";
var SDK_FILE = (() => {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (_e, frames2) => frames2;
  const holder = {};
  Error.captureStackTrace(holder);
  const frames = holder.stack;
  Error.prepareStackTrace = orig;
  return normalizeFile(frames?.[0]?.getFileName() ?? "");
})();
function normalizeFile(file) {
  return file.startsWith("file:") ? fileURLToPath(file) : file;
}
function isSdkFrame(file) {
  return file === SDK_FILE || file.includes("/node_modules/");
}
function findUp(markers, start) {
  let dir = resolve(start);
  for (; ; ) {
    for (const m of markers) if (existsSync(join(dir, m))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function resolveSourceRoot(explicit) {
  if (explicit) return { root: resolve(explicit), how: "config.sourceRoot" };
  const env = process.env.CERNOVA_SOURCE_ROOT;
  if (env) return { root: resolve(env), how: "env CERNOVA_SOURCE_ROOT" };
  const git = findUp([".git"], process.cwd());
  if (git) return { root: git, how: "nearest .git" };
  const pkg = findUp(["package.json", "pyproject.toml", "go.mod"], process.cwd());
  if (pkg) return { root: pkg, how: "nearest package marker" };
  return { root: process.cwd(), how: "process.cwd() fallback" };
}
function toRepoRelative(absFile, root) {
  const rel = relative(root, absFile);
  return !rel.startsWith("..") && !isAbsolute(rel) ? rel : absFile;
}
function applySourceMap(rawFile, pos) {
  let map;
  try {
    map = findSourceMap(rawFile) ?? findSourceMap(pos.file);
  } catch {
    return pos;
  }
  if (!map) return pos;
  const entry = map.findEntry(pos.line - 1, pos.column - 1);
  if (!entry || !("originalSource" in entry) || entry.originalSource === void 0) return pos;
  return {
    file: normalizeFile(entry.originalSource),
    line: entry.originalLine + 1,
    column: entry.originalColumn + 1
  };
}
function captureCallSite(sourceRoot) {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (_e, frames2) => frames2;
  const holder = {};
  Error.captureStackTrace(holder, captureCallSite);
  const frames = holder.stack ?? [];
  Error.prepareStackTrace = orig;
  for (const f of frames) {
    const raw = f.getFileName();
    if (!raw) continue;
    const file = normalizeFile(raw);
    if (isSdkFrame(file)) continue;
    const pos = applySourceMap(raw, {
      file,
      line: f.getLineNumber() ?? 0,
      column: f.getColumnNumber() ?? 0
    });
    return {
      file: toRepoRelative(pos.file, sourceRoot),
      line: pos.line,
      column: pos.column,
      function: f.getFunctionName() ?? f.getMethodName() ?? "<anonymous>"
    };
  }
  return null;
}
function detectCommitSha() {
  return process.env.CERNOVA_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || void 0;
}
function callSiteFields(site, commitSha) {
  return {
    code_filepath: site?.file,
    code_lineno: site?.line,
    code_function: site?.function,
    commit_sha: commitSha
  };
}
var CALLSITE_DEBUG = !!process.env.CERNOVA_CALLSITE_DEBUG;
function maybeLogCallSite(site, stepName) {
  if (!CALLSITE_DEBUG) return;
  if (site) {
    console.log(`[cernova] ${stepName} @ ${site.file}:${site.line}:${site.column} (${site.function})`);
  } else {
    console.log(`[cernova] ${stepName} @ <no user frame resolved>`);
  }
}

// src/uuid.ts
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}

// src/run.ts
function extractOutputCode(response) {
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return text.length > 0 ? text : void 0;
}
var TracedRun = class {
  constructor(client, tracer) {
    this.client = client;
    this.tracer = tracer;
    this.stepIndex = 0;
    this.runId = uuid();
    this.messages = {
      create: (params) => this._create(params),
      stream: (params) => this._stream(params)
    };
  }
  async _create(params) {
    const { _trace, ...cleanParams } = params;
    const currentStep = this.stepIndex++;
    const stepName = _trace?.stepName ?? `step_${currentStep + 1}`;
    const spanId = uuid();
    const parentSpanId = getActiveSpanId();
    const callSite = captureCallSite(this.tracer.sourceRoot);
    maybeLogCallSite(callSite, stepName);
    const prov = callSiteFields(callSite, this.tracer.commitSha);
    const start = Date.now();
    try {
      const response = await runWithSpan(
        spanId,
        () => this.client.messages.create(cleanParams)
      );
      const latency_ms = Date.now() - start;
      const input_tokens = response.usage?.input_tokens ?? 0;
      const output_tokens = response.usage?.output_tokens ?? 0;
      const total_tokens = input_tokens + output_tokens;
      const model = response.model ?? cleanParams.model;
      this.tracer.ingest({
        ...prov,
        run_id: this.runId,
        step_name: stepName,
        step_index: currentStep,
        model,
        prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
        input_tokens,
        output_tokens,
        total_tokens,
        latency_ms,
        cost: getCost(model, input_tokens, output_tokens),
        status_success: true,
        output_code: extractOutputCode(response),
        span_id: spanId,
        parent_span_id: parentSpanId ?? void 0
      });
      return response;
    } catch (err) {
      const latency_ms = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.tracer.ingest({
        ...prov,
        run_id: this.runId,
        step_name: stepName,
        step_index: currentStep,
        model: cleanParams.model,
        prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        latency_ms,
        cost: 0,
        status_success: false,
        error: message,
        span_id: spanId,
        parent_span_id: parentSpanId ?? void 0
      });
      throw err;
    }
  }
  _stream(params) {
    const { _trace, ...cleanParams } = params;
    const currentStep = this.stepIndex++;
    const stepName = _trace?.stepName ?? `step_${currentStep + 1}`;
    const spanId = uuid();
    const parentSpanId = getActiveSpanId();
    const callSite = captureCallSite(this.tracer.sourceRoot);
    maybeLogCallSite(callSite, stepName);
    const prov = callSiteFields(callSite, this.tracer.commitSha);
    const start = Date.now();
    if (!this.client.messages.stream) {
      throw new Error("[cernova] This Anthropic client does not support streaming.");
    }
    const messageStream = this.client.messages.stream(cleanParams);
    messageStream.finalMessage().then((response) => {
      const latency_ms = Date.now() - start;
      const input_tokens = response.usage?.input_tokens ?? 0;
      const output_tokens = response.usage?.output_tokens ?? 0;
      const total_tokens = input_tokens + output_tokens;
      const model = response.model ?? cleanParams.model;
      this.tracer.ingest({
        ...prov,
        run_id: this.runId,
        step_name: stepName,
        step_index: currentStep,
        model,
        prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
        input_tokens,
        output_tokens,
        total_tokens,
        latency_ms,
        cost: getCost(model, input_tokens, output_tokens),
        status_success: true,
        output_code: extractOutputCode(response),
        span_id: spanId,
        parent_span_id: parentSpanId ?? void 0
      });
    }).catch((err) => {
      const latency_ms = Date.now() - start;
      this.tracer.ingest({
        ...prov,
        run_id: this.runId,
        step_name: stepName,
        step_index: currentStep,
        model: cleanParams.model,
        prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        latency_ms,
        cost: 0,
        status_success: false,
        error: err instanceof Error ? err.message : String(err),
        span_id: spanId,
        parent_span_id: parentSpanId ?? void 0
      });
    });
    return messageStream;
  }
};

// src/wrappers/anthropic.ts
function extractOutputCode2(response) {
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return text.length > 0 ? text : void 0;
}
function wrapAnthropic(client, tracer) {
  let stepIndex = 0;
  return {
    messages: {
      async create(params) {
        const { _trace, ...cleanParams } = params;
        const currentStep = stepIndex++;
        const stepName = _trace?.stepName ?? `step_${currentStep + 1}`;
        const spanId = uuid();
        const parentSpanId = getActiveSpanId();
        const callSite = captureCallSite(tracer.sourceRoot);
        maybeLogCallSite(callSite, stepName);
        const prov = callSiteFields(callSite, tracer.commitSha);
        const start = Date.now();
        try {
          const response = await runWithSpan(
            spanId,
            () => client.messages.create(cleanParams)
          );
          const latency_ms = Date.now() - start;
          const input_tokens = response.usage?.input_tokens ?? 0;
          const output_tokens = response.usage?.output_tokens ?? 0;
          const total_tokens = input_tokens + output_tokens;
          const model = response.model ?? cleanParams.model;
          tracer.ingest({
            ...prov,
            run_id: tracer.runId,
            step_name: stepName,
            step_index: currentStep,
            model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens,
            output_tokens,
            total_tokens,
            latency_ms,
            cost: getCost(model, input_tokens, output_tokens),
            status_success: true,
            output_code: extractOutputCode2(response),
            span_id: spanId,
            parent_span_id: parentSpanId ?? void 0
          });
          return response;
        } catch (err) {
          const latency_ms = Date.now() - start;
          const message = err instanceof Error ? err.message : String(err);
          tracer.ingest({
            ...prov,
            run_id: tracer.runId,
            step_name: stepName,
            step_index: currentStep,
            model: cleanParams.model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            latency_ms,
            cost: 0,
            status_success: false,
            error: message,
            span_id: spanId,
            parent_span_id: parentSpanId ?? void 0
          });
          throw err;
        }
      },
      stream(params) {
        const { _trace, ...cleanParams } = params;
        const currentStep = stepIndex++;
        const stepName = _trace?.stepName ?? `step_${currentStep + 1}`;
        const spanId = uuid();
        const parentSpanId = getActiveSpanId();
        const callSite = captureCallSite(tracer.sourceRoot);
        maybeLogCallSite(callSite, stepName);
        const prov = callSiteFields(callSite, tracer.commitSha);
        const start = Date.now();
        if (!client.messages.stream) {
          throw new Error("[cernova] This Anthropic client does not support streaming.");
        }
        const messageStream = client.messages.stream(cleanParams);
        messageStream.finalMessage().then((response) => {
          const latency_ms = Date.now() - start;
          const input_tokens = response.usage?.input_tokens ?? 0;
          const output_tokens = response.usage?.output_tokens ?? 0;
          const total_tokens = input_tokens + output_tokens;
          const model = response.model ?? cleanParams.model;
          tracer.ingest({
            ...prov,
            run_id: tracer.runId,
            step_name: stepName,
            step_index: currentStep,
            model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens,
            output_tokens,
            total_tokens,
            latency_ms,
            cost: getCost(model, input_tokens, output_tokens),
            status_success: true,
            output_code: extractOutputCode2(response),
            span_id: spanId,
            parent_span_id: parentSpanId ?? void 0
          });
        }).catch((err) => {
          const latency_ms = Date.now() - start;
          tracer.ingest({
            ...prov,
            run_id: tracer.runId,
            step_name: stepName,
            step_index: currentStep,
            model: cleanParams.model,
            prompt: JSON.stringify({ system: cleanParams.system, messages: cleanParams.messages }),
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            latency_ms,
            cost: 0,
            status_success: false,
            error: err instanceof Error ? err.message : String(err),
            span_id: spanId,
            parent_span_id: parentSpanId ?? void 0
          });
        });
        return messageStream;
      }
    },
    run() {
      return new TracedRun(client, tracer);
    }
  };
}

// src/wrappers/openai.ts
function extractSystemAndMessages(messages) {
  const system = messages.find((m) => m.role === "system")?.content ?? void 0;
  return { system: system ?? void 0, messages };
}
function extractOutputCode3(response) {
  const text = response.choices[0]?.message?.content;
  return text && text.length > 0 ? text : void 0;
}
function wrapOpenAI(client, tracer) {
  let stepIndex = 0;
  return {
    chat: {
      completions: {
        async create(params) {
          const { _trace, ...cleanParams } = params;
          const currentStep = stepIndex++;
          const stepName = _trace?.stepName ?? `step_${currentStep + 1}`;
          const spanId = uuid();
          const parentSpanId = getActiveSpanId();
          const callSite = captureCallSite(tracer.sourceRoot);
          maybeLogCallSite(callSite, stepName);
          const prov = callSiteFields(callSite, tracer.commitSha);
          const start = Date.now();
          const { system, messages } = extractSystemAndMessages(params.messages);
          try {
            const response = await runWithSpan(
              spanId,
              () => client.chat.completions.create(cleanParams)
            );
            const latency_ms = Date.now() - start;
            const input_tokens = response.usage?.prompt_tokens ?? 0;
            const output_tokens = response.usage?.completion_tokens ?? 0;
            const total_tokens = response.usage?.total_tokens ?? input_tokens + output_tokens;
            const model = response.model ?? cleanParams.model;
            tracer.ingest({
              ...prov,
              run_id: tracer.runId,
              step_name: stepName,
              step_index: currentStep,
              model,
              prompt: JSON.stringify({ system, messages }),
              input_tokens,
              output_tokens,
              total_tokens,
              latency_ms,
              cost: getCost(model, input_tokens, output_tokens),
              status_success: true,
              output_code: extractOutputCode3(response),
              span_id: spanId,
              parent_span_id: parentSpanId ?? void 0
            });
            return response;
          } catch (err) {
            const latency_ms = Date.now() - start;
            const message = err instanceof Error ? err.message : String(err);
            tracer.ingest({
              ...prov,
              run_id: tracer.runId,
              step_name: stepName,
              step_index: currentStep,
              model: cleanParams.model,
              prompt: JSON.stringify({ system, messages }),
              input_tokens: 0,
              output_tokens: 0,
              total_tokens: 0,
              latency_ms,
              cost: 0,
              status_success: false,
              error: message,
              span_id: spanId,
              parent_span_id: parentSpanId ?? void 0
            });
            throw err;
          }
        }
      }
    }
  };
}

// src/tracer.ts
var DEFAULT_API_URL = "https://trace-production-940c.up.railway.app";
var SCHEMA_VERSION = 1;
var Tracer = class {
  constructor(config) {
    this.apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.runId = config.runId ?? uuid();
    this.commitSha = config.commitSha ?? detectCommitSha();
    const resolved = resolveSourceRoot(config.sourceRoot);
    this.sourceRoot = resolved.root;
    if (process.env.CERNOVA_CALLSITE_DEBUG) {
      console.log(`[cernova] sourceRoot = ${resolved.root} (via ${resolved.how})`);
    }
  }
  ingest(payload) {
    return fetch(`${this.apiUrl}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ schema_version: SCHEMA_VERSION, ...payload })
    }).then((res) => res.ok ? res.json() : Promise.reject(res.status)).then((data) => data.trace_id ?? null).catch((err) => {
      console.warn("[cernova] ingest failed:", err);
      return null;
    });
  }
  wrapAnthropic(client) {
    return wrapAnthropic(client, this);
  }
  wrapOpenAI(client) {
    return wrapOpenAI(client, this);
  }
};
export {
  TracedRun,
  Tracer,
  captureCallSite,
  getCost,
  resolveSourceRoot
};
//# sourceMappingURL=index.mjs.map