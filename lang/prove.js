// Vow static contract prover (v0.7) — runs after type checking.
// Conservative abstract interpretation over constants and numeric intervals.
// It only acts on certainties: an expects no call can ever satisfy, an
// ensures a return can never keep, a division that is always by zero.
// Anything uncertain is left to the runtime contract checks unchanged.

import { VowError, nodeLoc } from './diagnostics.js';

const INF = Infinity;
// Numeric facts are intervals; loOpen/hiOpen mark strict bounds (n > 0 is (0, inf)).
const num = (lo, hi, loOpen = false, hiOpen = false) => ({ k: 'num', lo, hi, loOpen, hiOpen });
const FULL = () => num(-INF, INF);
const isConstNum = (a) => a != null && a.k === 'num' && a.lo === a.hi && !a.loOpen && !a.hiOpen;

function neg(a) { return num(-a.hi, -a.lo, a.hiOpen, a.loOpen); }
function add(a, b) {
  const lo = a.lo + b.lo, hi = a.hi + b.hi;
  if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
  return num(lo, hi, a.loOpen || b.loOpen, a.hiOpen || b.hiOpen);
}
function mul(a, b) {
  // scaling by a nonzero constant keeps infinities and open bounds exact
  const scale = (x, c) => c > 0
    ? num(x.lo * c, x.hi * c, x.loOpen, x.hiOpen)
    : num(x.hi * c, x.lo * c, x.hiOpen, x.loOpen);
  if (isConstNum(b)) return b.lo === 0 ? num(0, 0) : scale(a, b.lo);
  if (isConstNum(a)) return a.lo === 0 ? num(0, 0) : scale(b, a.lo);
  if (![a.lo, a.hi, b.lo, b.hi].every(Number.isFinite)) return null;
  const ps = [a.lo * b.lo, a.lo * b.hi, a.hi * b.lo, a.hi * b.hi];
  return num(Math.min(...ps), Math.max(...ps)); // closed hull is a superset — sound
}

// every x in a is strictly below / at-or-below every y in b
const allBelow = (a, b) => a.hi < b.lo || (a.hi === b.lo && (a.hiOpen || b.loOpen));
const allBelowEq = (a, b) => a.hi <= b.lo;

function compareNums(op, a, b) { // -> true | false | null (unknown)
  switch (op) {
    case '<': return allBelow(a, b) ? true : allBelowEq(b, a) ? false : null;
    case '<=': return allBelowEq(a, b) ? true : allBelow(b, a) ? false : null;
    case '>': return compareNums('<', b, a);
    case '>=': return compareNums('<=', b, a);
    case '==':
      if (isConstNum(a) && isConstNum(b)) return a.lo === b.lo;
      return allBelow(a, b) || allBelow(b, a) ? false : null;
    case '!=': { const r = compareNums('==', a, b); return r == null ? null : !r; }
  }
  return null;
}

function intersect(a, b) {
  let lo = a.lo, loOpen = a.loOpen, hi = a.hi, hiOpen = a.hiOpen;
  if (b.lo > lo) { lo = b.lo; loOpen = b.loOpen; } else if (b.lo === lo) loOpen = loOpen || b.loOpen;
  if (b.hi < hi) { hi = b.hi; hiOpen = b.hiOpen; } else if (b.hi === hi) hiOpen = hiOpen || b.hiOpen;
  if (lo > hi || (lo === hi && (loOpen || hiOpen))) return null; // contradiction -> treat as unknown
  return num(lo, hi, loOpen, hiOpen);
}

function hull(a, b) { // least fact containing both, or null
  if (a == null || b == null || a.k !== b.k) return null;
  if (a.k === 'str' || a.k === 'bool') return a.v === b.v ? a : null;
  let lo, loOpen, hi, hiOpen;
  if (a.lo < b.lo) { lo = a.lo; loOpen = a.loOpen; } else if (b.lo < a.lo) { lo = b.lo; loOpen = b.loOpen; } else { lo = a.lo; loOpen = a.loOpen && b.loOpen; }
  if (a.hi > b.hi) { hi = a.hi; hiOpen = a.hiOpen; } else if (b.hi > a.hi) { hi = b.hi; hiOpen = b.hiOpen; } else { hi = a.hi; hiOpen = a.hiOpen && b.hiOpen; }
  return num(lo, hi, loOpen, hiOpen);
}

