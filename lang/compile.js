// Vow -> JavaScript compiler. Runs only on programs that already passed check() (the checker
// rewrites the AST in place: implicit returns, value tails), and must reproduce the
// interpreter (lang/interp.js) exactly: output, trap text, call-stack notes, step and depth
// limits, contract blame. lang/runtime.js turns the generated source into a runnable program.
//
// Shape of the output: the body of a factory `($rt, $nodes) => ({ main, tests })`. Vow fns become
// JS function declarations, lambdas become arrows, top-level code becomes `async $main()`, and
// each `test "name" { ... }` block becomes an async function in `tests` (never part of $main).
// Expressions that need statements (match / if-else as values, `?`) are lowered into
// "pre" statements in evaluation order, so `?` and a `return` inside a value arm are plain JS
// returns. Anything the compiler does not handle throws Unsupported and the CLI falls back
// to the interpreter.

import { BUILTIN_NAMES } from './checker.js';

class Unsupported extends Error {}

// builtins the host (CLI) may implement asynchronously; calls to them are awaited
const ASYNC_BUILTINS = new Set(['readFile', 'writeFile', 'httpGet', 'httpRequest', 'serve', 'env', 'run']);
// builtins that can trap: their VowError needs the compiled call stack as notes
const TRAP_BUILTINS = new Set(['range', 'repeat', 'redirect', 'toJson', 'prettyJson', 'jsonSet', 'jsonDelete', 'json', 'ord', 'chr', 'matches', 'find', 'findAll', 'replaceAll', 'splitOn', 'sig',
  'sqrt', 'pow', 'exp', 'ln', 'log', 'sin', 'cos', 'tan', 'atan2', 'ceil', 'trunc', 'randomInt', 'dateParts', 'isoDate', 'daysBetween', 'expect', 'expectEq', 'expectErr']);
// builtins that run(args, stdin) in a test swaps out for the inner program run: compiled
// calls look them up on $B at call time instead of binding them once
const SWAPPABLE = new Set(['print', 'args', 'readLine', 'readAll']);
// builtins that call back into Vow code: compiled to prelude helpers ($map / $mapA, ...),
// in the same item order and with the same short-circuiting as lang/interp.js
const HIGHER_ORDER = { map: 2, filter: 2, any: 2, all: 2, count: 2, fold: 3 };
const SKIP_KEYS = new Set(['pos', 'tok', 'nameTok', 'tagTok', 'binderTok', 'calleeNode', 'mod']);

function forEachChild(node, f) {
  for (const k in node) {
    if (SKIP_KEYS.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x === 'object') f(x); }
    else if (v && typeof v === 'object') f(v);
  }
}

// Which fns must be async. A fn is async when it (transitively, through direct calls) reaches
// an async builtin. If a lambda would be async, or an async fn is used as a value, we can't
// know statically which dynamic calls need an await, so every fn, lambda and call goes async.
function analyzeAsync(ast) {
  const fns = new Map();
  for (const s of ast.stmts) if (s.t === 'Fn') fns.set(s.name, s);
  const lambdas = [];
  const scan = (node, acc) => {
    if (node.t === 'Lambda' && acc.root !== node) { lambdas.push(node); return; }
    if (node.t === 'Call') {
      if (fns.has(node.callee)) acc.calls.add(node.callee);
      else if (ASYNC_BUILTINS.has(node.callee)) acc.direct = true;
    }
    if (node.t === 'Ident' && fns.has(node.name)) acc.refs.add(node.name);
    forEachChild(node, (c) => scan(c, acc));
  };
  const mk = (root) => ({ root, direct: false, calls: new Set(), refs: new Set() });
  const fnAcc = new Map();
  for (const [name, decl] of fns) {
    const acc = mk(decl);
    for (const c of decl.expects) scan(c, acc);
    for (const c of decl.ensures) scan(c, acc);
    scan(decl.body, acc);
    fnAcc.set(name, acc);
  }
  const topAcc = mk(null);
  for (const s of ast.stmts) if (s.t !== 'Fn') scan(s, topAcc);
  const lamAccs = [];
  for (let i = 0; i < lambdas.length; i++) { const acc = mk(lambdas[i]); scan(lambdas[i], acc); lamAccs.push(acc); }

  const asyncFns = new Set([...fnAcc].filter(([, a]) => a.direct).map(([n]) => n));
  for (let grew = true; grew;) {
    grew = false;
    for (const [n, a] of fnAcc) if (!asyncFns.has(n) && [...a.calls].some(c => asyncFns.has(c))) { asyncFns.add(n); grew = true; }
  }
  const touchesAsync = (a) => [...a.calls].some(c => asyncFns.has(c));
  const refsAsync = (a) => [...a.refs].some(c => asyncFns.has(c));
  const allAsync = lamAccs.some(a => a.direct || touchesAsync(a) || refsAsync(a))
    || [...fnAcc.values()].some(refsAsync) || refsAsync(topAcc);
  return { asyncFns, allAsync };
}

