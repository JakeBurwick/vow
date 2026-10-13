#!/usr/bin/env node
// Vow MCP server: lets any MCP-capable agent write Vow with the compiler in the loop.
// Transport: stdio, newline-delimited JSON-RPC 2.0. Zero dependencies.
//
//   claude mcp add vow -- node /path/to/vow-lang/mcp/server.js
//
// Tools: vow_guide (the language guide), vow_check (type-check + contract proofs,
// no execution), vow_run (sandboxed run: no fs/net/env, 10s and 5M-step limits),
// vow_test (the program's test blocks, same sandbox).
// Imports: pass `path` (the absolute path the code is saved at) and imports load from disk
// relative to it; without a path, an import gets a clear "needs a path" message.
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { check } from '../lang/checker.js';
import { VowError, formatDiag } from '../lang/diagnostics.js';
import { loadCode } from './server-load.js';
import { isAbsolute } from 'node:path';

const GUIDE = readFileSync(new URL('../bench/VOW_GUIDE.md', import.meta.url), 'utf8');
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const MAX_CODE = 200_000;

const TOOLS = [
  {
    name: 'vow_guide',
    description: 'Return the Vow language guide. Read this before writing any Vow code: Vow has no nulls or exceptions, every Result must be handled, and only "${expr}" interpolates in a string (plain braces are text).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'vow_check',
    description: 'Type-check a Vow program without running it. Returns "ok" (plus how many contract obligations were proven statically) or one diagnostic written as a repair prompt: what is wrong, where, and the likely fix.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Full Vow source code.' },
        path: { type: 'string', description: 'Optional absolute path of the file this code is saved as (e.g. /home/me/app/main.vow). Needed only for programs that import other .vow files: imports are read from disk relative to it. Without it, import is an error.' },
      },
      required: ['code'], additionalProperties: false,
    },
  },
  {
    name: 'vow_run',
    description: 'Type-check and run a Vow program in a sandbox (no filesystem, network, or environment access; 10 s and 5,000,000-step limits). Returns printed output, or the output so far plus a diagnostic if it fails.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Full Vow source code.' },
        args: { type: 'array', items: { type: 'string' }, description: 'Values returned by args() inside the program.' },
        seed: { type: 'integer', description: 'Optional: makes random() and randomInt() reproducible.' },
        path: { type: 'string', description: 'Optional absolute path of the file this code is saved as (e.g. /home/me/app/main.vow). Needed only for programs that import other .vow files: imports are read from disk relative to it. Without it, import is an error.' },
      },
      required: ['code'], additionalProperties: false,
    },
  },
  {
    name: 'vow_test',
    description: 'Run the test blocks (test "name" { ... }) of a Vow program in the vow_run sandbox. Prints one line per test and a summary; a failing test shows the expected and actual values and the line. Write one test per example and per error line of a spec, then fix the program until every test passes.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Full Vow source code, including its test blocks.' },
        filter: { type: 'string', description: 'Optional: only run the tests whose name contains this text.' },
        seed: { type: 'integer', description: 'Optional: makes random() and randomInt() reproducible.' },
        path: { type: 'string', description: 'Optional absolute path of the file this code is saved as (e.g. /home/me/app/main.vow). Needed only for programs that import other .vow files: imports are read from disk relative to it. Without it, import is an error.' },
      },
      required: ['code'], additionalProperties: false,
    },
  },
];

const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });

function badInput(code, path) {
  if (typeof code !== 'string') return 'code must be a string';
  if (code.length > MAX_CODE) return `code is too long (${code.length} chars, max ${MAX_CODE})`;
  if (path !== undefined && (typeof path !== 'string' || !isAbsolute(path) || !path.endsWith('.vow'))) return 'path must be an absolute path ending in .vow';
  return null;
}


async function toolCheck({ code, path }) {
  const bad = badInput(code, path);
  if (bad) return text(bad, true);
  let src = code;
  try {
    const loaded = await loadCode(code, path);
    src = loaded.src;
    const { proved } = check(src, loaded.ast);
    const nudge = loaded.ast.stmts.some(st => st.t === 'Test') ? ''
      : '\nNo tests yet: add a `test "name" { expectEq(run(["arg"], ""), "expected output\\n") }` block for each example and each error line in your spec, then call vow_test.';
    return text(`ok: type-checks${proved ? ` (${proved} contract obligation${proved === 1 ? '' : 's'} proven safe statically)` : ''}${nudge}`);
  } catch (e) {
    if (e instanceof VowError) return text(formatDiag(src, e.diag), true);
    return text(`internal error: ${e.message}`, true);
  }
}

// mode "run": the program with args. mode "test": its test blocks (filter narrows them);
// the report is the tool's text, isError when a test fails or nothing ran.
function toolRun({ code, args = [], path, seed, filter }, mode = 'run') {
  const bad = badInput(code, path) ?? (Array.isArray(args) && args.every(a => typeof a === 'string') ? null : 'args must be an array of strings')
    ?? (seed === undefined || Number.isInteger(seed) ? null : 'seed must be a whole number')
    ?? (filter === undefined || typeof filter === 'string' ? null : 'filter must be a string');
  if (bad) return Promise.resolve(text(bad, true));
  return new Promise((resolve) => {
    const w = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { code, args, path, seed, mode, filter: filter || undefined },
      resourceLimits: { stackSizeMb: 256, maxOldGenerationSizeMb: 256 },
    });
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); w.terminate(); resolve(r); } };
    const timer = setTimeout(() => finish(text(`✗ RuntimeError: the ${mode === 'test' ? 'tests' : 'program'} ran longer than 10 seconds and ${mode === 'test' ? 'were' : 'was'} stopped\n  Likely fix: check for an infinite loop.`, true)), 10_000);
    w.on('message', (m) => {
      if (m.report !== undefined) finish(text((m.output ? m.output + '\n\n' : '') + m.report, !m.ok));
      else if (m.ok) finish(text((m.output || '(no output)') + (m.truncated ? '\n… output truncated' : '')));
      else finish(text((m.output ? m.output + '\n\n' : '') + m.error, true));
    });
    w.on('error', (e) => finish(text(`internal error: ${e.message}`, true)));
  });
}

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'vow', version: VERSION },
        instructions: 'Vow is a language built for AI agents. Call vow_guide once, write the program, then iterate with vow_run (or vow_check): every error message names the fix. Before shipping a program written from a spec, add test blocks (one per example and per error line of the spec) and run vow_test until every test passes.',
      };
    case 'ping': return {};
    case 'tools/list': return { tools: TOOLS };
    case 'tools/call': {
      const name = params?.name, a = params?.arguments ?? {};
      if (name === 'vow_guide') return text(GUIDE);
      if (name === 'vow_check') return await toolCheck(a);
      if (name === 'vow_run') return await toolRun(a);
      if (name === 'vow_test') return await toolRun(a, 'test');
      throw { code: -32602, message: `unknown tool: ${name}` };
    }
    default:
      if (id === undefined) return undefined; // notification (e.g. notifications/initialized)
      throw { code: -32601, message: `method not found: ${method}` };
  }
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  try {
    const result = await handle(msg);
    if (msg.id !== undefined && result !== undefined) send({ jsonrpc: '2.0', id: msg.id, result });
  } catch (e) {
    if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code ?? -32603, message: e.message ?? String(e) } });
  }
});
