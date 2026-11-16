// Per condition: loud on format traps vs logic traps, from a set's tally lines.
//   node bench/turf/probe/split.mjs bad6 dir1 [dir2 ...]   (logic trap names listed in the set's LOGIC below)
import { execFileSync } from 'node:child_process';
const LOGIC = {
  bad6: ['run ends before it starts', 'more parts scrapped than made', 'two runs of one machine overlap', 'patient seen before arriving',
    'patient leaves before being seen', 'a doctor sees two patients at once', 'visit with a doctor not in the doctors list',
    'events on a ticket that was never opened', 'a ticket opened twice', 'a ticket closed twice', 'assigned after it was closed',
    'closed without being assigned', 'a line earlier than the line before it (closed before it was opened)'],
};
const [set, ...dirs] = process.argv.slice(2);
const { BAD_TASKS } = await import(`../${set}/tasks.js`);
const logicSet = new Set(LOGIC[set]);
const traps = BAD_TASKS.flatMap(t => t.hidden.filter(h => h.bad).map(h => ({ task: t.id, trap: h.trap })));
for (const dir of dirs) {
  const out = execFileSync(process.execPath, [`bench/turf/${set}/tally.mjs`, dir], { encoding: 'utf8' });
  const rows = {};
  for (const line of out.split('\n').filter(l => l.startsWith('  bench'))) {
    const m = line.match(/\/([a-z-]+)-d\d(vow|ts|py)\.\w+ .*?(?:silent: (.*))?$/);
    if (!m) continue;
    const [, task, lang, silent] = m;
    const sil = new Set((silent ?? '').split('; ').filter(Boolean));
    const r = rows[lang] ??= { n: 0, fl: 0, ft: 0, ll: 0, lt: 0 };
    r.n++;
    for (const t of traps.filter(t => t.task === task)) {
      const logic = logicSet.has(t.trap);
      if (logic) { r.lt++; if (!sil.has(t.trap)) r.ll++; } else { r.ft++; if (!sil.has(t.trap)) r.fl++; }
    }
  }
  for (const [lang, r] of Object.entries(rows)) {
    const p = (a, b) => `${a}/${b} (${Math.round(100 * a / b)}%)`;
    console.log(`${dir.padEnd(28)} ${lang.padEnd(4)} n=${r.n}  all ${p(r.fl + r.ll, r.ft + r.lt)}  format ${p(r.fl, r.ft)}  logic ${p(r.ll, r.lt)}`);
  }
}
