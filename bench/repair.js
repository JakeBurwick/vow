#!/usr/bin/env node
// Repair mode: hand an agent a broken program + the judge's output, measure
// how many attempts it takes to fix. The planted bug is identical in both
// languages — only the error messages differ.
//
//   node bench/repair.js --list                 list repair cases
//   node bench/repair.js <id> --start <vow|py>  write the broken program to
//                                               bench/scratch/repair-<id>.<ext>
//                                               and show the judge's output
//   node bench/repair.js <id> <file>            judge a repaired candidate
//
// Agent attempts are logged to bench/log/attempts.jsonl with mode:"repair".

import { TASKS } from './tasks.js';
import { REPAIRS } from './repairs.js';
import { judgeFile, logAttempt, reportFails, langOf, firstError } from './judge.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [id, arg2, arg3] = process.argv.slice(2);

if (!id || id === '--list') {
  for (const r of REPAIRS) console.log(`${r.id.padEnd(13)} (task: ${r.task})`);
  process.exit(0);
}

const rep = REPAIRS.find((r) => r.id === id);
if (!rep) { console.error(`unknown repair case "${id}" — try --list`); process.exit(2); }
const task = TASKS.find((t) => t.id === rep.task);

if (arg2 === '--start') {
  const lang = arg3 === 'py' ? 'py' : arg3 === 'vow' ? 'vow' : null;
  if (!lang) { console.error('usage: node bench/repair.js <id> --start <vow|py>'); process.exit(2); }
  mkdirSync(join(here, 'scratch'), { recursive: true });
  const file = join(here, 'scratch', `repair-${rep.id}.${lang}`);
  writeFileSync(file, lang === 'py' ? rep.py : rep.vow);
  console.log(`Broken program written to ${file}`);
  console.log(`Task spec: ${task.spec}\n`);
  console.log('Judge output for the broken program:\n');
  const fails = await judgeFile(task, file);
  if (fails.length === 0) { console.log('(unexpectedly passes — bad repair case)'); process.exit(2); }
  reportFails(fails, task.checks.length);
  process.exit(0);
}

if (!arg2) { console.error('usage: node bench/repair.js <id> <file> | <id> --start <vow|py>'); process.exit(2); }

const fails = await judgeFile(task, arg2);
logAttempt({ mode: 'repair', repair: rep.id, task: task.id, lang: langOf(arg2), ok: fails.length === 0, failKinds: fails.map((f) => f.kind), firstError: firstError(fails) });

if (fails.length === 0) {
  console.log(`PASS — all ${task.checks.length} checks. Repair complete.`);
  process.exit(0);
}
reportFails(fails, task.checks.length);
process.exit(1);
