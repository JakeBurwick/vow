#!/usr/bin/env node
// Vow training sandbox / benchmark harness.
//
//   node bench/run.js --list               list tasks
//   node bench/run.js <task> --spec        print the task prompt (give this to the agent)
//   node bench/run.js <task> <file>        judge a candidate solution (.vow or .py)
//
// Every attempt is appended to bench/log/attempts.jsonl (the repair-loop record).
// Passing solutions are copied into bench/corpus/<task>/ — a growing corpus of
// verified Vow programs (few-shot material / future training data).

import { TASKS } from './tasks.js';
import { judgeFile, logAttempt, reportFails, langOf, firstError } from './judge.js';
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [taskId, arg2] = process.argv.slice(2);

if (!taskId || taskId === '--list') {
  for (const t of TASKS) console.log(`${t.id.padEnd(15)} ${t.name} (${t.checks.length} checks)`);
  process.exit(0);
}

const task = TASKS.find((t) => t.id === taskId);
if (!task) { console.error(`unknown task "${taskId}" — try --list`); process.exit(2); }

if (arg2 === '--spec' || !arg2) {
  console.log(task.spec);
  process.exit(0);
}

const lang = langOf(arg2);
const fails = await judgeFile(task, arg2);
// keep every failed attempt's source so we can see exactly what tripped the agent
let failedCopy;
if (fails.length) {
  const fdir = join(here, 'log', 'failed', task.id);
  mkdirSync(fdir, { recursive: true });
  failedCopy = join('failed', task.id, `${Date.now()}${lang === 'python' ? '.py' : lang === 'ts' ? '.ts' : '.vow'}`);
  copyFileSync(arg2, join(here, 'log', failedCopy));
}
logAttempt({ mode: 'scratch', task: task.id, lang, ok: fails.length === 0, failKinds: fails.map((f) => f.kind), firstError: firstError(fails), ...(failedCopy ? { failedCopy } : {}) });

if (fails.length === 0) {
  const dest = join(here, 'corpus', task.id);
  mkdirSync(dest, { recursive: true });
  copyFileSync(arg2, join(dest, `${Date.now()}${lang === 'python' ? '.py' : lang === 'ts' ? '.ts' : '.vow'}`));
  console.log(`PASS — all ${task.checks.length} checks. Solution saved to corpus/${task.id}/`);
  process.exit(0);
}

reportFails(fails, task.checks.length);
process.exit(1);
