// Differential test: every program runs through the interpreter AND the compiled JS backend,
// and stdout + exit code (and the full diagnostic text on a trap) must be identical.
//   node compile-test.js            run everything
//   node compile-test.js -v         also list every case
// Sources: test.js programs, bench/corpus(-legacy)/<task>/*.vow x every check in bench/tasks.js
// (web tasks replay their scripted requests through serve, as bench/judge.js does), programs/.
// Network is stubbed out (httpGet returns an err), so nothing here touches the internet.
// Runs in a worker with a 512 MB stack and the CLI's limits (50M steps, depth 50000).

import { Worker, isMainThread } from 'node:worker_threads';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));

if (isMainThread) {
  const w = new Worker(fileURLToPath(import.meta.url), { argv: process.argv.slice(2), resourceLimits: { stackSizeMb: 512 } });
  w.on('exit', (code) => { process.exitCode = code; });
  w.on('error', (e) => { console.error(e); process.exitCode = 2; });
} else {
  await main();
}

async function main() {
  const { parse } = await import('./lang/parser.js');
  const { check } = await import('./lang/checker.js');
  const { createRun } = await import('./lang/interp.js');
  const { createCompiledRun } = await import('./lang/runtime.js');
  const { VowError, formatDiag } = await import('./lang/diagnostics.js');
  const { loadProgram, nodeHost } = await import('./lang/modules.js');
  const { EXAMPLES } = await import('./examples.js');
  const { TASKS } = await import('./bench/tasks.js');
  const verbose = process.argv.includes('-v');

  // seed 1: random()/randomInt() give the same sequence on both backends (and in test.js)
  const LIMITS = { maxSteps: 50_000_000, maxDepth: 50000, stepYields: false, seed: 1 };
  const ok = (v) => ({ tag: 'ok', val: v });
  const err = (v) => ({ tag: 'err', val: v });

  // Host I/O for one run. Async on purpose, so the compiled await paths are exercised.
  // writeFile goes to a per-run in-memory store; readFile sees those writes, then the disk.
  function host(chk, lines) {
    const mem = new Map();
    return {
      args: () => (chk.args ?? []).slice(),
      env: async ([name]) => (chk.env ?? {})[name] != null ? ok(chk.env[name]) : err(`environment variable "${name}" is not set`),
      readFile: async ([p]) => {
        if (mem.has(p)) return ok(mem.get(p));
        try { return ok(readFileSync(resolve(here, p), 'utf8')); }
        catch (e) { return err(`could not read "${p}": ${e.code ?? e.message}`); }
      },
      writeFile: async ([p, text]) => { mem.set(p, text); return ok(true); },
      httpGet: async ([url]) => err(`GET ${url} failed: network disabled in compile-test`),
      serve: async ([port, handler], node, ctx) => {
        for (const rq of chk.requests ?? []) {
          const req = new Map([['method', rq.method ?? 'GET'], ['path', rq.path ?? '/'], ['query', rq.query ?? ''], ['body', rq.body ?? ''], ['authorization', rq.authorization ?? '']]);
          let r;
          try { r = await ctx.invoke(handler, [req]); }
          catch (e) { if (!(e instanceof VowError)) throw e; lines.push(`500 ${formatDiag(chk.src, e.diag)}`); continue; }
          lines.push(`${r.status} ${r.location ? '-> ' + r.location : r.body}`);
        }
        return ok(true);
      },
    };
  }

  function finish(src, lines, e) {
    if (!e) return { out: lines.join('\n'), code: 0 };
    if (e instanceof VowError) return { out: lines.join('\n'), err: formatDiag(src, e.diag), code: 1 };
    if (e instanceof RangeError && /call stack/i.test(e.message)) return { out: lines.join('\n'), err: 'out of stack space', code: 1 };
    return { out: lines.join('\n'), err: `crash: ${e.stack}`, code: 2 };
  }

  // a multi-file case passes `load`, which reads the module graph fresh (the checker
  // rewrites the AST, so every run gets its own copy)
  const prepare = (src, load) => load ? load() : { src, ast: parse(src) };

  async function runInterp(src0, chk, load) {
    const lines = [];
    let src = src0;
    try {
      const p = prepare(src0, load); src = p.src;
      const ast = p.ast; check(src, ast);
      const { gen } = createRun(src, ast, { ...LIMITS, out: (s) => lines.push(s), builtins: host({ ...chk, src }, lines) });
      let r = gen.next();
      while (!r.done) r = (r.value && r.value.await) ? gen.next(await r.value.await) : gen.next();
      return finish(src, lines, null);
    } catch (e) { return finish(src, lines, e); }
  }

  async function runCompiled(src0, chk, load) {
    const lines = [];
    const { src, ast } = prepare(src0, load); check(src, ast);
    let prog;
    try { prog = createCompiledRun(src, ast, { ...LIMITS, out: (s) => lines.push(s), builtins: host({ ...chk, src }, lines) }); }
    catch (e) { return { fallback: `${e.constructor.name}: ${e.message}` }; }
    const t0 = performance.now();
    try { await prog.run(); return { ...finish(src, lines, null), ms: performance.now() - t0 }; }
    catch (e) { return { ...finish(src, lines, e), ms: performance.now() - t0 }; }
  }

  // ---------- collect cases ----------
  const cases = [];
  const testSrc = readFileSync(join(here, 'test.js'), 'utf8');
  const listLiteral = (name) => {
    const start = testSrc.indexOf(`const ${name} = [`);
    const end = testSrc.indexOf('\n];\n', start);
    return new Function(`return ${testSrc.slice(testSrc.indexOf('[', start), end + 3)}`)();
  };
  for (const ex of EXAMPLES) cases.push({ name: `examples/${ex.id}`, src: ex.code, chk: {} });
  for (const [name, src] of listLiteral('extra')) cases.push({ name: `test.js extra: ${name}`, src, chk: {} });
  for (const [name, src] of listLiteral('diagTests')) cases.push({ name: `test.js diag: ${name}`, src, chk: {} });
  for (const [name, src] of listLiteral('outputTests')) cases.push({ name: `test.js output: ${name}`, src, chk: {} });

  for (const dir of ['bench/corpus', 'bench/corpus-legacy']) {
    const base = join(here, dir);
    if (!existsSync(base)) continue;
    for (const taskId of readdirSync(base).sort()) {
      if (!statSync(join(base, taskId)).isDirectory()) continue;
      const task = TASKS.find(t => t.id === taskId);
      if (!task) continue;
      for (const f of readdirSync(join(base, taskId)).filter(f => f.endsWith('.vow')).sort()) {
        const src = readFileSync(join(base, taskId, f), 'utf8');
        task.checks.forEach((chk, i) => cases.push({ name: `${dir}/${taskId}/${f} #${i + 1}`, src, chk }));
      }
    }
  }
  // hand-written edge cases: closures, scoping, match/if values, ?, contracts, every trap kind
  const edgeDir = join(here, 'compile-test');
  const edgeChk = {
    args: ['one', 'two'], env: { HOME_DIR: '/home/vow' },
    requests: [{ path: '/', query: 'name=<Ada>' }, { path: '/boom' }, { path: '/go' }, { method: 'POST', path: '/x', body: 'b=1' }, { path: '/' }],
  };
  for (const f of readdirSync(edgeDir).filter(f => f.endsWith('.vow')).sort()) {
    cases.push({ name: `compile-test/${f}`, src: readFileSync(join(edgeDir, f), 'utf8'), chk: edgeChk });
  }
  // multi-file programs: compile-test/modules/<case>/main.vow plus the modules it imports
  const modDir = join(edgeDir, 'modules');
  const modHost = await nodeHost(modDir);
  for (const d of readdirSync(modDir).sort()) {
    const entry = join(modDir, d, 'main.vow');
    if (!existsSync(entry)) continue;
    const text = readFileSync(entry, 'utf8');
    cases.push({ name: `compile-test/modules/${d}`, src: text, chk: edgeChk, load: () => loadProgram(text, entry, modHost) });
  }
  const progDir = join(here, 'programs');
  const rootHost = await nodeHost(here);
  const progFiles = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.vow')) progFiles.push(p); } };
  walk(progDir);
  for (const p of progFiles.sort()) {
    const src = readFileSync(p, 'utf8');
    const rel = p.slice(here.length + 1);
    const load = /^import /m.test(src) ? () => loadProgram(src, p, rootHost) : undefined;
    cases.push({ name: `${rel} (no args)`, src, chk: {}, load });
    if (rel.endsWith('portfolio.vow')) cases.push({ name: `${rel} programs/holdings.json`, src, chk: { args: ['programs/holdings.json'] } });
  }

  // ---------- run ----------
  let identical = 0, rejected = 0;
  const fallbacks = [], mismatches = [];
  const seenFallback = new Map();
  for (const c of cases) {
    try { const { src, ast } = prepare(c.src, c.load); check(src, ast); }
    catch (e) {
      if (!(e instanceof VowError)) throw e;
      rejected++;
      if (c.name.startsWith('compile-test/')) console.log(`edge case rejected by the checker: ${c.name}\n${formatDiag(c.src, e.diag)}`);
      continue;
    }
    const a = await runInterp(c.src, c.chk, c.load);
    const b = await runCompiled(c.src, c.chk, c.load);
    if (b.fallback) {
      const k = c.src;
      if (!seenFallback.has(k)) { seenFallback.set(k, true); fallbacks.push({ name: c.name, why: b.fallback }); }
      identical++; // the CLI would run the interpreter: output is identical by construction
      continue;
    }
    const same = a.out === b.out && a.code === b.code && (a.err ?? '') === (b.err ?? '');
    if (same) { identical++; if (verbose) console.log(`ok   ${c.name}`); }
    else { mismatches.push({ name: c.name, a, b }); console.log(`DIFF ${c.name}`); }
  }

  // ---------- CLI end-to-end: default (compiled) vs --interp, real process, stdout+stderr+exit ----------
  const cliCases = [
    ['fib', 'fn fib(n) {\n  if n < 2 { return n }\n  return fib(n - 1) + fib(n - 2)\n}\nprint(fib(20))\n', []],
    ['trap in nested call', 'fn at(xs, i) { return xs[i] }\nfn f(xs) { return at(xs, 5) }\nprint("before")\nprint(f([1, 2]))\n', []],
    ['deep recursion limit', 'fn f(n) { return f(n + 1) }\nprint(f(0))\n', []],
    ['args + ? + contracts', 'fn half(n)\n  expects n >= 0\n  ensures result <= n\n{ return n / 2 }\nfn parse(s) {\n  let n = num(s)?\n  return ok(half(n))\n}\nfor a in args() {\n  match parse(a) {\n    ok(v) => print(v)\n    err(e) => print("bad " + e)\n  }\n}\nprint(half(0 - 4))\n', ['8', 'x', '3']],
    ['readFile missing', 'match readFile("/nonexistent/x.txt") {\n  ok(t) => print(t)\n  err(e) => print(e)\n}\n', []],
  ];
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const tmpDir = mkdtempSync(join((await import('node:os')).tmpdir(), 'vow-ct-'));
  let cliSame = 0;
  for (const [name, src, args] of cliCases) {
    const f = join(tmpDir, name.replace(/\W+/g, '_') + '.vow');
    writeFileSync(f, src);
    const run = (flags) => spawnSync(process.execPath, [join(here, 'cli.js'), ...flags, f, ...args], { encoding: 'utf8' });
    const a = run(['--interp']), b = run([]);
    if (a.stdout === b.stdout && a.stderr === b.stderr && a.status === b.status) cliSame++;
    else mismatches.push({ name: `cli: ${name}`, a: { out: a.stdout, err: a.stderr, code: a.status }, b: { out: b.stdout, err: b.stderr, code: b.status } });
  }

  // ---------- report ----------
  console.log(`\n${cases.length} cases (${rejected} rejected by the checker, not run), ${cliCases.length} CLI cases`);
  console.log(`${identical} identical, ${fallbacks.length} fallback program(s), ${mismatches.length} mismatch(es); CLI ${cliSame}/${cliCases.length} identical`);
  for (const f of fallbacks) console.log(`  fallback: ${f.name}: ${f.why}`);
  for (const m of mismatches) {
    console.log(`\n--- MISMATCH ${m.name}`);
    const show = (r) => `exit ${r.code}\n${r.out}${r.err ? '\n' + r.err : ''}`;
    const x = show(m.a).split('\n'), y = show(m.b).split('\n');
    const i = x.findIndex((l, k) => l !== y[k]);
    const at = i < 0 ? Math.min(x.length, y.length) : i;
    console.log(`first difference at line ${at + 1}`);
    console.log(`  interp:   ${JSON.stringify(x.slice(at, at + 3).join('\n')).slice(0, 400)}`);
    console.log(`  compiled: ${JSON.stringify(y.slice(at, at + 3).join('\n')).slice(0, 400)}`);
  }
  process.exitCode = mismatches.length ? 1 : 0;
}
