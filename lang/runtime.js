// Runs a Vow program through the JavaScript backend (lang/compile.js).
// Same contract as createRun in lang/interp.js: same opts (out, maxSteps, maxDepth, builtins, seed),
// output through opts.out, failures thrown as VowError with identical diagnostics, and the same
// `tests` list ({ name, node, run }) for `vow test`.
// The builtin table is the interpreter's own (createRun(...).builtins), so builtins behave
// identically by construction.

import { compile } from './compile.js';
import { createRun, JNum, display, deepEq, isJson, okeys, compareText, compareKeys, UNIT, HIGHER_ORDER, testIO, runOutput, runTrap, topErr } from './interp.js';
import { VowError, nodeLoc } from './diagnostics.js';

const EMPTY = { t: 'Program', stmts: [] };

// Throws Unsupported (or anything else) when the program can't be compiled; callers fall back
// to the interpreter. Nothing has run at that point.
export function createCompiledRun(src, ast, opts = {}) {
  const maxSteps = opts.maxSteps ?? 1_000_000;
  const maxDepth = opts.maxDepth ?? 200;
  const { builtins } = createRun(src, EMPTY, { out: opts.out, err: opts.err, builtins: opts.builtins, seed: opts.seed });
  const { code, nodes } = compile(src, ast, { maxSteps, maxDepth, builtinNames: [...Object.keys(builtins), 'sortBy', ...HIGHER_ORDER] });
  const factory = new Function('$rt', '$nodes', code);
  const prog = factory({ $B: builtins, JNum, display, deepEq, isJson, okeys, compareText, compareKeys, UNIT, VowError, nodeLoc, src, testIO, runOutput, runTrap, topErr }, nodes);
  return { run: () => prog.main(), tests: prog.tests, code };
}
