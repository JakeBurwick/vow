#!/usr/bin/env node
// Hidden-suite score for one bad-data solution (never shown to the agent).
//   node bench/turf/bad/score.mjs <task> <file> [-v]
// Happy checks: exit 0 and exact stdout. Bad checks: LOUD (exit != 0, or the output says something
// is wrong) or SILENT (anything else, including empty output with exit 0). See lib.mjs.
import { BAD_TASKS } from './tasks.js';
import { runOne, happyOk, isLoud, langOf } from './lib.mjs';

const [id, file, flag] = process.argv.slice(2);
const task = BAD_TASKS.find((t) => t.id === id);
if (!task || !file || !langOf(file)) { console.error('usage: score.mjs <task> <file.py|.ts|.vow> [-v]'); process.exit(2); }
let happyPassed = 0, happyTotal = 0, loud = 0, silent = 0;
const silentTraps = [], happyFailed = [], detail = [];
for (const c of task.hidden) {
  const res = runOne(file, c);
  if (c.bad) {
    if (isLoud(res)) loud++;
    else { silent++; silentTraps.push(c.trap); if (flag === '-v') detail.push({ trap: c.trap, stdout: res.stdout }); }
  } else {
    happyTotal++;
    if (happyOk(res, c)) happyPassed++;
    else { happyFailed.push(c.trap); if (flag === '-v') detail.push({ trap: c.trap, want: c.expect, got: res.stdout, exit: res.code }); }
  }
}
console.log(JSON.stringify({ task: id, file, happyPassed, happyTotal, loud, silent, silentTraps, happyFailed, ...(flag === '-v' ? { detail } : {}) }));
