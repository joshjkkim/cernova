/**
 * Call-site capture — records WHERE in the user's code a traced LLM call was made
 * (repo-relative file, line, column, function) so downstream agents (an MCP, a
 * GitHub PR bot) can jump straight to the source instead of grepping the repo.
 *
 * Uses V8's structured stack API (Error.prepareStackTrace + captureStackTrace),
 * which yields typed CallSite objects — no fragile string parsing. Must be called
 * SYNCHRONOUSLY at the entry of a wrapper method, before any `await`: after the
 * first await the caller's frame is gone and only an async reconstruction remains.
 */

import { existsSync } from 'node:fs';
import { findSourceMap } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CallSite {
  /** Repo-relative when a source root is resolvable, else the raw absolute path. */
  file: string;
  line: number;
  column: number;
  function: string;
}

// Absolute path of THIS module's bundled file, detected once at load. tsup bundles
// the whole SDK into one file, so every internal frame shares this path — which is
// exactly the frame set we skip to land on the user's call site. Detecting it (vs.
// import.meta.url) is format-agnostic across the esm + cjs builds.
const SDK_FILE: string = (() => {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (_e, frames) => frames as unknown as string;
  const holder: { stack?: unknown } = {};
  Error.captureStackTrace(holder);
  const frames = holder.stack as NodeJS.CallSite[] | undefined;
  Error.prepareStackTrace = orig;
  return normalizeFile(frames?.[0]?.getFileName() ?? '');
})();

// Under ESM, getFileName() returns a file:// URL; under CJS a plain path. Normalize
// to a filesystem path so frame comparison and relativization both work.
function normalizeFile(file: string): string {
  return file.startsWith('file:') ? fileURLToPath(file) : file;
}

function isSdkFrame(file: string): boolean {
  return file === SDK_FILE || file.includes('/node_modules/');
}

// ── Source root resolution ────────────────────────────────────────────────────

/** Walk up from `start` until a directory contains one of `markers`. */
function findUp(markers: string[], start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    for (const m of markers) if (existsSync(join(dir, m))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null; // hit filesystem root
    dir = parent;
  }
}

/**
 * Resolve the repo root to strip off captured paths, most-explicit-wins:
 * explicit config → env → nearest .git → nearest package marker → cwd.
 * Called ONCE at Tracer construction.
 */
export function resolveSourceRoot(explicit?: string): { root: string; how: string } {
  if (explicit) return { root: resolve(explicit), how: 'config.sourceRoot' };
  const env = process.env.CERNOVA_SOURCE_ROOT;
  if (env) return { root: resolve(env), how: 'env CERNOVA_SOURCE_ROOT' };
  const git = findUp(['.git'], process.cwd());
  if (git) return { root: git, how: 'nearest .git' };
  const pkg = findUp(['package.json', 'pyproject.toml', 'go.mod'], process.cwd());
  if (pkg) return { root: pkg, how: 'nearest package marker' };
  return { root: process.cwd(), how: 'process.cwd() fallback' };
}

/** Strip the root; keep the absolute path if the file lives outside it (`..` escape). */
export function toRepoRelative(absFile: string, root: string): string {
  const rel = relative(root, absFile);
  return !rel.startsWith('..') && !isAbsolute(rel) ? rel : absFile;
}

// ── Source-map remapping ──────────────────────────────────────────────────────

interface Position {
  file: string;
  line: number;
  column: number;
}

/**
 * A V8 CallSite always reports the GENERATED position. Node applies source maps
 * only inside its default stack formatter — which we replace to get structured
 * frames — so an unmapped line is whatever the transpiler emitted. Under tsx the
 * whole module collapses onto line 1, making the number meaningless; map it back
 * through the module's source map, which Node caches when source maps are on.
 *
 * `findEntry` takes and returns 0-based positions; CallSite is 1-based.
 */
function applySourceMap(rawFile: string, pos: Position): Position {
  let map;
  try {
    map = findSourceMap(rawFile) ?? findSourceMap(pos.file);
  } catch {
    return pos; // no source map registered for this module
  }
  if (!map) return pos;

  // findEntry returns `{}` when the generated position maps to nothing.
  const entry = map.findEntry(pos.line - 1, pos.column - 1);
  if (!entry || !('originalSource' in entry) || entry.originalSource === undefined) return pos;

  return {
    file: normalizeFile(entry.originalSource),
    line: entry.originalLine + 1,
    column: entry.originalColumn + 1,
  };
}

// ── Capture ───────────────────────────────────────────────────────────────────

/** The first stack frame outside the SDK (and node_modules), relativized to `sourceRoot`. */
export function captureCallSite(sourceRoot: string): CallSite | null {
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (_e, frames) => frames as unknown as string;
  const holder: { stack?: unknown } = {};
  Error.captureStackTrace(holder, captureCallSite); // drop captureCallSite + frames above it
  const frames = (holder.stack as NodeJS.CallSite[] | undefined) ?? [];
  Error.prepareStackTrace = orig;

  for (const f of frames) {
    const raw = f.getFileName();
    if (!raw) continue;
    const file = normalizeFile(raw);
    // Skip on the GENERATED path: SDK_FILE is itself a generated path, and a
    // bundled SDK frame would otherwise map back to sdk/src/*.ts and slip through.
    if (isSdkFrame(file)) continue;
    const pos = applySourceMap(raw, {
      file,
      line: f.getLineNumber() ?? 0,
      column: f.getColumnNumber() ?? 0,
    });
    return {
      file: toRepoRelative(pos.file, sourceRoot),
      line: pos.line,
      column: pos.column,
      function: f.getFunctionName() ?? f.getMethodName() ?? '<anonymous>',
    };
  }
  return null;
}

/**
 * The commit the running code was built from — read once at Tracer construction.
 * Without it, a line number is meaningless (line 42 of WHICH commit?), so a PR
 * agent needs this to anchor the location. Covers the common deploy platforms.
 */
export function detectCommitSha(): string | undefined {
  return (
    process.env.CERNOVA_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    undefined
  );
}

/** Provenance fields spread into the ingest payload. Omitted keys drop off the wire. */
export interface CallSiteFields {
  code_filepath?: string;
  code_lineno?: number;
  code_function?: string;
  commit_sha?: string;
}

export function callSiteFields(site: CallSite | null, commitSha?: string): CallSiteFields {
  return {
    code_filepath: site?.file,
    code_lineno: site?.line,
    code_function: site?.function,
    commit_sha: commitSha,
  };
}

// Opt-in demo logging (Step 1: prove capture before anything goes on the wire).
const CALLSITE_DEBUG = !!process.env.CERNOVA_CALLSITE_DEBUG;

/** Logs the captured site when CERNOVA_CALLSITE_DEBUG is set; no-op otherwise. */
export function maybeLogCallSite(site: CallSite | null, stepName: string): void {
  if (!CALLSITE_DEBUG) return;
  if (site) {
    console.log(`[cernova] ${stepName} @ ${site.file}:${site.line}:${site.column} (${site.function})`);
  } else {
    console.log(`[cernova] ${stepName} @ <no user frame resolved>`);
  }
}
