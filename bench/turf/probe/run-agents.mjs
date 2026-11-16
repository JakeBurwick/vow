// Runs a bad-data set's agent rounds (--set bad4|bad5) headless: one fresh `claude -p` (Haiku) per task, language and run,
// with the exact prompts in bench/turf/<set>/PROMPT.md. Conditions:
//   vow    this repo (probe on)          -> bench/scratch/<set>/
//   vowctl the control worktree (probe off, guide without it) -> its bench/scratch/<set>/
//   vowv1  a worktree at the first probe (format corruptions only) -> its bench/scratch/<set>/
//   vowtxt a worktree with the probe text in the guide but the probe itself off -> its bench/scratch/<set>/
//   ts, py this repo                     -> bench/scratch/<set>/
//   node bench/turf/probe/run-agents.mjs --set bad5 --conds vow,vowctl,ts,py --runs 1-4 [--jobs 5]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPO = { vowctl: join(here, '..', 'vow-lang-control'), vowv1: join(here, '..', 'vow-lang-v1'), vowtxt: join(here, '..', 'vow-lang-textonly') }; // other worktrees
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const conds = arg('--conds', 'vow,vowctl,ts,py').split(',');
const [r0, r1] = arg('--runs', '1-4').split('-').map(Number);
const jobs = Number(arg('--jobs', '5'));
const model = arg('--model', 'haiku');
const SET = arg('--set', 'bad4');

const md = readFileSync(join(here, `bench/turf/${SET}/PROMPT.md`), 'utf8');
const block = (heading) => md.split(`\n## ${heading}\n`)[1].match(/```text\n([\s\S]*?)\n```/)[1];
const TPL = { vow: block('Vow'), ts: block('TypeScript'), py: block('Python') };
const { BAD_TASKS } = await import(join(here, `bench/turf/${SET}/tasks.js`));

const work = [];
for (let r = r0; r <= (r1 ?? r0); r++) for (const c of conds) for (const t of BAD_TASKS) {
  const lang = c.startsWith('vow') ? 'vow' : c;
  const repo = REPO[c] ?? here;
  const run = `d${r}`;
  const spec = execFileSync(process.execPath, [`bench/turf/${SET}/run.mjs`, t.id, '--spec'], { cwd: repo, encoding: 'utf8' }).trimEnd();
  const prompt = `Work in the repository at ${repo}: every path below is relative to it, so cd there first.\n\n` +
    TPL[lang].replaceAll('{{TASK}}', t.id).replaceAll('{{SPEC}}', spec).replaceAll('{{INPUT}}', t.input)
      .replaceAll('{{RUN}}', run).replaceAll('{{EXT}}', lang);
  const out = join(repo, `bench/scratch/${SET}/${t.id}-${run}${lang}.${lang}`);
  work.push({ c, lang, repo, run, task: t.id, prompt, out, tag: `${SET}-${run}${lang}${c === lang ? '' : '-' + c.slice(3)}` });
}

const logDir = join(here, `bench/scratch/${SET}/logs`);
mkdirSync(logDir, { recursive: true });
const one = (w) => new Promise((resolve) => {
  if (existsSync(w.out)) { console.log(`skip ${w.c} ${w.task} ${w.run} (exists)`); return resolve(); }
  const t0 = Date.now();
  const p = spawn('claude', ['-p', '--model', model, '--no-session-persistence', '--output-format', 'json',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '',
    '--allowedTools', 'Bash Read Write Edit Glob Grep', '--disallowedTools', 'WebFetch WebSearch Task Agent',
  ], { cwd: w.repo, env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1', VOW_BENCH_TAG: w.tag }, stdio: ['pipe', 'pipe', 'pipe'] });
  let so = '', se = '';
  p.stdout.on('data', d => { so += d; }); p.stderr.on('data', d => { se += d; });
  const kill = setTimeout(() => p.kill('SIGKILL'), 20 * 60_000);
  p.on('close', (code) => {
    clearTimeout(kill);
    writeFileSync(join(logDir, `${w.c}-${w.task}-${w.run}.json`), so + (se ? '\n--stderr--\n' + se : ''));
    console.log(`${new Date().toISOString().slice(11, 19)} ${w.c.padEnd(6)} ${w.task.padEnd(15)} ${w.run} exit=${code} ${Math.round((Date.now() - t0) / 1000)}s ${existsSync(w.out) ? 'saved' : 'NO FILE'}`);
    resolve();
  });
  p.stdin.end(w.prompt);
});

let next = 0;
await Promise.all(Array.from({ length: jobs }, async () => { while (next < work.length) await one(work[next++]); }));
console.log('done');
