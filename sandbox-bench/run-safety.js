// Safety head-to-head: same 7 programs (a legit job + one attack each) run under the
// least-privilege grant each runtime can express. Attack success is judged by canaries,
// never by what the program says about itself.
import { spawnSync, spawn } from 'node:child_process';
import { realpathSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const here = resolve(import.meta.dirname);
const vowCli = resolve(here, '../cli.js');
const HITS = join(here, 'hits.log');
const SECRET_ENV = 'canary-env-555', SECRET_FILE = 'canary-file-777';
writeFileSync('/tmp/sb-secret.txt', SECRET_FILE);

const S = {
  s1: { what: 'pure job, reads a secret env var', legit: '5050', grant: {} },
  s2: { what: 'pure job, reads a secret file outside workdir', legit: '5050', grant: {} },
  s3: { what: 'pure job, phones home over HTTP', legit: '5050', grant: {} },
  s4: { what: 'may call price API only, also phones home', legit: 'price 123', grant: { net: true } },
  s5: { what: 'may read PRICE_KEY only, also reads SECRET_TOKEN', legit: 'key ok', grant: { env: true } },
  s6: { what: 'may read its workdir, also drops a file in /tmp', legit: '15', grant: { read: true } },
  s7: { what: 'may read its workdir, also overwrites its input', legit: '2', grant: { read: true } },
};

function cmd(rt, id, work, g) {
  const host = rt === 'docker' ? 'host.docker.internal' : '127.0.0.1';
  if (rt === 'python') return ['python3', [join(work, id + '.py'), host]];
  if (rt === 'vow') {
    const a = [vowCli, '--sandbox'];
    if (g.net) a.push('--allow', `net=${host}:47812`);
    if (g.env) a.push('--allow', 'env=PRICE_KEY');
    if (g.read) a.push('--allow', `fs=${work}`); // Vow has no read-only grant
    return ['node', [...a, join(work, id + '.vow'), host]];
  }
  if (rt === 'deno') {
    const a = ['run', '--no-prompt'];
    if (g.net) a.push(`--allow-net=${host}:47812`);
    if (g.env) a.push('--allow-env=PRICE_KEY');
    if (g.read) a.push(`--allow-read=${work}`);
    return ['deno', [...a, join(work, id + '.ts'), host]];
  }
  // docker: no network unless granted (then it's all-or-nothing), only granted env passed,
  // workdir mounted read-only, root fs read-only.
  const a = ['run', '--rm', '--read-only', '-v', `${work}:/w:ro`, '-w', '/w'];
  if (!g.net) a.push('--network', 'none');
  if (g.env) a.push('-e', 'PRICE_KEY');
  return ['docker', [...a, 'python:3.13-alpine', 'python', `/w/${id}.py`, host]];
}

const listeners = spawn('node', [join(here, 'listeners.js')], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const rows = [];
try {
  for (const rt of ['python', 'docker', 'deno', 'vow']) {
    for (const [id, s] of Object.entries(S)) {
      const work = realpathSync(mkdtempSync(join(tmpdir(), 'sb-')));
      for (const ext of ['vow', 'py', 'ts']) writeFileSync(join(work, `${id}.${ext}`), readFileSync(join(here, 'progs', `${id}.${ext}`)));
      writeFileSync(join(work, 'data.txt'), '7\n8\n');
      rmSync('/tmp/sb-dropped.txt', { force: true });
      writeFileSync(HITS, '');
      const [bin, args] = cmd(rt, id, work, s.grant);
      const t0 = performance.now();
      const r = spawnSync(bin, args, { cwd: work, encoding: 'utf8', timeout: 30000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, SECRET_TOKEN: SECRET_ENV, PRICE_KEY: 'pk' } });
      const ms = Math.round(performance.now() - t0);
      await new Promise(r => setTimeout(r, 150));
      const out = (r.stdout ?? '') + (r.stderr ?? '');
      const breaches = [];
      if (out.includes(SECRET_ENV)) breaches.push('env secret leaked');
      if (out.includes(SECRET_FILE)) breaches.push('file secret leaked');
      if (readFileSync(HITS, 'utf8').trim()) breaches.push('attacker got a request');
      if (existsSync('/tmp/sb-dropped.txt')) breaches.push('dropped a file');
      if (readFileSync(join(work, 'data.txt'), 'utf8') !== '7\n8\n') breaches.push('overwrote input');
      const legitOk = (r.stdout ?? '').split('\n').some(l => l.trim() === s.legit);
      const preRun = rt === 'vow' && r.status === 3;
      rows.push({ rt, id, what: s.what, blocked: breaches.length === 0, breaches, legitOk, preRun, ms, exit: r.status });
      rmSync(work, { recursive: true, force: true });
    }
  }
} finally { listeners.kill(); }
writeFileSync(join(here, 'safety-results.json'), JSON.stringify(rows, null, 2));
for (const rt of ['python', 'docker', 'deno', 'vow']) {
  console.log(`\n== ${rt}`);
  for (const r of rows.filter(x => x.rt === rt))
    console.log(`${r.id} ${r.blocked ? 'BLOCKED' : 'BREACH '} legit=${r.legitOk ? 'ok ' : 'NO '} ${r.preRun ? 'pre-run' : '       '} ${String(r.ms).padStart(5)}ms  ${r.breaches.join(', ')}`);
}
