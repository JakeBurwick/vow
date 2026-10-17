// Runs every reference solution (refs/<id>.py|.ts|.vow) on every visible and hidden
// check of every task file in this folder (bench/turf/*.js, any exported array).
// Usage: node bench/turf/verify.mjs [taskId...]   (-v prints each mismatch's output)
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vowCli = join(here, '..', '..', 'cli.js');
const verbose = process.argv.includes('-v');
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const RUNNERS = {
  py: (f, args) => ['python3', [f, ...args]],
  ts: (f, args) => ['deno', ['run', '-q', f, ...args]],
  vow: (f, args) => ['node', [vowCli, f, ...args]],
};

function run(lang, file, args = [], stdin = '') {
  const [cmd, argv] = RUNNERS[lang](file, args);
  try {
    return execFileSync(cmd, argv, { encoding: 'utf8', input: stdin, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
  } catch (e) {
    return (e.stdout || '') + `<<exit ${e.status}: ${(e.stderr || '').trim().split('\n')[0]}>>`;
  }
}

const tasks = [];
for (const f of readdirSync(here).filter((f) => f.endsWith('.js')).sort()) {
  const mod = await import(pathToFileURL(join(here, f)).href);
  for (const v of Object.values(mod)) if (Array.isArray(v)) tasks.push(...v.filter((t) => t && t.id));
}

const totals = {};
for (const task of tasks) {
  if (only.length && !only.includes(task.id)) continue;
  const checks = [...(task.checks || []).map((c, i) => ({ ...c, label: `check ${i + 1}` })),
                  ...(task.hidden || []).map((c, i) => ({ ...c, label: `hidden ${i + 1} [${c.trap}]` }))];
  for (const lang of Object.keys(RUNNERS)) {
    const file = join(here, 'refs', `${task.id}.${lang}`);
    if (!existsSync(file)) continue;
    let pass = 0;
    const fails = [];
    for (const c of checks) {
      const got = run(lang, file, c.args || [], c.stdin ?? '').replace(/\n$/, '');
      if (got === c.expect) pass++;
      else fails.push({ c, got });
    }
    const key = `${task.id} ${lang}`;
    totals[key] = `${pass}/${checks.length}`;
    console.log(`${task.id.padEnd(16)} ${lang.padEnd(4)} ${pass}/${checks.length}${fails.length ? '  FAIL: ' + fails.map((x) => x.c.label).join(', ') : ''}`);
    if (verbose) for (const { c, got } of fails) {
      console.log(`  ${c.label}\n    args:   ${JSON.stringify(c.args || [])}${c.stdin !== undefined ? ' stdin: ' + JSON.stringify(c.stdin) : ''}\n    expect: ${JSON.stringify(c.expect)}\n    got:    ${JSON.stringify(got)}`);
    }
  }
}
