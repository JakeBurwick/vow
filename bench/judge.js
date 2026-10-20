// Shared judging logic for the sandbox (run.js) and repair mode (repair.js).
import { parse } from '../lang/parser.js';
import { check } from '../lang/checker.js';
import { createRun } from '../lang/interp.js';
import { formatDiag, VowError } from '../lang/diagnostics.js';
import { readFileSync, appendFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

async function runCheckVow(src, chk) {
  const lines = [];
  // scripted standard input (chk.stdin): readLine/readAll behave like the CLI's, over this text
  let inBuf = chk.stdin ?? '';
  try {
    const ast = parse(src);
    check(src, ast);
    const { gen } = createRun(src, ast, {
      out: (s) => lines.push(s),
      err: () => {}, // eprint: stderr, not compared (same as Python/TypeScript runs)
      builtins: {
        args: () => (chk.args ?? []).slice(),
        // web tasks: instead of opening a port, replay the check's scripted requests through
        // the handler and print one "STATUS BODY" line per request (Location for redirects)
        serve: async ([port, handler], node, ctx) => {
          for (const rq of chk.requests ?? []) {
            const req = new Map([['method', rq.method ?? 'GET'], ['path', rq.path ?? '/'], ['query', rq.query ?? ''], ['body', rq.body ?? ''], ['authorization', rq.authorization ?? '']]);
            const r = await ctx.invoke(handler, [req]);
            lines.push(`${r.status} ${r.location ? '-> ' + r.location : r.body}`);
          }
          return { tag: 'ok', val: true };
        },
        readLine: () => {
          if (inBuf === '') return { tag: 'err', val: 'end of input' };
          const nl = inBuf.indexOf('\n');
          let line = nl >= 0 ? inBuf.slice(0, nl) : inBuf;
          inBuf = nl >= 0 ? inBuf.slice(nl + 1) : '';
          if (line.endsWith('\r')) line = line.slice(0, -1);
          return { tag: 'ok', val: line };
        },
        readAll: () => { const t = inBuf; inBuf = ''; return { tag: 'ok', val: t }; },
        env: ([name]) => (chk.env ?? {})[name] != null ? { tag: 'ok', val: chk.env[name] } : { tag: 'err', val: `environment variable "${name}" is not set` },
      },
    });
    let r = gen.next();
    while (!r.done) r = (r.value && r.value.await) ? gen.next(await r.value.await) : gen.next();
    return { got: lines.join('\n') };
  } catch (e) {
    if (e?.vowExit) return e.exitCode === 0 ? { got: lines.join('\n') } : { got: lines.join('\n'), diag: e.exitMessage ?? `exit code ${e.exitCode}` };
    if (e instanceof VowError) return { got: lines.join('\n'), diag: formatDiag(src, e.diag) };
    throw e;
  }
}

function runCheckPy(file, chk) {
  // TypeScript runs under Deno with only the env access a check needs (the sandbox comparison)
  const [bin, pre] = file.endsWith('.ts') ? ['deno', ['run', '--no-prompt', '--allow-env', '-q']] : ['python3', []];
  const r = spawnSync(bin, [...pre, file, ...(chk.args ?? [])], { encoding: 'utf8', timeout: 10000, ...(chk.stdin !== undefined ? { input: chk.stdin } : {}), env: { PATH: process.env.PATH, ...(chk.env ?? {}) } });
  if (r.error) return { got: '', diag: r.error.code === 'ETIMEDOUT' ? 'timed out after 10s' : String(r.error) };
  const got = (r.stdout ?? '').replace(/\n+$/, '');
  if (r.status !== 0) return { got, diag: (r.stderr || `exit code ${r.status}`).trim() };
  return { got };
}

// A multi-file submission is a folder holding main.vow or main.ts plus the modules it imports.
export const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
function dirMain(dir) {
  const files = readdirSync(dir);
  const main = files.includes('main.vow') ? 'main.vow' : files.includes('main.ts') ? 'main.ts' : null;
  const ext = main === 'main.vow' ? '.vow' : '.ts';
  return { main: main && join(dir, main), count: main ? files.filter(f => f.endsWith(ext)).length : 0 };
}
export function langOf(file) {
  if (isDir(file)) { const { main } = dirMain(file); return main ? langOf(main) : 'vow'; }
  return file.endsWith('.py') ? 'python' : file.endsWith('.ts') ? 'ts' : 'vow';
}
// the real CLI, so imports resolve exactly as they do for a user
function runCheckVowCli(file, chk) {
  const r = spawnSync('node', [join(here, '..', 'cli.js'), file, ...(chk.args ?? [])], { encoding: 'utf8', timeout: 20000, input: chk.stdin ?? '', env: { PATH: process.env.PATH, ...(chk.env ?? {}) } });
  if (r.error) return { got: '', diag: r.error.code === 'ETIMEDOUT' ? 'timed out after 20s' : String(r.error) };
  const got = (r.stdout ?? '').replace(/\n+$/, '');
  if (r.status !== 0) return { got, diag: (r.stderr || `exit code ${r.status}`).trim() };
  return { got };
}

export async function judgeFile(task, file) {
  if (task.minFiles) {
    if (!isDir(file)) return [{ args: [], kind: 'diagnostic', detail: `task ${task.id} takes a folder (main.vow or main.ts plus at least ${task.minFiles - 1} modules it imports), not a single file` }];
    const { main, count } = dirMain(file);
    if (!main) return [{ args: [], kind: 'diagnostic', detail: `no main.vow or main.ts in ${basename(file)}` }];
    if (count < task.minFiles) return [{ args: [], kind: 'diagnostic', detail: `the program must be split into at least ${task.minFiles} source files; ${basename(file)} has ${count}` }];
    file = main;
  }
  const multi = !!task.minFiles;
  const isPy = langOf(file) !== 'vow'; // python and ts both run as external processes
  const src = isPy ? null : readFileSync(file, 'utf8');
  if (isPy && task.vowOnly) throw new Error(`task ${task.id} is Vow-only (it tests serve())`);
  const fails = [];
  for (const chk of task.checks) {
    const res = isPy ? runCheckPy(file, chk) : multi ? runCheckVowCli(file, chk) : await runCheckVow(src, chk);
    const args = chk.args ?? chk.requests ?? (chk.stdin !== undefined ? { stdin: chk.stdin } : undefined);
    if (res.diag) { fails.push({ args, kind: 'diagnostic', detail: res.diag }); continue; }
    if (chk.expect !== undefined && res.got !== chk.expect) fails.push({ args, kind: 'wrong-output', got: res.got, want: chk.expect });
    const missing = (chk.expectContains ?? []).filter(x => !res.got.includes(x));
    const present = (chk.expectAbsent ?? []).filter(x => res.got.includes(x));
    if (missing.length || present.length) fails.push({ args, kind: 'wrong-output', got: res.got,
      want: [...missing.map(x => `output containing: ${x}`), ...present.map(x => `output NOT containing: ${x}`)].join('\n') });
  }
  return fails;
}

// The first line of the first diagnostic (e.g. "✗ TypeError: can't add num and str"), or
// the first wrong output, so the log says WHAT tripped an agent, not just that something did.
export function firstError(fails) {
  const f = fails[0];
  if (!f) return undefined;
  if (f.kind === 'diagnostic') return String(f.detail).split('\n')[0].slice(0, 200);
  return `wrong output for ${JSON.stringify(f.args).slice(0, 80)}`;
}

export function logAttempt(entry) {
  mkdirSync(join(here, 'log'), { recursive: true });
  const tag = process.env.VOW_BENCH_TAG;
  appendFileSync(join(here, 'log', 'attempts.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...(tag ? { tag } : {}), ...entry }) + '\n');
}

export function reportFails(fails, total) {
  console.log(`FAIL — ${fails.length} of ${total} checks`);
  for (const f of fails) {
    console.log(`\n--- args: ${JSON.stringify(f.args)}`);
    if (f.kind === 'diagnostic') console.log(f.detail);
    else console.log(`expected:\n${f.want}\ngot:\n${f.got}`);
  }
}