// Runtime helpers, emitted into every compiled program so they share its call-stack state
// ($D depth, $N frame names, $L saved frame lines, $ln current line, $S steps). Message
// texts are copied verbatim from lang/interp.js.
/* eslint-disable no-undef */
function PRELUDE() {
  function $notes() {
    const frames = [];
    for (let d = $D; d >= 1 && frames.length < 8; d--) frames.push(`at fn ${$N[d]} (${$F[d] ? $F[d] + ', ' : ''}line ${d === $D ? $ln : $L[d]})`);
    const extra = $D - 8;
    if (extra > 0) frames.push(`… ${extra} more call${extra === 1 ? '' : 's'}`);
    return frames.length ? ['', 'call stack:', ...frames.map(s => '  ' + s)] : undefined;
  }
  function $trap(node, kind, title, detail, fix) {
    throw new VowError({ kind, title, ...nodeLoc($src, node), detail, fix, notes: $notes() });
  }
  function $stepTrap(s) {
    $trap(s, 'RuntimeError', `the program ran over ${$MAXS.toLocaleString()} steps and was stopped`,
      'That many steps is usually an infinite loop, but it can also be heavy legitimate work.',
      `check that your while condition can become false and that loop counters actually change; if the work is real, raise the limit: vow --max-steps ${$MAXS * 10} main.vow (0 = no limit).`);
  }
  function $depthTrap(callNode) {
    const counts = new Map([['(top level)', 1]]);
    for (let d = 1; d <= $D; d++) counts.set($N[d], (counts.get($N[d]) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const who = top === '(lambda)' ? 'a lambda' : `fn ${top}`;
    $trap(callNode, 'RuntimeError', `the call stack hit ${$MAXD} calls deep (mostly ${who})`,
      `${who} appears ${counts.get(top)} times on the stack. This is usually infinite recursion: a base case that is missing or never reached. If the recursion is intentional and just deep, rewrite it as a loop.`,
      `check that ${who} has a path that returns WITHOUT calling itself, and that each call moves toward it.`);
  }
  function $argList(decl, args) { return decl.params.map((p, i) => `${p.name} = ${display(args[i], 1)}`).join(', '); }
  function $expectFail(decl, cond, args, callNode) {
    $trap(callNode, 'ContractViolation', `fn ${decl.name} was called with arguments that break its contract`,
      `fn ${decl.name} declares:  expects ${$src.slice(cond.start, cond.end)}\nbut it was called from line ${nodeLoc($src, callNode).line} with:  ${$argList(decl, args)}.\nThe bug is in the CALLER, not in fn ${decl.name}.`,
      `at the call site, check the value before calling (if ... { }), or handle the bad input there by returning err(...).`);
  }
  function $ensureFail(decl, cond, result, args) {
    $trap(cond, 'ContractViolation', `fn ${decl.name} broke its own promise`,
      `fn ${decl.name} declares:  ensures ${$src.slice(cond.start, cond.end)}\nbut it returned:  result = ${display(result, 1)}  (called with ${$argList(decl, args)}).\nThe bug is INSIDE fn ${decl.name}; its output doesn't satisfy its own guarantee.`,
      `fix the body of fn ${decl.name} so the returned value always satisfies the ensures condition.`);
  }
  function $pop(v) { $ln = $L[--$D]; return v; }
  function $lam(f, node) { f.lambda = node; return f; }
  function $disp(v) { return typeof v === 'string' ? v : display(v); }
  function $eq(a, b) { return a === b || (typeof a === 'object' && a !== null && deepEq(a, b)); }
  function $push(list, v) { list.push(v); return list; }
  function $Bt(f, args, node) {
    try { return f(args, node, $ctx); }
    catch (e) { if (e instanceof VowError && !e.diag.notes) e.diag.notes = $notes(); throw e; }
  }
  function $div(l, r, e) {
    if (r === 0) $trap(e, 'RuntimeError', 'division by zero',
      `The right side of this division is 0 (left side was ${display(l)}).`,
      'guard it: if divisor != 0 { ... }, or return err("...") when the divisor is 0.');
    return l / r;
  }
  function $mod(l, r, e) {
    if (r === 0) $trap(e, 'RuntimeError', 'modulo by zero',
      `The right side of '%' is 0.`, 'guard it with: if divisor != 0 { ... }');
    return l % r;
  }
  function $checkListIndex(list, i, node, isAssign) {
    if (!Number.isInteger(i)) {
      $trap(node, 'RuntimeError', `list index ${display(i)} is not a whole number`,
        'List positions are whole numbers: 0, 1, 2, ...',
        `round it first: ${'floor(...)'}; e.g. items[floor(${display(i)})].`);
    }
    if (i < 0 || i >= list.length) {
      $trap(node, 'RuntimeError', `index ${i} is out of range`,
        `The list has ${list.length} item${list.length === 1 ? '' : 's'}, so valid indexes are 0 to ${list.length - 1}${i === list.length && isAssign ? ` (to append, use push(list, value))` : ''}.`,
        i < 0 ? 'list indexes start at 0 and can\'t be negative.'
          : isAssign ? 'use push(list, value) to add a new item.'
            : 'check the loop bounds; a classic off-by-one. The last index is len(list) - 1.');
    }
  }
  function $idx(target, key, e) {
    // fast paths for the common hits; every miss goes through the interpreter's exact logic
    if (Array.isArray(target)) {
      if (Number.isInteger(key) && key >= 0 && key < target.length) return target[key];
    } else if (target instanceof Map) {
      if (target.has(key)) return target.get(key);
    }
    return $idxSlow(target, key, e);
  }
  function $idxSlow(target, key, e) {
    if (isJson(target)) {
      const raw = target.__json;
      if (Array.isArray(raw)) {
        if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key >= raw.length) {
          $trap(e, 'RuntimeError', `JSON array index ${display(key)} is out of range`,
            `This JSON array has ${raw.length} item${raw.length === 1 ? '' : 's'}.`,
            `use get(j, ${display(key)}) which returns a Result you can match on.`);
        }
        return { __json: raw[key], __key: key };
      }
      if (raw !== null && typeof raw === 'object') {
        if (!Object.hasOwn(raw, key)) {
          const ks = Object.keys(raw).slice(0, 8).map(k => `"${k}"`).join(', ');
          $trap(e, 'RuntimeError', `key "${key}" not found in this JSON object`,
            `Its keys are: ${ks || '(none; the object is empty)'}.`,
            `use get(j, "${key}") which returns a Result you can match on.`);
        }
        return { __json: raw[key], __key: key };
      }
      $trap(e, 'RuntimeError', `can't index into a JSON ${$jsonTypeOf(raw)}`,
        'Only JSON objects and arrays have children.',
        `check the shape first: jsonType(j) == "object" or "array".`);
    }
    if (target instanceof Map) {
      if (!target.has(key)) {
        const ks = [...target.keys()].slice(0, 8).map(k => `"${k}"`).join(', ');
        $trap(e, 'RuntimeError', `key "${key}" not found in this map`,
          `The map's keys are: ${ks || '(none; the map is empty)'}.`,
          `check first with has(m, "${key}"), or use get(m, "${key}") which returns a Result you can match on.`);
      }
      return target.get(key);
    }
    if (typeof target === 'string') {
      if (!Number.isInteger(key) || key < 0 || key >= target.length) {
        $trap(e, 'RuntimeError', `string index ${display(key)} is out of range`,
          `This string has ${target.length} character${target.length === 1 ? '' : 's'}.`,
          `check first with i < len(s), or use get(s, ${display(key)}) which returns a Result.`);
      }
      return target[key];
    }
    $checkListIndex(target, key, e, false);
    return target[key];
  }
  function $jsonTypeOf(raw) {
    return raw === null ? 'null'
      : Array.isArray(raw) ? 'array'
        : typeof raw === 'object' ? 'object'
          : typeof raw === 'boolean' ? 'bool'
            : typeof raw;
  }
  function $setIdx(target, key, v, node) {
    if (target instanceof Map) { target.set(key, v); return; }
    $checkListIndex(target, key, node, true);
    target[key] = v;
  }
  function $get(c, k) {
    if (Array.isArray(c)) { if (Number.isInteger(k) && k >= 0 && k < c.length) return { tag: 'ok', val: c[k] }; }
    else if (c instanceof Map) { if (c.has(k)) return { tag: 'ok', val: c.get(k) }; }
    return $B.get([c, k]);
  }
  function $has(m, k) { return m instanceof Map ? m.has(k) : $B.has([m, k]); }
  function $sortBy(xs, kf, e) {
    const keyed = [];
    for (let i = 0; i < xs.length; i++) keyed.push({ k: kf(xs[i], e), i, v: xs[i] });
    keyed.sort((a, b) => compareKeys(a.k, b.k) || a.i - b.i);
    return keyed.map(x => x.v);
  }
  async function $sortByA(xs, kf, e) {
    const keyed = [];
    for (let i = 0; i < xs.length; i++) keyed.push({ k: await kf(xs[i], e), i, v: xs[i] });
    keyed.sort((a, b) => compareKeys(a.k, b.k) || a.i - b.i);
    return keyed.map(x => x.v);
  }
  // < <= > >= when the checker could not pin both sides to num: strs compare by code point
  function $lt(a, b) { return typeof a === 'string' ? compareText(a, b) < 0 : a < b; }
  function $le(a, b) { return typeof a === 'string' ? compareText(a, b) <= 0 : a <= b; }
  function $gt(a, b) { return typeof a === 'string' ? compareText(a, b) > 0 : a > b; }
  function $ge(a, b) { return typeof a === 'string' ? compareText(a, b) >= 0 : a >= b; }
  function $map(xs, f, e) { const out = []; for (const x of [...xs]) out.push(f(x, e)); return out; }
  async function $mapA(xs, f, e) { const out = []; for (const x of [...xs]) out.push(await f(x, e)); return out; }
  function $filter(xs, f, e) { const out = []; for (const x of [...xs]) if (f(x, e)) out.push(x); return out; }
  async function $filterA(xs, f, e) { const out = []; for (const x of [...xs]) if (await f(x, e)) out.push(x); return out; }
  function $any(xs, f, e) { for (const x of [...xs]) if (f(x, e)) return true; return false; }
  async function $anyA(xs, f, e) { for (const x of [...xs]) if (await f(x, e)) return true; return false; }
  function $all(xs, f, e) { for (const x of [...xs]) if (!f(x, e)) return false; return true; }
  async function $allA(xs, f, e) { for (const x of [...xs]) if (!(await f(x, e))) return false; return true; }
  function $count(xs, f, e) { let n = 0; for (const x of [...xs]) if (f(x, e)) n++; return n; }
  async function $countA(xs, f, e) { let n = 0; for (const x of [...xs]) if (await f(x, e)) n++; return n; }
  function $fold(xs, acc, f, e) { for (const x of [...xs]) acc = f(acc, x, e); return acc; }
  async function $foldA(xs, acc, f, e) { for (const x of [...xs]) acc = await f(acc, x, e); return acc; }
  // host builtins (serve) call back into Vow fns/lambdas; each call gets a fresh step budget
  const $ctx = {
    invoke: async (fnVal, args) => {
      $S = 0;
      const d0 = $D, l0 = $ln;
      try { return await fnVal(...args, fnVal.fn ?? fnVal.lambda); }
      finally { $D = d0; $ln = l0; }
    },
  };
  // run(args, stdin) from a test: the top-level code again, in a fresh state (stack, steps,
  // top-level lets are reassigned by $main), with print/args/readLine/readAll swapped for the
  // test's I/O. Same contract as the interpreter's run builtin (lang/interp.js).
  async function $run(argv, stdin, node) {
    const lines = [];
    const saved = { print: $B.print, args: $B.args, readLine: $B.readLine, readAll: $B.readAll };
    const d0 = $D, l0 = $ln, s0 = $S;
    Object.assign($B, testIO(argv, stdin, lines));
    $D = 0; $ln = 1; $S = 0;
    try { await $main(); }
    catch (e) { throw runTrap(e, node, $src); }
    finally { Object.assign($B, saved); $D = d0; $ln = l0; $S = s0; }
    return runOutput(lines);
  }
}
/* eslint-enable no-undef */
const preludeSrc = (() => {
  const s = PRELUDE.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

function hasCall(node) {
  if (node.t === 'Call') return true;
  if (node.t === 'Lambda') return false;
  let found = false;
  forEachChild(node, (c) => { if (!found && hasCall(c)) found = true; });
  return found;
}

class Scope {
  constructor(parent) { this.parent = parent; this.vars = new Map(); }
  lookup(name) {
    for (let s = this; s; s = s.parent) { const v = s.vars.get(name); if (v) return v; }
    return null;
  }
}

const FAST = { len: 1, push: 2, ok: 1, err: 1, str: 1, abs: 1, floor: 1, min: 2, max: 2, has: 2, get: 2, keys: 1 };

export function compile(src, ast, opts = {}) {
  const MAXS = opts.maxSteps ?? 1_000_000;
  const MAXD = opts.maxDepth ?? 200;
  const builtinNames = new Set(opts.builtinNames ?? BUILTIN_NAMES);
  const nodes = [];
  const nodeIds = new Map();
  const nref = (n) => {
    let i = nodeIds.get(n);
    if (i === undefined) { i = nodes.length; nodes.push(n); nodeIds.set(n, i); }
    return `$n${i}`;
  };
  let uid = 0;
  const tmp = () => `$t${uid++}`;
  // module fns have internal names like "geometry.area": not JS identifiers
  const jsName = (n) => `${n.replace(/[^A-Za-z0-9_$]/g, '_')}_${uid++}`;
  // which file a frame belongs to, for call-stack notes (multi-file programs only)
  const fileOf = (node) => node.fileLabel ? ` $F[$D] = ${JSON.stringify(node.fileLabel)};` : '';
  const usedB = new Set();
  const bref = (name) => { if (SWAPPABLE.has(name)) return `$B.${name}`; usedB.add(name); return `$B_${name}`; };
  const unsupported = (what) => { throw new Unsupported(what); };

  const { asyncFns, allAsync } = analyzeAsync(ast);
  const fnIsAsync = (decl) => allAsync || asyncFns.has(decl.name);

  const globals = new Scope(null);
  // imported modules' fns see only module fns (internal dotted names), never the main file's
  // globals: the same rule as the checker and interpreter (lang/modules.js)
  const modGlobals = new Scope(null);
  const isModFn = (f) => f.mod && !f.mod.isEntry;
  const fnDecls = ast.stmts.filter(s => s.t === 'Fn');
  for (const f of fnDecls) {
    const v = { kind: 'fn', js: jsName('f_' + f.name), decl: f };
    globals.vars.set(f.name, v);
    if (isModFn(f)) modGlobals.vars.set(f.name, v);
  }
  const globalLets = [];
  for (const s of ast.stmts) {
    if (s.t !== 'Let') continue;
    const cur = globals.vars.get(s.name);
    if (cur && cur.kind === 'fn') unsupported(`top-level let ${s.name} shadows fn ${s.name}`);
    if (!cur) { const js = jsName(s.name); globals.vars.set(s.name, { kind: 'var', js }); globalLets.push(js); }
  }

  const step = (s) => `if (++$S > ${MAXS}) $stepTrap(${nref(s)}); $ln = ${s.pos.line};`;
  const isLit = (e) => e.t === 'Num' || e.t === 'Str' || e.t === 'Bool';
  const aw = (code, need, fx) => {
    if (!need) return code;
    if (!fx.async) unsupported('await needed in a sync context');
    return `(await ${code})`;
  };
  const ret = (fx, x) => {
    if (fx.kind === 'fn') return fx.hasEnsures ? `$ret(${x})` : `$pop(${x})`;
    if (fx.kind === 'lambda') return `$pop(${x})`;
    return unsupported(`return inside ${fx.kind}`);
  };
  const declare = (scope, name) => {
    const js = jsName(name);
    scope.vars.set(name, { kind: 'var', js });
    return js;
  };

  // ---------- expressions ----------

  // Compile several operands left to right. When a later operand needs pre-statements, the
  // earlier ones are materialised first so evaluation order matches the interpreter.
  function cExprs(list, scope, out, fx) {
    const bufs = list.map((e) => { const o = []; return { e, o, x: cExpr(e, scope, o, fx) }; });
    let last = -1;
    bufs.forEach((b, i) => { if (b.o.length) last = i; });
    return bufs.map((b, i) => {
      out.push(...b.o);
      if (i < last && !isLit(b.e)) { const t = tmp(); out.push(`const ${t} = ${b.x};`); return t; }
      return b.x;
    });
  }

  // arms of a match: if / else-if chain on the subject held in S
  function armChain(arms, S, build) {
    let code = '';
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const c = arm.tag === 'wild' ? null
        : arm.tag === 'lit' ? `${S} === ${JSON.stringify(arm.value)}`
          : `${S}.tag === ${JSON.stringify(arm.tag)}`;
      const body = build(arm).join('\n');
      if (c === null) { code += (i ? ' else {\n' : '{\n') + body + '\n}'; return code; }
      code += (i ? ' else ' : '') + `if (${c}) {\n${body}\n}`;
    }
    return code;
  }

  // a value-producing block (match arm / if-else branch): statements, then T = last expr
  function cValueBlock(block, scope, out, fx, T) {
    const stmts = block.stmts;
    const last = stmts[stmts.length - 1];
    const n = last && last.t === 'ExprStmt' ? stmts.length - 1 : stmts.length;
    for (let i = 0; i < n; i++) cStmt(stmts[i], scope, out, fx);
    if (n < stmts.length) { const x = cExpr(last.expr, scope, out, fx); out.push(`${T} = ${x};`); }
  }

  function cExpr(e, scope, out, fx) {
    switch (e.t) {
      case 'Num': return Number.isFinite(e.value) ? `(${String(e.value)})` : unsupported('non-finite literal');
      case 'Str': return JSON.stringify(e.value);
      case 'Bool': return e.value ? 'true' : 'false';
      case 'Ident': {
        const v = scope.lookup(e.name);
        if (!v) unsupported(`unresolved name ${e.name}`);
        return v.js;
      }
      case 'ListLit': return `[${cExprs(e.items, scope, out, fx).join(', ')}]`;
      case 'MapLit': {
        if (!e.entries.length) return 'new Map()';
        const xs = cExprs(e.entries.map(en => en.value), scope, out, fx);
        return `new Map([${e.entries.map((en, i) => `[${JSON.stringify(en.key)}, ${xs[i]}]`).join(', ')}])`;
      }
      case 'Unary': {
        const x = cExpr(e.operand, scope, out, fx);
        return e.op === 'not' ? `(!${x})` : `(-${x})`;
      }
      case 'Binary': {
        if (e.op === 'and' || e.op === 'or') {
          const l = cExpr(e.left, scope, out, fx);
          const ro = [];
          const r = cExpr(e.right, scope, ro, fx);
          if (!ro.length) return e.op === 'and' ? `(${l} ? ${r} : false)` : `(${l} ? true : ${r})`;
          const T = tmp();
          out.push(`let ${T};`);
          if (e.op === 'and') out.push(`if (${l}) {`, ...ro, `${T} = ${r};`, `} else ${T} = false;`);
          else out.push(`if (${l}) ${T} = true; else {`, ...ro, `${T} = ${r};`, `}`);
          return T;
        }
        const [l, r] = cExprs([e.left, e.right], scope, out, fx);
        switch (e.op) {
          case '+': case '-': case '*':
            return `(${l} ${e.op} ${r})`;
          case '<': case '<=': case '>': case '>=': {
            // the checker tags each comparison: 'num' needs no dispatch, 'str' / unknown go by code point
            if (e.cmp === 'num') return `(${l} ${e.op} ${r})`;
            const h = { '<': '$lt', '<=': '$le', '>': '$gt', '>=': '$ge' }[e.op];
            return e.cmp === 'str' ? `(compareText(${l}, ${r}) ${e.op} 0)` : `${h}(${l}, ${r})`;
          }
          case '/': return `$div(${l}, ${r}, ${nref(e)})`;
          case '%': return `$mod(${l}, ${r}, ${nref(e)})`;
          case '==': return (isLit(e.left) || isLit(e.right)) ? `(${l} === ${r})` : `$eq(${l}, ${r})`;
          case '!=': return (isLit(e.left) || isLit(e.right)) ? `(${l} !== ${r})` : `(!$eq(${l}, ${r}))`;
        }
        return unsupported(`operator ${e.op}`);
      }
      case 'Index': {
        const [t, k] = cExprs([e.target, e.index], scope, out, fx);
        return `$idx(${t}, ${k}, ${nref(e)})`;
      }
      case 'Call': return cCall(e, scope, out, fx);
      case 'Match': {
        const subj = cExpr(e.subject, scope, out, fx);
        const T = tmp(), S = tmp();
        out.push(`let ${T};`, `const ${S} = ${subj};`);
        out.push(armChain(e.arms, S, (arm) => {
          const o = [];
          const inner = new Scope(scope);
          if (arm.binder) o.push(`let ${declare(inner, arm.binder)} = ${S}.val;`);
          if (arm.body.t === 'Block') cValueBlock(arm.body, new Scope(inner), o, fx, T);
          else { const x = cExpr(arm.body, inner, o, fx); o.push(`${T} = ${x};`); }
          return o;
        }));
        return T;
      }
      case 'IfExpr': {
        const T = tmp();
        out.push(`let ${T};`);
        const chain = (st, o) => {
          const c = cExpr(st.cond, scope, o, fx);
          const th = [];
          cValueBlock(st.then, new Scope(scope), th, fx, T);
          const el = [];
          if (st.alt.t === 'If') chain(st.alt, el);
          else cValueBlock(st.alt, new Scope(scope), el, fx, T);
          o.push(`if (${c}) {`, ...th, `} else {`, ...el, `}`);
        };
        chain(e.stmt, out);
        return T;
      }
      case 'Try': {
        const x = cExpr(e.operand, scope, out, fx);
        const T = tmp();
        out.push(`const ${T} = ${x};`, `if (${T}.tag !== "ok") return ${ret(fx, T)};`);
        return `${T}.val`;
      }
      case 'StructLit': {
        const xs = cExprs(e.fields.map(f => f.value), scope, out, fx);
        return `({ __struct: ${JSON.stringify(e.name)}, fields: new Map([${e.fields.map((f, i) => `[${JSON.stringify(f.name)}, ${xs[i]}]`).join(', ')}]) })`;
      }
      case 'Field': {
        const x = cExpr(e.target, scope, out, fx);
        return `(${x}).fields.get(${JSON.stringify(e.name)})`;
      }
      case 'InterpStr': {
        const exprParts = e.parts.filter(p => p.kind !== 'str').map(p => p.expr);
        const xs = cExprs(exprParts, scope, out, fx);
        let j = 0;
        const pieces = e.parts.map(p => p.kind === 'str' ? JSON.stringify(p.value) : `$disp(${xs[j++]})`);
        return `(${['""', ...pieces].join(' + ')})`;
      }
      case 'Lambda': {
        const inner = new Scope(scope);
        const ps = e.params.map(p => declare(inner, p.name));
        const lfx = { kind: 'lambda', async: allAsync };
        const body = [];
        cBlock(e.body.stmts, new Scope(inner), body, lfx);
        return `$lam(${allAsync ? 'async ' : ''}(${[...ps, '$c'].join(', ')}) => {\n`
          + `if ($D >= ${MAXD}) $depthTrap($c);\n$L[$D] = $ln; $N[++$D] = "(lambda)";${fileOf(e)}\n`
          + body.join('\n') + `\nreturn $pop($U);\n}, ${nref(e)})`;
      }
    }
    return unsupported(`expression ${e.t}`);
  }

  function cCall(e, scope, out, fx) {
    const target = scope.lookup(e.callee);
    const args = cExprs(e.args, scope, out, fx);
    const nr = nref(e);
    if (target && target.kind === 'var') {
      // the interpreter reads the callee variable AFTER evaluating the arguments
      if (e.args.some(hasCall) && !args.every(a => /^\$t\d+$/.test(a))) {
        const ts = args.map(() => tmp());
        out.push(`const ${ts.map((t, i) => `${t} = ${args[i]}`).join(', ')};`);
        args.splice(0, args.length, ...ts);
      }
      const dyn = aw(`${target.js}(${[...args, nr].join(', ')})`, allAsync, fx);
      if (!builtinNames.has(e.callee)) return dyn;
      // the interpreter calls a variable only when it holds a fn/lambda; otherwise the name
      // still means the builtin (`let lines = lines(t)` and then `lines(u)` later)
      if (e.callee === 'sortBy') unsupported('variable named sortBy');
      const ts = args.map(() => tmp());
      if (ts.length) out.push(`const ${ts.map((t, i) => `${t} = ${args[i]}`).join(', ')};`);
      // a lambda variable named like a higher-order builtin but with another arity: the checker
      // only lets it be called as that lambda, so the builtin branch is unreachable
      const viaB = (e.callee in HIGHER_ORDER && ts.length !== HIGHER_ORDER[e.callee])
        ? '$U' : cBuiltin(e.callee, ts, nr, fx);
      const viaV = aw(`${target.js}(${[...ts, nr].join(', ')})`, allAsync, fx);
      return `(typeof ${target.js} === 'function' ? ${viaV} : ${viaB})`;
    }
    if (target && target.kind === 'fn') return aw(`${target.js}(${[...args, nr].join(', ')})`, fnIsAsync(target.decl), fx);
    return cBuiltin(e.callee, args, nr, fx);
  }

  function cBuiltin(name, args, nr, fx) {
    if (!builtinNames.has(name)) unsupported(`unknown builtin ${name}`);
    if (name === 'run') {
      if (args.length !== 2) unsupported('run arity');
      return aw(`$run(${args[0]}, ${args[1]}, ${nr})`, true, fx);
    }
    if (name === 'sortBy') {
      if (args.length !== 2) unsupported('sortBy arity');
      return allAsync ? aw(`$sortByA(${args[0]}, ${args[1]}, ${nr})`, true, fx) : `$sortBy(${args[0]}, ${args[1]}, ${nr})`;
    }
    if (name in HIGHER_ORDER) {
      if (args.length !== HIGHER_ORDER[name]) unsupported(`${name} arity`);
      return allAsync ? aw(`$${name}A(${args.join(', ')}, ${nr})`, true, fx) : `$${name}(${args.join(', ')}, ${nr})`;
    }
    if (FAST[name] === args.length) {
      const [a, b] = args;
      switch (name) {
        case 'len': return `(${a}).length`;
        case 'push': return `$push(${a}, ${b})`;
        case 'ok': return `({ tag: "ok", val: ${a} })`;
        case 'err': return `({ tag: "err", val: ${a} })`;
        case 'str': return `$disp(${a})`;
        case 'abs': return `Math.abs(${a})`;
        case 'floor': return `Math.floor(${a})`;
        case 'min': return `Math.min(${a}, ${b})`;
        case 'max': return `Math.max(${a}, ${b})`;
        case 'has': return `$has(${a}, ${b})`;
        case 'get': return `$get(${a}, ${b})`;
        case 'keys': return `[...(${a}).keys()]`;
      }
    }
    const call = TRAP_BUILTINS.has(name)
      ? `$Bt(${bref(name)}, [${args.join(', ')}], ${nr})`
      : `${bref(name)}([${args.join(', ')}], ${nr}, $ctx)`;
    return aw(call, ASYNC_BUILTINS.has(name), fx);
  }

  // ---------- statements ----------

  function cBlock(stmts, scope, out, fx) { for (const s of stmts) cStmt(s, scope, out, fx); }

  function cStmt(s, scope, out, fx) {
    switch (s.t) {
      case 'Fn':
        if (scope === globals) return; // hoisted
        return unsupported('nested fn declaration');
      case 'Struct':
        if (scope === globals) return;
        return unsupported('nested struct');
      case 'Test':
        if (scope === globals) return; // never part of $main; compiled separately below
        return unsupported('nested test');
    }
    out.push(step(s));
    switch (s.t) {
      case 'Let': {
        if (s.rec && !scope.vars.get(s.name)) { // recursive closure: bind the name before the body is compiled
          const js = declare(scope, s.name);
          out.push(`let ${js};`);
          const x = cExpr(s.expr, scope, out, fx);
          out.push(`${js} = ${x};`);
          return;
        }
        const x = cExpr(s.expr, scope, out, fx);
        const cur = scope.vars.get(s.name);
        if (cur) {
          if (cur.kind !== 'var') unsupported(`let ${s.name} over a fn`);
          out.push(`${cur.js} = ${x};`);
        } else out.push(`let ${declare(scope, s.name)} = ${x};`);
        return;
      }
      case 'Assign': {
        const tg = s.target;
        if (tg.t === 'Ident') {
          const x = cExpr(s.value, scope, out, fx);
          const v = scope.lookup(tg.name);
          if (!v || v.kind !== 'var') unsupported(`assignment to ${tg.name}`);
          out.push(`${v.js} = ${x};`);
          return;
        }
        // the interpreter evaluates the value first, then the target (then the index)
        if (tg.t === 'Field') {
          const x = cExpr(s.value, scope, out, fx);
          const V = tmp();
          out.push(`const ${V} = ${x};`);
          const obj = cExpr(tg.target, scope, out, fx);
          out.push(`(${obj}).fields.set(${JSON.stringify(tg.name)}, ${V});`);
          return;
        }
        if (tg.t === 'Index') {
          const x = cExpr(s.value, scope, out, fx);
          const V = tmp();
          out.push(`const ${V} = ${x};`);
          const [t, k] = cExprs([tg.target, tg.index], scope, out, fx);
          out.push(`$setIdx(${t}, ${k}, ${V}, ${nref(tg)});`);
          return;
        }
        return unsupported(`assignment target ${tg.t}`);
      }
      case 'ExprStmt': {
        const x = cExpr(s.expr, scope, out, fx);
        out.push(`(${x});`);
        return;
      }
      case 'If': {
        const c = cExpr(s.cond, scope, out, fx);
        const th = [step(s.then)];
        cBlock(s.then.stmts, new Scope(scope), th, fx);
        let code = `if (${c}) {\n${th.join('\n')}\n}`;
        if (s.alt) {
          const el = [];
          if (s.alt.t === 'If') cStmt(s.alt, scope, el, fx);
          else { el.push(step(s.alt)); cBlock(s.alt.stmts, new Scope(scope), el, fx); }
          code += ` else {\n${el.join('\n')}\n}`;
        }
        out.push(code);
        return;
      }
      case 'While': {
        const co = [];
        const c = cExpr(s.cond, scope, co, fx);
        const body = [];
        cBlock(s.body.stmts, new Scope(scope), body, fx);
        if (!co.length) out.push(`while (${c}) {`, ...body, `}`);
        else out.push(`while (true) {`, ...co, `if (!(${c})) break;`, `{`, ...body, `}`, `}`);
        return;
      }
      case 'For': {
        const it = s.iter;
        const isRange = it.t === 'Call' && it.callee === 'range' && it.args.length === 2 && !scope.lookup('range');
        if (isRange) {
          const [a, b] = cExprs(it.args, scope, out, fx);
          const A = tmp(), B = tmp(), N = tmp(), S0 = tmp(), K = tmp();
          const inner = new Scope(scope);
          const bj = declare(inner, s.binder);
          const body = [];
          cBlock(s.body.stmts, inner, body, fx);
          out.push(`const ${A} = ${a}, ${B} = ${b};`,
            `const ${N} = Math.max(0, Math.floor(${B}) - Math.ceil(${A}));`,
            `if (${N} > 1000000) $Bt(${bref('range')}, [${A}, ${B}], ${nref(it)});`,
            `const ${S0} = Math.ceil(${A});`,
            `for (let ${K} = 0; ${K} < ${N}; ${K}++) {`, `let ${bj} = ${S0} + ${K};`, ...body, `}`);
        } else {
          const x = cExpr(it, scope, out, fx);
          const T = tmp();
          const inner = new Scope(scope);
          const bj = declare(inner, s.binder);
          const body = [];
          cBlock(s.body.stmts, inner, body, fx);
          out.push(`for (const ${T} of [...${x}]) {`, `let ${bj} = ${T};`, ...body, `}`);
        }
        return;
      }
      case 'Return': {
        if (fx.kind === 'top' || fx.kind === 'test') { // a bare return ends the program / the test
          if (s.value) { const x = cExpr(s.value, scope, out, fx); out.push(`(${x});`); }
          out.push('return;');
          return;
        }
        const x = s.value ? cExpr(s.value, scope, out, fx) : '$U';
        out.push(`return ${ret(fx, x)};`);
        return;
      }
      case 'Break': out.push('break;'); return;
      case 'Continue': out.push('continue;'); return;
      case 'Block': cBlock(s.stmts, new Scope(scope), out, fx); return;
      case 'MatchStmt': {
        const m = s.match;
        const subj = cExpr(m.subject, scope, out, fx);
        const S = tmp();
        out.push(`const ${S} = ${subj};`);
        out.push(armChain(m.arms, S, (arm) => {
          const o = [];
          const inner = new Scope(scope);
          if (arm.binder) o.push(`let ${declare(inner, arm.binder)} = ${S}.val;`);
          if (arm.body.t === 'Block') cBlock(arm.body.stmts, inner, o, fx);
          else { const x = cExpr(arm.body, inner, o, fx); o.push(`(${x});`); }
          return o;
        }));
        return;
      }
    }
    return unsupported(`statement ${s.t}`);
  }

  // ---------- functions ----------

  function cFn(decl) {
    const g = globals.vars.get(decl.name);
    const isAsync = fnIsAsync(decl);
    const pscope = new Scope(isModFn(decl) ? modGlobals : globals);
    const ps = decl.params.map(p => declare(pscope, p.name));
    const contracts = decl.expects.length || decl.ensures.length;
    const out = [`${isAsync ? 'async ' : ''}function ${g.js}(${[...ps, '$c'].join(', ')}) {`,
      `if ($D >= ${MAXD}) $depthTrap($c);`];
    if (contracts) out.push(`const $args = [${ps.join(', ')}];`);
    const cfx = { kind: 'contract', async: isAsync };
    for (const cond of decl.expects) {
      const o = [];
      const x = cExpr(cond, pscope, o, cfx);
      out.push(...o, `if (!(${x})) $expectFail(${nref(decl)}, ${nref(cond)}, $args, $c);`);
    }
    out.push(`$L[$D] = $ln; $N[++$D] = ${JSON.stringify(decl.name)};${fileOf(decl)}`);
    if (decl.ensures.length) {
      const escope = new Scope(pscope);
      escope.vars.set('result', { kind: 'var', js: '$r' });
      const eo = [`const $ret = ${isAsync ? 'async ' : ''}($r) => {`, '$ln = $L[--$D];'];
      for (const cond of decl.ensures) {
        const o = [];
        const x = cExpr(cond, escope, o, cfx);
        eo.push(...o, `if (!(${x})) $ensureFail(${nref(decl)}, ${nref(cond)}, $r, $args);`);
      }
      eo.push('return $r;', '};');
      out.push(...eo);
    }
    const fx = { kind: 'fn', async: isAsync, hasEnsures: decl.ensures.length > 0 };
    cBlock(decl.body.stmts, new Scope(pscope), out, fx);
    out.push(`return ${ret(fx, '$U')};`, '}', `${g.js}.fn = ${nref(decl)};`);
    return out.join('\n');
  }

  const fnCode = fnDecls.map(cFn);
  const mainOut = [];
  cBlock(ast.stmts, globals, mainOut, { kind: 'top', async: true });
  // test blocks: one async function each, started from a fresh stack and step budget
  // (a trap in an earlier test leaves $D raised, so every test resets it)
  const testCode = ast.stmts.filter(s => s.t === 'Test').map((t) => {
    const out = [];
    cBlock(t.body.stmts, new Scope(globals), out, { kind: 'test', async: true });
    return `{ name: ${JSON.stringify(t.name)}, node: ${nref(t)}, run: async () => {\n$D = 0; $ln = 1; $S = 0;\n${out.join('\n')}\n} }`;
  });

  const code = [
    '"use strict";',
    'const { $B, display, deepEq, isJson, compareText, compareKeys, UNIT: $U, VowError, nodeLoc, src: $src, testIO, runOutput, runTrap } = $rt;',
    `const $MAXS = ${MAXS}, $MAXD = ${MAXD};`,
    'let $D = 0, $S = 0, $ln = 1;',
    "const $L = [0], $N = ['(top level)'], $F = [];",
    preludeSrc,
    ...nodes.map((_, i) => `const $n${i} = $nodes[${i}];`),
    ...[...usedB].map(n => `const $B_${n} = $B.${n};`),
    globalLets.length ? `let ${globalLets.join(', ')};` : '',
    ...fnCode,
    `async function $main() {\n${mainOut.join('\n')}\n}`,
    `return { main: $main, tests: [${testCode.join(',\n')}] };`,
  ].join('\n');
  return { code, nodes };
}
