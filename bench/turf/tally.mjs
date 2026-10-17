#!/usr/bin/env node
// Tally home-turf runs: judge submissions from the log (tags turf-tf<N><a><lang>) and the hidden-suite
// score of each final solution in bench/scratch/tf<N><a><lang>-<task>.<ext>.
//   node bench/turf/tally.mjs [--json]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = dirname(fileURLToPath(import.meta.url)), bench = join(here, '..');
const log = readFileSync(join(bench, 'log', 'attempts.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(e => /^turf-tf\d+[jc](vow|ts|py)$/.test(e.tag ?? ''));
const runs = {};
for (const f of readdirSync(join(bench, 'scratch'))) {
  const m = /^tf(\d+)([jc])(vow|ts|py)-([a-z-]+)\.(vow|ts|py)$/.exec(f);
  if (!m) continue;
  const [, n, a, lang, task] = m, tag = `turf-tf${n}${a}${lang}`;
  const subs = log.filter(e => e.tag === tag && e.task === task);
  const r = spawnSync('node', [join(here, 'score.mjs'), task, join(bench, 'scratch', f)], { encoding: 'utf8', timeout: 600000 });
  const s = JSON.parse(r.stdout.trim().split('\n').pop());
  (runs[lang] ??= []).push({ run: n, task, submissions: subs.length, judgePass: subs.some(e => e.ok), firstTry: subs.length > 0 && subs[0].ok, hidden: s.hidden, hiddenPassed: s.passed, missed: s.failed.map(x => x.trap) });
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(runs, null, 1)); process.exit(0); }
for (const [lang, rs] of Object.entries(runs)) {
  const tot = rs.reduce((a, r) => a + r.hidden, 0), ok = rs.reduce((a, r) => a + r.hiddenPassed, 0);
  const clean = rs.filter(r => r.judgePass && r.hiddenPassed === r.hidden).length;
  console.log(`${lang.padEnd(4)} solutions ${rs.length}  judge-passed ${rs.filter(r => r.judgePass).length}  first-try ${rs.filter(r => r.firstTry).length}  hidden ${ok}/${tot} (${(100 * ok / tot).toFixed(1)}%)  fully-correct ${clean}  silent-wrong ${rs.filter(r => r.judgePass && r.hiddenPassed < r.hidden).length}`);
  for (const r of rs.sort((a, b) => a.task.localeCompare(b.task) || a.run - b.run))
    console.log(`  r${r.run} ${r.task.padEnd(15)} subs ${r.submissions} ${r.judgePass ? 'PASS' : 'FAIL'}  hidden ${r.hiddenPassed}/${r.hidden}${r.missed.length ? '  missed: ' + r.missed.join('; ') : ''}`);
}
