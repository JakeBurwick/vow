// Runs the py / ts / vow refs of the CSV arena on every visible and hidden
// check in csv.js. Usage: node bench/turf/verify-csv.mjs [taskId] [-v]
import { CSV_TASKS } from './csv.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', '..', 'cli.js');
const verbose = process.argv.includes('-v');
const only = process.argv.slice(2).find(a => !a.startsWith('-'));
const RUN = {
  py: f => ['python3', [f]],
  ts: f => ['deno', ['run', '-q', f]],
  vow: f => ['node', [cli, f]],
};
let bad = 0;
for (const t of CSV_TASKS) {
  if (only && t.id !== only) continue;
  for (const [lang, mk] of Object.entries(RUN)) {
    const file = join(here, 'refs', `${t.id}.${lang}`);
    if (!existsSync(file)) { console.log(`${t.id} ${lang}: MISSING`); bad++; continue; }
    const all = [...t.checks.map(c => ({ ...c, trap: 'visible' })), ...t.hidden];
    const fails = [];
    for (const c of all) {
      const [cmd, args] = mk(file);
      const r = spawnSync(cmd, args, { input: Buffer.from(c.stdin, 'utf8') });
      const got = r.stdout.toString('utf8').replace(/\n$/, '');
      if (got !== c.expect) fails.push({ trap: c.trap, got, want: c.expect, err: r.stderr.toString().slice(0, 300) });
    }
    console.log(`${t.id} ${lang}: ${all.length - fails.length}/${all.length}`);
    for (const f of fails) {
      console.log(`  FAIL [${f.trap}] got ${JSON.stringify(f.got)} want ${JSON.stringify(f.want)}`);
      if (verbose && f.err) console.log('   ', f.err);
    }
    bad += fails.length;
  }
}
process.exitCode = bad ? 1 : 0;