function describe(a) {
  if (a.k === 'str') return JSON.stringify(a.v);
  if (a.k === 'bool') return String(a.v);
  if (isConstNum(a)) return `always ${a.lo}`;
  if (a.lo === -INF && a.hi === INF) return 'unknown';
  if (a.lo === -INF) return `always ${a.hiOpen ? '<' : '<='} ${a.hi}`;
  if (a.hi === INF) return `always ${a.loOpen ? '>' : '>='} ${a.lo}`;
  return `always between ${a.lo}${a.loOpen ? ' (exclusive)' : ''} and ${a.hi}${a.hiOpen ? ' (exclusive)' : ''}`;
}

function walkAll(node, visit) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walkAll(n, visit); return; }
  if (typeof node.t === 'string') visit(node);
  for (const k of Object.keys(node)) {
    if (k === 'pos' || k === 'start' || k === 'end' || k === 'tok' || k.endsWith('Tok')) continue;
    walkAll(node[k], visit);
  }
}

function collectAssigned(root, acc = new Set()) {
  walkAll(root, (n) => {
    if (n.t === 'Assign' && n.target && n.target.t === 'Ident') acc.add(n.target.name);
    if (n.t === 'For') acc.add(n.binder);
  });
  return acc;
}

const FLIP = { '<': '>=', '<=': '>', '>': '<=', '>=': '<', '==': '!=', '!=': '==' };
const MIRROR = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '==': '==', '!=': '!=' };
const CMP_OPS = ['<', '<=', '>', '>=', '==', '!='];

