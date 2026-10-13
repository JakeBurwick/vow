// Shared judging logic for the sandbox (run.js) and repair mode (repair.js).
import { parse } from '../lang/parser.js';
import { check } from '../lang/checker.js';
import { createRun } from '../lang/interp.js';
import { formatDiag, VowError } from '../lang/diagnostics.js';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
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

export function langOf(file) {
  return file.endsWith('.py') ? 'python' : file.endsWith('.ts') ? 'ts' : 'vow';
}

export async function judgeFile(task, file) {
  const isPy = langOf(file) !== 'vow'; // python and ts both run as external processes
  const src = isPy ? null : readFileSync(file, 'utf8');
  if (isPy && task.vowOnly) throw new Error(`task ${task.id} is Vow-only (it tests serve())`);
  const fails = [];
  for (const chk of task.checks) {
    const res = isPy ? runCheckPy(file, chk) : await runCheckVow(src, chk);
    const args = chk.args ?? chk.requests;
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
