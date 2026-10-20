#!/usr/bin/env node
// The agent-facing judge for the bad-data tasks: runs a solution on the ticket's visible checks only.
//   node bench/turf/bad3/run.mjs <task> --spec    print the ticket
//   node bench/turf/bad3/run.mjs <task> <file>    judge a solution (.py, .ts or .vow)
// Each judged attempt is appended to bench/log/attempts.jsonl (tagged with VOW_BENCH_TAG if set).
import { BAD_TASKS } from './tasks.js';
import { runOne, happyOk, langOf } from '../bad/lib.mjs';
import { logAttempt } from '../../judge.js';

const [id, arg] = process.argv.slice(2);
const task = BAD_TASKS.find((t) => t.id === id);
if (!task) { for (const t of BAD_TASKS) console.log(`${t.id.padEnd(17)} ${t.name} (${t.checks.length} checks)`); process.exit(id ? 2 : 0); }
if (arg === '--spec') { console.log(task.spec); process.exit(0); }
if (!arg || !langOf(arg)) { console.error('usage: run.mjs <task> --spec | <file.py|.ts|.vow>'); process.exit(2); }
const fails = [];
for (const c of task.checks) {
  const res = runOne(arg, c);
  if (!happyOk(res, c)) fails.push({ c, res });
}
logAttempt({ task: task.id, file: arg, lang: langOf(arg), ok: fails.length === 0, fails: fails.length, bench: 'bad3' });
if (!fails.length) { console.log(`PASS: all ${task.checks.length} checks`); process.exit(0); }
console.log(`FAIL: ${fails.length} of ${task.checks.length} checks`);
for (const { c, res } of fails) {
  console.log(`\n--- args: ${JSON.stringify(c.args)}${c.stdin !== undefined ? `  stdin: ${JSON.stringify(c.stdin)}` : ''}`);
  console.log(`expected:\n${c.expect}\ngot (exit ${res.code}):\n${res.stdout}${res.stderr.trim() ? `\nstderr:\n${res.stderr.trim()}` : ''}`);
}
process.exit(1);
