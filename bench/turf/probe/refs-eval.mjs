// False-alarm check for the bad-input probe: give each Vow reference (correct on every happy
// check, loud on every bad one) test blocks for its ticket's visible examples, run `vow test`,
// and list what the probe flags. Every flag on a reference is a false alarm, or a corruption
// the set's README dropped as defensible.
//   node bench/turf/probe/refs-eval.mjs [bad bad2 bad3 ...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sets = process.argv.slice(2).length ? process.argv.slice(2) : ['bad', 'bad2', 'bad3'];
const dir = join(tmpdir(), 'vow-probe-refs');
mkdirSync(dir, { recursive: true });
const q = (s) => JSON.stringify(s);
for (const set of sets) {
  const { BAD_TASKS } = await import(`../${set}/tasks.js`);
  for (const t of BAD_TASKS) {
    const src = readFileSync(new URL(`../${set}/refs/${t.id}.vow`, import.meta.url), 'utf8');
    const tests = t.checks.map((c, i) => `test "visible ${i + 1}" {\n  expectEq(run([${c.args.map(q).join(', ')}], ${q(c.stdin ?? '')}), ${q(c.expect + '\n')})\n}`).join('\n\n');
    const f = join(dir, `${set}-${t.id}.vow`);
    writeFileSync(f, src + '\n\n' + tests + '\n');
    let out;
    try { out = execFileSync(process.execPath, ['cli.js', 'test', f], { encoding: 'utf8' }); }
    catch (e) { out = e.stdout + e.stderr; }
    const lines = out.split('\n').filter(l => /^\d+ tests?|probe|•/.test(l));
    console.log(`== ${set}/${t.id}\n${lines.map(l => '  ' + l.trim()).join('\n')}`);
  }
}
