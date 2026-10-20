// Runs every reference solution (refs/<id>.py|.ts|.vow) on every visible and hidden check:
// happy checks must match the expect exactly (exit 0), bad checks must be LOUD (lib.mjs rule).
// Usage: node bench/turf/bad2/verify.mjs [taskId...]   (-v prints each mismatch)
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAD_TASKS } from './tasks.js';
import { runOne, happyOk, isLoud } from '../bad/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes('-v');
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
let problems = 0;
for (const task of BAD_TASKS) {
  if (only.length && !only.includes(task.id)) continue;
  const checks = [...task.checks.map((c, i) => ({ ...c, label: `check ${i + 1}` })),
                  ...task.hidden.map((c, i) => ({ ...c, label: `hidden ${i + 1} [${c.trap}]` }))];
  const nHappy = checks.filter((c) => !c.bad).length, nBad = checks.length - nHappy;
  for (const lang of ['py', 'ts', 'vow']) {
    const file = join(here, 'refs', `${task.id}.${lang}`);
    if (!existsSync(file)) { console.log(`${task.id.padEnd(17)} ${lang.padEnd(4)} MISSING`); problems++; continue; }
    let happy = 0, loud = 0;
    const fails = [];
    for (const c of checks) {
      const res = runOne(file, c);
      if (c.bad ? isLoud(res) : happyOk(res, c)) c.bad ? loud++ : happy++;
      else fails.push({ c, res });
    }
    problems += fails.length;
    console.log(`${task.id.padEnd(17)} ${lang.padEnd(4)} happy ${happy}/${nHappy}  loud ${loud}/${nBad}${fails.length ? '  FAIL: ' + fails.map((x) => x.c.label).join(', ') : ''}`);
    if (verbose) for (const { c, res } of fails) console.log(`  ${c.label}\n    expect: ${JSON.stringify(c.expect ?? '(loud)')}\n    got:    ${JSON.stringify(res.stdout)} exit ${res.code} ${JSON.stringify(res.stderr.slice(0, 200))}`);
  }
}
console.log(problems ? `${problems} problem(s)` : 'all refs agree on every happy check and are loud on every bad check');
process.exit(problems ? 1 : 0);
