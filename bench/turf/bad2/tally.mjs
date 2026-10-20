#!/usr/bin/env node
// Aggregate every solution in a directory named <task>-<anything>.<py|ts|vow> into a per-language table.
//   node bench/turf/bad2/tally.mjs <dir> [--json]
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BAD_TASKS } from './tasks.js';

const here = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) { console.error('usage: tally.mjs <dir> [--json]'); process.exit(2); }
const rows = [];
for (const f of readdirSync(dir).sort()) {
  const m = /^(.+)\.(py|ts|vow)$/.exec(f);
  const task = m && BAD_TASKS.map((t) => t.id).sort((a, b) => b.length - a.length).find((id) => m[1].startsWith(id + '-'));
  if (!task) continue;
  const r = spawnSync('node', [join(here, 'score.mjs'), task, join(dir, f)], { encoding: 'utf8', timeout: 900000 });
  const s = JSON.parse(r.stdout.trim().split('\n').pop());
  rows.push({ file: f, lang: m[2], ...s });
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
console.log('lang  solutions  happy-correct  happy checks      bad checks loud   silent  never-silent');
for (const lang of ['py', 'ts', 'vow']) {
  const rs = rows.filter((r) => r.lang === lang);
  if (!rs.length) continue;
  const hp = rs.reduce((a, r) => a + r.happyPassed, 0), ht = rs.reduce((a, r) => a + r.happyTotal, 0);
  const ld = rs.reduce((a, r) => a + r.loud, 0), sl = rs.reduce((a, r) => a + r.silent, 0);
  console.log(`${lang.padEnd(5)} ${String(rs.length).padStart(9)}  ${String(rs.filter((r) => r.happyPassed === r.happyTotal).length).padStart(13)}  ${`${hp}/${ht} (${pct(hp, ht)})`.padEnd(16)}  ${`${ld}/${ld + sl} (${pct(ld, ld + sl)})`.padEnd(17)}  ${String(sl).padStart(6)}  ${String(rs.filter((r) => r.silent === 0).length).padStart(12)}`);
}
console.log('');
for (const r of rows) console.log(`  ${r.file.padEnd(28)} happy ${r.happyPassed}/${r.happyTotal}  loud ${r.loud}/${r.loud + r.silent}${r.silentTraps.length ? '  silent: ' + r.silentTraps.join('; ') : ''}${r.happyFailed.length ? '  happy fails: ' + r.happyFailed.join('; ') : ''}`);