export function prove(src, ast) {
  let proved = 0;
  let silent = 0;
  let inMod = false;
  const fns = new Map();
  for (const s of ast.stmts) if (s.t === 'Fn') fns.set(s.name, s);

  // Any name assigned inside a fn or lambda body may change whenever a call
  // runs (globals and captured variables are mutable) — those facts are
  // dropped at every call site.
  const mutatedByCalls = new Set();
  walkAll(ast, (n) => { if (n.t === 'Fn' || n.t === 'Lambda') collectAssigned(n.body, mutatedByCalls); });

  function report(node, title, detail, fix) {
    if (silent) return;
    throw new VowError({ kind: 'ContractError', title, ...nodeLoc(src, node), detail, fix });
  }
  const snippet = (node) => {
    const s = src.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
    return s.length > 48 ? s.slice(0, 45) + '...' : s;
  };
  function evalSilent(e, env) {
    silent++;
    try { return evalExpr(e, env); } finally { silent--; }
  }
  function evalCond(cond, env) {
    const v = evalSilent(cond, env);
    return v && v.k === 'bool' ? v.v : null;
  }

  // ---------- abstract evaluation ----------

  function evalExpr(e, env) {
    switch (e.t) {
      case 'Num': return num(e.value, e.value);
      case 'Str': return { k: 'str', v: e.value };
      case 'Bool': return { k: 'bool', v: e.value };
      case 'Ident': return env.get(e.name) ?? null;
      case 'Unary': {
        const v = evalExpr(e.operand, env);
        if (e.op === '-') return v && v.k === 'num' ? neg(v) : null;
        if (e.op === 'not') return v && v.k === 'bool' ? { k: 'bool', v: !v.v } : null;
        return null;
      }
      case 'Binary': return evalBinary(e, env);
      case 'Try': evalExpr(e.operand, env); return null;
      case 'Call': return evalCall(e, env);
      case 'Index': evalExpr(e.target, env); evalExpr(e.index, env); return null;
      case 'Field': evalExpr(e.target, env); return null;
      case 'ListLit': for (const it of e.items) evalExpr(it, env); return null;
      case 'MapLit': for (const en of e.entries) evalExpr(en.value, env); return null;
      case 'StructLit': for (const f of e.fields) evalExpr(f.value, env); return null;
      case 'InterpStr': for (const p of e.parts) if (p.kind === 'expr') evalExpr(p.expr, env); return null;
      case 'Match': {
        evalExpr(e.subject, env);
        for (const arm of e.arms) {
          const armEnv = new Map(env);
          if (arm.binder) armEnv.set(arm.binder, null);
          if (arm.body.t === 'Block') walkStmt(arm.body, armEnv, { fn: null });
          else evalExpr(arm.body, armEnv);
        }
        return null;
      }
      case 'Lambda': walkStmt(e.body, new Map(), { fn: null }); return null;
      default: return null;
    }
  }

  function evalBinary(e, env) {
    const op = e.op;
    if (op === 'and' || op === 'or') {
      const l = evalExpr(e.left, env), r = evalExpr(e.right, env);
      const lb = l && l.k === 'bool' ? l.v : null, rb = r && r.k === 'bool' ? r.v : null;
      if (op === 'and') {
        if (lb === false || rb === false) return { k: 'bool', v: false };
        return lb === true && rb === true ? { k: 'bool', v: true } : null;
      }
      if (lb === true || rb === true) return { k: 'bool', v: true };
      return lb === false && rb === false ? { k: 'bool', v: false } : null;
    }
    const l = evalExpr(e.left, env), r = evalExpr(e.right, env);
    if (op === '/' || op === '%') {
      if (isConstNum(r) && r.lo === 0) {
        report(e, op === '/' ? 'this division is always division by zero' : 'this modulo is always modulo by zero',
          `The right side here is always 0, so this would fail every single time it runs; provable before the program even starts.`,
          e.right.t === 'Num' ? 'use a non-zero value on the right.' : `guard it first: if ${snippet(e.right)} != 0 { ... }`);
      }
      if (isConstNum(l) && isConstNum(r) && r.lo !== 0) {
        const v = op === '/' ? l.lo / r.lo : l.lo % r.lo;
        return num(v, v);
      }
      return null;
    }
    if (op === '+' || op === '-' || op === '*') {
      if (op === '+' && l && r && l.k === 'str' && r.k === 'str') return { k: 'str', v: l.v + r.v };
      if (!l || !r || l.k !== 'num' || r.k !== 'num') return null;
      if (op === '+') return add(l, r);
      if (op === '-') return add(l, neg(r));
      return mul(l, r);
    }
    if (!CMP_OPS.includes(op) || !l || !r) return null;
    if (l.k === 'num' && r.k === 'num') {
      const c = compareNums(op, l, r);
      return c == null ? null : { k: 'bool', v: c };
    }
    if ((op === '==' || op === '!=') && l.k === r.k && (l.k === 'str' || l.k === 'bool')) {
      return { k: 'bool', v: op === '==' ? l.v === r.v : l.v !== r.v };
    }
    return null;
  }

  function evalCall(e, env) {
    const argVals = e.args.map(a => evalExpr(a, env));
    const local = env.has(e.callee);
    // in an imported module a bare name is never another file's fn (lang/modules.js)
    const decl = local || (inMod && !e.callee.includes('.')) ? null : fns.get(e.callee);
    let result = null;
    if (decl && decl.params.length === e.args.length) {
      const penv = new Map();
      decl.params.forEach((p, i) => penv.set(p.name, argVals[i] ?? null));
      for (const cond of decl.expects) {
        const r = evalCond(cond, penv);
        if (r === false) {
          const known = decl.params.map((p, i) => argVals[i] ? `${p.name} is ${describe(argVals[i])}` : null).filter(Boolean);
          report(e, `this call can never satisfy fn ${decl.name}'s contract`,
            `fn ${decl.name} declares:  expects ${snippet(cond)}\nbut at this call ${known.join(' and ')}, so the condition is provably false; this call would break the contract every single time it runs.`,
            `pass arguments that satisfy the contract, or fix fn ${decl.name}'s expects clause if the contract itself is wrong.`);
        }
        if (r === true && !silent) proved++;
      }
      if (decl.ensures.length) {
        penv.set('result', FULL());
        for (const cond of decl.ensures) refineByCond(penv, cond, true);
        const res = penv.get('result');
        if (res && (res.k !== 'num' || res.lo !== -INF || res.hi !== INF)) result = res;
      }
    } else if (!local) {
      result = builtinFact(e.callee, argVals);
    }
    // A call can run code that reassigns globals or captured variables.
    // (so can a builtin that runs a lambda or fn it is handed: map, filter, fold, sortBy, ...)
    const runsCode = e.args.some(a => a.t === 'Lambda' || (a.t === 'Ident' && fns.has(a.name)));
    if (decl || local || runsCode) for (const n of mutatedByCalls) if (env.has(n)) env.set(n, null);
    return result;
  }

  function builtinFact(name, argVals) {
    const a = argVals[0], b = argVals[1];
    switch (name) {
      case 'len': return num(0, INF);
      case 'abs': {
        if (a && a.k === 'num') {
          if (a.lo >= 0) return a;
          if (a.hi <= 0) return neg(a);
          return num(0, Math.max(a.hi, -a.lo));
        }
        return num(0, INF);
      }
      case 'floor':
        return a && a.k === 'num' ? num(Math.floor(a.lo), Math.floor(a.hi)) : null;
      case 'min':
        if (a && b && a.k === 'num' && b.k === 'num') return num(Math.min(a.lo, b.lo), Math.min(a.hi, b.hi));
        return null;
      case 'max':
        if (a && b && a.k === 'num' && b.k === 'num') return num(Math.max(a.lo, b.lo), Math.max(a.hi, b.hi));
        return null;
      default: return null;
    }
  }

  // ---------- condition-based refinement ----------

  function refineByCond(env, cond, truth) {
    if (cond.t === 'Unary' && cond.op === 'not') return refineByCond(env, cond.operand, !truth);
    if (cond.t !== 'Binary') return;
    const op = cond.op;
    if (op === 'and' && truth) { refineByCond(env, cond.left, true); refineByCond(env, cond.right, true); return; }
    if (op === 'or' && !truth) { refineByCond(env, cond.left, false); refineByCond(env, cond.right, false); return; }
    if (!CMP_OPS.includes(op)) return;
    const actual = truth ? op : FLIP[op];
    if (cond.left.t === 'Ident') applyConstraint(env, cond.left.name, actual, evalSilent(cond.right, env));
    if (cond.right.t === 'Ident') applyConstraint(env, cond.right.name, MIRROR[actual], evalSilent(cond.left, env));
  }

  function applyConstraint(env, name, op, bound) {
    if (!bound) return;
    if (bound.k === 'str' || bound.k === 'bool') {
      if (op === '==') env.set(name, bound);
      return;
    }
    let cur = env.get(name);
    if (cur != null && cur.k !== 'num') return;
    if (cur == null) cur = FULL();
    if (op === '!=') {
      if (!isConstNum(bound)) return;
      let { lo, hi, loOpen, hiOpen } = cur;
      if (lo === bound.lo) loOpen = true;
      if (hi === bound.lo) hiOpen = true;
      env.set(name, lo > hi || (lo === hi && (loOpen || hiOpen)) ? null : num(lo, hi, loOpen, hiOpen));
      return;
    }
    let c;
    switch (op) {
      case '<': c = num(-INF, bound.hi, false, true); break;
      case '<=': c = num(-INF, bound.hi, false, bound.hiOpen); break;
      case '>': c = num(bound.lo, INF, true, false); break;
      case '>=': c = num(bound.lo, INF, bound.loOpen, false); break;
      case '==': c = bound; break;
      default: return;
    }
    env.set(name, intersect(cur, c));
  }

  // ---------- statement walk ----------

  function exits(node) {
    switch (node.t) {
      case 'Return': return true;
      case 'Block': return node.stmts.some(exits);
      case 'If': return node.alt != null && exits(node.then) && exits(node.alt);
      case 'MatchStmt': return node.match.arms.every(a => a.body.t === 'Block' && exits(a.body));
      default: return false;
    }
  }

  function mergeInto(env, envs) {
    for (const k of [...env.keys()]) {
      let v = envs[0] ? (envs[0].get(k) ?? null) : null;
      for (let i = 1; i < envs.length && v; i++) v = hull(v, envs[i].get(k) ?? null);
      env.set(k, v ?? null);
    }
  }

  function binderFact(iter, env) {
    if (iter.t === 'Call' && iter.callee === 'range' && iter.args.length === 2 && !env.has('range')) {
      const a = evalSilent(iter.args[0], env), b = evalSilent(iter.args[1], env);
      if (a && b && a.k === 'num' && b.k === 'num' && (a.lo < b.hi)) return num(a.lo, b.hi, a.loOpen, true);
      return null;
    }
    if (iter.t === 'ListLit' && iter.items.length) {
      let acc = null;
      for (const it of iter.items) {
        const v = evalSilent(it, env);
        acc = acc == null ? v : hull(acc, v);
        if (!acc) return null;
      }
      return acc;
    }
    return null;
  }

  function walkStmt(s, env, ctx) {
    switch (s.t) {
      case 'Fn': case 'Struct': case 'Break': return;
      case 'Block': for (const st of s.stmts) walkStmt(st, env, ctx); return;
      case 'Let': env.set(s.name, evalExpr(s.expr, env)); return;
      case 'Assign': {
        const v = evalExpr(s.value, env);
        if (s.target.t === 'Ident') env.set(s.target.name, v);
        else evalExpr(s.target, env);
        return;
      }
      case 'ExprStmt': evalExpr(s.expr, env); return;
      case 'Return': {
        const v = s.value ? evalExpr(s.value, env) : null;
        if (ctx.fn && ctx.fn.ensures.length) {
          const env2 = new Map(env);
          env2.set('result', v);
          for (const cond of ctx.fn.ensures) {
            const r = evalCond(cond, env2);
            if (r === false) report(s.value ?? s, `fn ${ctx.fn.name} provably breaks its own ensures`,
              `fn ${ctx.fn.name} declares:  ensures ${snippet(cond)}\nbut this return makes result ${v ? describe(v) : 'nothing (unit)'}, so the promise is false before the program even runs. The bug is INSIDE fn ${ctx.fn.name}.`,
              'return a value that satisfies the ensures clause, or fix the clause if the promise itself is wrong.');
            if (r === true) proved++;
          }
        }
        return;
      }
      case 'If': {
        evalExpr(s.cond, env);
        const thenEnv = new Map(env);
        refineByCond(thenEnv, s.cond, true);
        walkStmt(s.then, thenEnv, ctx);
        const altEnv = new Map(env);
        refineByCond(altEnv, s.cond, false);
        if (s.alt) walkStmt(s.alt, altEnv, ctx);
        const live = [];
        if (!exits(s.then)) live.push(thenEnv);
        if (!(s.alt && exits(s.alt))) live.push(altEnv);
        mergeInto(env, live.length ? live : [thenEnv, altEnv]);
        return;
      }
      case 'While': {
        evalExpr(s.cond, env);
        const killed = collectAssigned(s.body);
        const bodyEnv = new Map(env);
        for (const n of killed) if (bodyEnv.has(n)) bodyEnv.set(n, null);
        refineByCond(bodyEnv, s.cond, true);
        walkStmt(s.body, bodyEnv, ctx);
        for (const n of killed) if (env.has(n)) env.set(n, null);
        return;
      }
      case 'For': {
        const fact = binderFact(s.iter, env);
        evalExpr(s.iter, env);
        const killed = collectAssigned(s.body);
        const bodyEnv = new Map(env);
        for (const n of killed) if (bodyEnv.has(n)) bodyEnv.set(n, null);
        bodyEnv.set(s.binder, fact);
        walkStmt(s.body, bodyEnv, ctx);
        for (const n of killed) if (env.has(n)) env.set(n, null);
        return;
      }
      case 'MatchStmt': {
        evalExpr(s.match.subject, env);
        const live = [];
        for (const arm of s.match.arms) {
          const armEnv = new Map(env);
          if (arm.binder) armEnv.set(arm.binder, null);
          if (arm.body.t === 'Block') walkStmt(arm.body, armEnv, ctx);
          else evalExpr(arm.body, armEnv);
          if (!(arm.body.t === 'Block' && exits(arm.body))) live.push(armEnv);
        }
        if (live.length) mergeInto(env, live);
        return;
      }
      default: return;
    }
  }

  // ---------- drive ----------

  const topEnv = new Map();
  for (const s of ast.stmts) {
    inMod = !!(s.mod && !s.mod.isEntry);
    if (s.t === 'Fn') {
      const env = new Map();
      for (const p of s.params) env.set(p.name, null);
      for (const cond of s.expects) refineByCond(env, cond, true);
      walkStmt(s.body, env, { fn: s });
    } else {
      walkStmt(s, topEnv, { fn: null });
    }
  }
  return { proved };
}
