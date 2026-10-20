#!/usr/bin/env node
// Hidden-suite score for a home-turf solution (never shown to the agent).
//   node bench/turf/score.mjs <task> <file> [-v]
import { JSON_TASKS } from './json.js';
import { CSV_TASKS } from './csv.js';
import { FRESH_TASKS } from './fresh.js';
import { judgeFile } from '../judge.js';

const [id, file, flag] = process.argv.slice(2);
const task = [...JSON_TASKS, ...CSV_TASKS, ...FRESH_TASKS].find((t) => t.id === id);
if (!task || !file) { console.error('usage: score.mjs <task> <file> [-v]'); process.exit(2); }
const fails = await judgeFile({ ...task, checks: task.hidden }, file);
// stdin checks have no args to match on, so re-run them one at a time to label each failure
const labels = [];
for (const c of task.hidden) {
  const f = await judgeFile({ ...task, checks: [c] }, file);
  if (f.length) labels.push({ trap: c.trap, kind: f[0].kind, detail: flag === '-v' ? (f[0].got ?? f[0].detail) : undefined });
}
console.log(JSON.stringify({ task: id, file, hidden: task.hidden.length, passed: task.hidden.length - labels.length, failed: labels }));
