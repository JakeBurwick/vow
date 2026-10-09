// Vow CLI body: runs inside a worker thread started by cli.js (bigger stack for deep recursion).
// Vow CLI — run .vow programs with real I/O.
//   node cli.js program.vow [args...]     run a program
//   node cli.js --check program.vow       type-check only, run nothing
//   node cli.js --interp program.vow      run on the tree-walking interpreter instead of
//                                         the compiled JS backend (lang/compile.js)
//   node cli.js --seed 42 program.vow     reproducible random() / randomInt() (also VOW_SEED=42)

import { readFile as fsRead, writeFile as fsWrite } from 'node:fs/promises';
import process from 'node:process';
import { createServer } from 'node:http';
import { check } from './lang/checker.js';
import { createRun } from './lang/interp.js';
import { createCompiledRun } from './lang/runtime.js';
import { VowError, formatDiag, nodeLoc } from './lang/diagnostics.js';
import { loadProgram, nodeHost } from './lang/modules.js';

const argv = process.argv.slice(2);
// Sandbox policy. Any --allow (or --sandbox) turns it on; then the program may only reach
// what is listed. `--allow net` = any host, `--allow net=host:port`, `--allow fs=./dir`,
// `--allow env=NAME`. Repeat the flag for more. `--sandbox` alone = pure computation only.
const policy = { on: false, caps: new Map() }; // cap -> null (any) | string[] (scoped)
let checkOnly = false;
let forceInterp = false;
// --seed N (or VOW_SEED=N) makes random() / randomInt() reproducible
let seed = process.env.VOW_SEED;
while (argv[0]?.startsWith('--')) {
  const flag = argv.shift();
  if (flag === '--check') checkOnly = true;
  else if (flag === '--interp') forceInterp = true;
  else if (flag === '--seed') seed = argv.shift();
  else if (flag === '--sandbox') policy.on = true;
  else if (flag === '--allow') {
    policy.on = true;
    for (const part of (argv.shift() ?? '').split(',').filter(Boolean)) {
      const [cap, scope] = part.split('=');
      if (!['net', 'fs', 'env'].includes(cap)) { console.error(`✗ --allow: unknown capability '${cap}' (net, fs, env)`); process.exit(2); }
      if (scope == null) policy.caps.set(cap, null);
      else if (policy.caps.get(cap) !== null) policy.caps.set(cap, [...(policy.caps.get(cap) ?? []), scope]);
    }
  } else { console.error(`✗ unknown flag ${flag}`); process.exit(2); }
}
const file = argv[0];
if (seed != null && seed !== '') {
  if (!/^-?\d+$/.test(String(seed).trim())) { console.error(`✗ --seed / VOW_SEED must be a whole number, got "${seed}"`); process.exit(2); }
  seed = Number(seed);
} else seed = undefined;

if (!file) {
  console.error('usage: vow <file.vow> [args...]\n       vow --check <file.vow>\n       vow --interp <file.vow> [args...]   (interpreter instead of the compiler)');
  process.exit(2);
}

let src;
try {
  src = await fsRead(file, 'utf8');
} catch (e) {
  console.error(`✗ could not read ${file}: ${e.code ?? e.message}`);
  process.exit(2);
}

const ok = (v) => ({ tag: 'ok', val: v });
const err = (v) => ({ tag: 'err', val: v });
const programArgs = argv.slice(1);

