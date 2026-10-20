// Runs one Vow program in isolation for the MCP server. Sandboxed: readFile/writeFile/
// httpGet/env are replaced below with err Results, so a program sent by an agent can't
// touch the disk, the network, or secrets. mode "test" runs the program's test blocks
// instead of its top-level code (run(args, stdin) inside a test still works: it swaps in
// its own args/stdin/print for the inner run).
import { parentPort, workerData } from 'node:worker_threads';
import { check } from '../lang/checker.js';
import { loadCode } from './server-load.js';
import { createRun } from '../lang/interp.js';
import { VowError, formatDiag } from '../lang/diagnostics.js';
import { runTests, formatReport } from '../lang/testing.js';

const { code, args, path, seed, mode, filter } = workerData;
const sandboxed = (name) => ({ tag: 'err', val: `${name} is disabled in the ${mode === 'test' ? 'vow_test' : 'vow_run'} sandbox; test the logic with args() instead, then run real I/O with the Vow CLI` });
const out = [];
const MAX_OUT = 2000;
let src = code;
try {
  const loaded = await loadCode(code, path);
  src = loaded.src;
  const ast = loaded.ast;
  check(src, ast);
  const { gen, tests } = createRun(src, ast, {
    seed,
    out: (line) => { if (out.length < MAX_OUT) out.push(line); },
    maxSteps: 5_000_000,
    maxDepth: 20_000,
    stepYields: false,
    builtins: {
      args: () => args.slice(),
      readFile: () => sandboxed('readFile'), writeFile: () => sandboxed('writeFile'),
      httpGet: () => sandboxed('httpGet'), httpRequest: () => sandboxed('httpRequest'), env: () => sandboxed('env'),
      readLine: () => sandboxed('readLine'), readAll: () => sandboxed('readAll'),
    },
  });
  if (mode === 'test') {
    const results = await runTests(tests, { src, filter });
    const { text, code: exit } = formatReport(results, { total: tests.length, filter });
    parentPort.postMessage({ ok: exit === 0, output: out.join('\n'), report: text });
  } else {
    let r = gen.next();
    while (!r.done) r = (r.value && r.value.await) ? gen.next(await r.value.await) : gen.next();
    parentPort.postMessage({ ok: true, output: out.join('\n'), truncated: out.length >= MAX_OUT });
  }
} catch (e) {
  if (e?.vowExit) parentPort.postMessage(e.exitCode === 0 ? { ok: true, output: out.join('\n') } : { ok: false, output: out.join('\n'), error: e.exitMessage ?? `exited with code ${e.exitCode}` });
  else if (e instanceof VowError) parentPort.postMessage({ ok: false, output: out.join('\n'), error: formatDiag(src, e.diag) });
  else if (e instanceof RangeError) parentPort.postMessage({ ok: false, output: out.join('\n'), error: '✗ RuntimeError: ran out of stack space\n  Likely fix: turn the deepest recursion into a loop.' });
  else parentPort.postMessage({ ok: false, output: out.join('\n'), error: `internal error: ${e.message}` });
}