const ioBuiltins = {
  readFile: async ([p]) => {
    try { return ok(await fsRead(p, 'utf8')); }
    catch (e) { return err(`could not read "${p}": ${e.code ?? e.message}`); }
  },
  writeFile: async ([p, text]) => {
    try { await fsWrite(p, text); return ok(true); }
    catch (e) { return err(`could not write "${p}": ${e.code ?? e.message}`); }
  },
  httpGet: async ([url]) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
      if (!res.ok) return err(`GET ${url} failed: HTTP ${res.status}`);
      return ok(await res.text());
    } catch (e) {
      return err(`GET ${url} failed: ${e.cause?.code ?? e.message}`);
    }
  },
  env: ([name]) => process.env[name] != null ? ok(process.env[name]) : err(`environment variable "${name}" is not set`),
  args: () => [...programArgs],
  // serve(port, handler): never returns while the server is up. Requests are handled one at a
  // time (the interpreter is single-threaded), each with a fresh step budget. A handler that
  // traps gets a 500 and the server keeps going. Binds 127.0.0.1 unless VOW_HOST is set
  // (set VOW_HOST=0.0.0.0 on a hosting platform).
  serve: ([port, handler], node, ctx) => new Promise((resolve) => {
    const host = process.env.VOW_HOST || '127.0.0.1';
    let chain = Promise.resolve();
    const server = createServer((req, res) => {
      const chunks = [];
      let size = 0, tooBig = false;
      req.on('data', (c) => { size += c.length; if (size > 1_000_000) { tooBig = true; req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (tooBig) return;
        const url = new URL(req.url, 'http://x');
        const vreq = new Map([
          ['method', req.method], ['path', url.pathname],
          ['query', url.search.slice(1)], ['body', Buffer.concat(chunks).toString('utf8')],
          ['authorization', req.headers.authorization ?? ''],
        ]);
        chain = chain.then(async () => {
          const started = Date.now();
          let r;
          try {
            r = await ctx.invoke(handler, [vreq]);
          } catch (e) {
            const msg = e instanceof VowError ? formatDiag(src, e.diag) : `internal error: ${e.message}`;
            console.error(`${req.method} ${url.pathname} -> 500\n${msg}`);
            r = { status: 500, type: 'text/plain; charset=utf-8', body: 'internal server error' };
          }
          res.writeHead(r.status, {
            'Content-Type': r.type,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            // Vow pages can't run scripts or be framed: there is no way to add JS from Vow,
            // so a strict policy costs nothing and turns any missed escape() into a non-event
            ...(r.type.startsWith('text/html') ? {
              'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            } : {}),
            ...(r.location ? { Location: r.location } : {}),
            ...(r.authenticate ? { 'WWW-Authenticate': `Basic realm="${String(r.authenticate).replace(/["\\]/g, '')}", charset="UTF-8"` } : {}),
            'Cache-Control': 'no-store',
          });
          res.end(r.body);
          console.error(`${req.method} ${url.pathname} -> ${r.status} (${Date.now() - started} ms)`);
        });
      });
    });
    server.requestTimeout = 15_000;
    server.on('error', (e) => resolve(err(`could not serve on port ${port}: ${e.code ?? e.message}`)));
    server.listen(port, host, () => console.error(`serving on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (Ctrl+C to stop)`));
  }),
};

// Runtime backstop for scoped grants (hosts, dirs, names can be computed at runtime,
// so only the capability itself is provable before the run).
import { resolve as resolvePath, sep } from 'node:path';
const denied = (cap, what) => err(`sandbox: ${cap} access to ${what} is not allowed (--allow ${cap}=...)`);
const permits = (cap, test) => !policy.on || policy.caps.get(cap) === null || (policy.caps.get(cap) ?? []).some(test);
const raw = { ...ioBuiltins };
const guarded = {
  readFile: ([p]) => permits('fs', d => (resolvePath(p) + sep).startsWith(resolvePath(d) + sep)) ? raw.readFile([p]) : denied('fs', `"${p}"`),
  writeFile: ([p, text]) => permits('fs', d => (resolvePath(p) + sep).startsWith(resolvePath(d) + sep)) ? raw.writeFile([p, text]) : denied('fs', `"${p}"`),
  httpGet: ([url]) => {
    let host; try { host = new URL(url).host; } catch { return err(`GET ${url} failed: invalid URL`); }
    return permits('net', h => h === host) ? raw.httpGet([url]) : denied('net', host);
  },
  env: ([name]) => permits('env', n => n === name) ? raw.env([name]) : denied('env', `"${name}"`),
};
Object.assign(ioBuiltins, guarded);

try {
  // the main file plus every module it imports (relative to it), as one program
  const loaded = loadProgram(src, resolvePath(file), await nodeHost());
  src = loaded.src;
  const ast = loaded.ast;
  const { proved, effects } = check(src, ast);
  if (policy.on) {
    // Refuse before running a single statement if the program can reach anything not granted.
    const over = [...effects].filter(([cap]) => !policy.caps.has(cap));
    if (over.length) {
      const lines = over.map(([cap, info]) => {
        const loc = info.node?.start != null ? nodeLoc(src, info.node) : null;
        const at = loc ? ` (${loc.file ? loc.file + ', ' : ''}line ${loc.line})` : '';
        return `  ${cap}: ${info.why}${at}`;
      });
      console.error(`✗ SandboxError: this program needs capabilities the sandbox does not grant\n${lines.join('\n')}\n  Nothing was run.\n  Likely fix: remove that access, or run with --allow ${over.map(([c]) => c).join(',')}`);
      process.exit(3);
    }
  }
  if (checkOnly) {
    const nmod = ast.modules ? ast.modules.length - 1 : 0;
    console.log(`✓ ${file}${nmod ? ` and ${nmod} imported module${nmod === 1 ? '' : 's'}` : ''} type-check${nmod ? '' : 's'}${proved > 0 ? ` (${proved} contract obligation${proved === 1 ? '' : 's'} proven safe statically)` : ''}`);
    process.exit(0);
  }
  const runOpts = {
    out: (line) => console.log(line),
    maxSteps: 50_000_000,
    maxDepth: 50000,
    stepYields: false,
    builtins: ioBuiltins,
    seed,
  };
  // Compiled by default; anything the compiler can't handle runs on the interpreter instead
  // (decided before a single statement runs, so output never changes).
  let compiled = null;
  if (!forceInterp) {
    try { compiled = createCompiledRun(src, ast, runOpts); }
    catch (e) { if (process.env.VOW_DEBUG) console.error(`(compiler fallback: ${e.message})`); }
  }
  if (compiled) await compiled.run();
  else {
    const { gen } = createRun(src, ast, runOpts);
    let r = gen.next();
    while (!r.done) {
      r = (r.value && r.value.await) ? gen.next(await r.value.await) : gen.next();
    }
  }
} catch (e) {
  if (e instanceof VowError) {
    console.error(formatDiag(src, e.diag));
    process.exit(1);
  }
  if (e instanceof RangeError && /call stack/i.test(e.message)) {
    console.error('✗ RuntimeError: ran out of stack space\n  The program recursed deeper than the machine allows.\n  Likely fix: turn the deepest recursion into a loop.');
    process.exit(1);
  }
  throw e;
}
