// Vow interpreter — tree-walking, written as generators so the playground
// debugger can pause before every statement. Contracts (expects/ensures)
// are checked at runtime with caller-vs-callee blame in the message.

import { VowError, nodeLoc } from './diagnostics.js';
import { compileRegex } from './checker.js';

export const UNIT = Object.freeze({ __unit: true });

const NORMAL = { sig: 'normal', val: UNIT };

// builtins that call back into Vow code (sortBy is handled separately); they are not in the
// builtin table because they run lambdas, which must go through the generator machinery
export const HIGHER_ORDER = new Set(['map', 'filter', 'any', 'all', 'count', 'fold']);

// Internal early-return signal: '?' and a return inside a match used as a value both
// unwind to the enclosing Vow function, which returns the carried value. At the top
// level it simply ends the program.
class ErrPropagation {
  constructor(val) { this.val = val; }
}
const BREAK = { sig: 'break', val: UNIT };
const CONTINUE = { sig: 'continue', val: UNIT };

class Env {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  lookup(name) {
    // one Map probe per scope (values are never undefined: unit is its own object)
    for (let e = this; e; e = e.parent) { const v = e.vars.get(name); if (v !== undefined) return v; }
    throw new Error(`internal: unbound ${name}`); // checker guarantees this never happens
  }
  find(name) { // like lookup, but a miss is normal (builtin calls) and must not throw
    for (let e = this; e; e = e.parent) { const v = e.vars.get(name); if (v !== undefined) return v; }
    return null;
  }
  assign(name, v) {
    for (let e = this; e; e = e.parent) if (e.vars.get(name) !== undefined) { e.vars.set(name, v); return; }
  }
  declare(name, v) { this.vars.set(name, v); }
}

// constant-time string equality via fixed-length digests (FNV-1a over UTF-16, 4 lanes):
// the loop never exits early, so timing doesn't reveal how much of a guess matched
function digest(str) {
  const lanes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < str.length; i++) {
    for (let l = 0; l < 4; l++) lanes[l] = Math.imul(lanes[l] ^ (str.charCodeAt(i) + l * 131), 16777619) >>> 0;
  }
  return lanes;
}
function sameHash(a, b) {
  const x = digest(a), y = digest(b);
  let diff = a.length ^ b.length;
  for (let l = 0; l < 4; l++) diff |= x[l] ^ y[l];
  return diff === 0;
}

// JSON values are wrapped so a parsed object can never masquerade as a
// Vow map, struct, or Result at runtime.
export const isJson = (v) => v !== null && typeof v === 'object' && '__json' in v;
// Strings are ordered by code point (so "😀" sorts after "ｚ", as ord() would say), not by UTF-16
// unit like JavaScript's <. Surrogates (D800-DFFF) are lifted above every BMP unit: at the first
// differing position that gives exactly the code-point order. Used by <, sort and sortBy.
export function compareText(a, b) {
  const n = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < n; i++) {
    let x = a.charCodeAt(i), y = b.charCodeAt(i);
    if (x === y) continue;
    if (x >= 0xD800 && x <= 0xDFFF) x += 0x2800;
    if (y >= 0xD800 && y <= 0xDFFF) y += 0x2800;
    return x < y ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}
// sortBy keys: str by code point, num (or anything else) by <
export const compareKeys = (a, b) => typeof a === 'string' ? compareText(a, b) : (a < b ? -1 : a > b ? 1 : 0);
// __key: where the value came from (an object key or an array index), so jsonNum("36") can
// say `the JSON value at "age"`; absent for the root of parseJson and for built values
const J = (raw, key) => key === undefined ? { __json: raw } : { __json: raw, __key: key };
// "the JSON value at "age" is a string ("36")": what was found, and where, for jsonNum/jsonStr/jsonBool
function jsonFound(j) {
  const raw = j.__json;
  const where = j.__key === undefined ? 'this JSON value'
    : typeof j.__key === 'number' ? `the JSON value at index ${j.__key}` : `the JSON value at "${j.__key}"`;
  let shown = '';
  if (raw !== null) {
    const s = JSON.stringify(raw);
    shown = ` (${s.length > 40 ? s.slice(0, 37) + '...' : s})`;
  }
  const kind = jsonTypeOf(raw);
  return `${where} is ${kind === 'null' ? 'null' : `${kind === 'object' || kind === 'array' ? 'an' : 'a'} ${kind}${shown}`}`;
}
// jsonMerge(a, b): objects merge key by key (recursively), anything else is replaced by b
function rawJsonMerge(a, b) {
  if (!isJsonObject(a) || !isJsonObject(b)) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = Object.hasOwn(a, k) ? rawJsonMerge(a[k], b[k]) : b[k];
  return out;
}
const jsonTypeOf = (raw) =>
  raw === null ? 'null'
    : Array.isArray(raw) ? 'array'
      : typeof raw === 'object' ? 'object'
        : typeof raw === 'boolean' ? 'bool'
          : typeof raw; // 'number' | 'string'

// str(j) / print(j) / "${j}" on a json value: readable text. A string as-is, a number exactly
// like str(num), true/false, null as "null", arrays and objects as compact JSON.
function jsonText(raw) {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return display(raw);
  return JSON.stringify(raw);
}
// truthy(j): false for null, false, 0, "", [] and {} (empty containers are falsy, unlike JavaScript)
function jsonTruthy(raw) {
  if (raw === null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'object') return Object.keys(raw).length > 0;
  return raw !== false && raw !== 0 && raw !== '';
}
const isJsonObject = (raw) => raw !== null && typeof raw === 'object' && !Array.isArray(raw);

function rawJsonEq(x, y) {
  if (x === y) return true;
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => rawJsonEq(v, y[i]));
  if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
    const kx = Object.keys(x), ky = Object.keys(y);
    return kx.length === ky.length && kx.every(k => k in y && rawJsonEq(x[k], y[k]));
  }
  return false;
}

export function display(v, depth = 0) {
  if (v === UNIT) return '(unit)';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return depth === 0 ? v : JSON.stringify(v);
  if (Array.isArray(v)) {
    if (depth > 3) return '[…]';
    return '[' + v.map(x => display(x, depth + 1)).join(', ') + ']';
  }
  if (v instanceof Map) {
    if (depth > 3) return '{…}';
    return '{' + [...v.entries()].map(([k, x]) => JSON.stringify(k) + ': ' + display(x, depth + 1)).join(', ') + '}';
  }
  if (v && v.__struct) {
    // a struct from a module is internally "geometry.Point"; it prints by its own name
    const name = v.__struct.slice(v.__struct.lastIndexOf('.') + 1);
    if (depth > 3) return name + ' {…}';
    return name + ' { ' + [...v.fields.entries()].map(([k, x]) => k + ': ' + display(x, depth + 1)).join(', ') + ' }';
  }
  if (isJson(v)) return depth === 0 ? jsonText(v.__json) : JSON.stringify(v.__json);
  if (v && v.__response) return `<response ${v.status} ${v.type}>`;
  if (v && v.tag) return `${v.tag}(${display(v.val, depth + 1)})`;
  if (v && v.fn) return `<fn ${v.fn.name}>`;
  if (v && v.lambda) return '<fn>';
  return String(v);
}

export function deepEq(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) { if (!b.has(k) || !deepEq(v, b.get(k))) return false; }
    return true;
  }
  if (a && b && a.__struct && b.__struct) {
    if (a.__struct !== b.__struct) return false;
    for (const [k, v] of a.fields) if (!deepEq(v, b.fields.get(k))) return false;
    return true;
  }
  if (a && b && isJson(a) && isJson(b)) return rawJsonEq(a.__json, b.__json);
  if (a && b && a.tag && b.tag) return a.tag === b.tag && deepEq(a.val, b.val);
  return false;
}

// random() source. With a seed (CLI --seed N / VOW_SEED) it is mulberry32, so a run is
// reproducible and both backends (which share this builtin table) see the same sequence.
// 53 bits per number, like Math.random, so randomInt over a wide range stays uniform.
function makeRandom(seed) {
  if (seed == null) return Math.random;
  let s = Number(seed) >>> 0;
  const next32 = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return () => (next32() * 2097152 + (next32() >>> 11)) / 9007199254740992;
}

const DAY_MS = 86_400_000;
const MAX_DATE_MS = 8.64e15; // the range a JavaScript Date can hold (about 275,000 years)
const pad2 = (n) => String(n).padStart(2, '0');

// parseDate(s): ISO 8601 date or date-time, always UTC unless the text carries an offset.
// Strict: every field is range-checked (no rolling 2024-02-30 over to March).
function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(s.trim());
  const bad = (why) => ({ tag: 'err', val: `"${s}" is not a valid date: ${why}` });
  if (!m) return { tag: 'err', val: `"${s}" is not an ISO date (expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS, optionally ending in Z or an offset like +02:00)` };
  if (m[8] && m[4] === undefined) return bad('a time zone needs a time (YYYY-MM-DDTHH:MM:SSZ)');
  const [y, mo, d, h = 0, mi = 0, sec = 0] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(x => x === undefined ? undefined : Number(x));
  if (mo < 1 || mo > 12) return bad(`month ${mo} is out of range (1-12)`);
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d < 1 || d > dim) return bad(`day ${d} is out of range (${y}-${pad2(mo)} has ${dim} days)`);
  if (h > 23) return bad(`hour ${h} is out of range (0-23)`);
  if (mi > 59) return bad(`minute ${mi} is out of range (0-59)`);
  if (sec > 59) return bad(`second ${sec} is out of range (0-59)`);
  const frac = m[7] ? Math.floor(Number('0.' + m[7]) * 1000) : 0;
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d); // not Date.UTC: that maps years 0-99 to 1900-1999
  dt.setUTCHours(h, mi, sec, frac);
  let ms = dt.getTime();
  if (m[8] && m[8] !== 'Z') {
    const sign = m[8][0] === '-' ? -1 : 1, oh = Number(m[8].slice(1, 3)), om = Number(m[8].slice(4, 6));
    if (oh > 23 || om > 59) return bad(`offset ${m[8]} is out of range`);
    ms -= sign * (oh * 60 + om) * 60_000;
  }
  return { tag: 'ok', val: ms };
}

// ---------- built-in tests (test "name" { ... } blocks; shared by both backends) ----------

// The I/O a program sees inside run(args, stdin) from a test: print is captured into `lines`,
// args() is the given list, readLine/readAll read the given text exactly like the CLI reads
// standard input (a partial last line still counts; \r\n is one newline; err at the end).
export function testIO(argv, stdin, lines) {
  let buf = stdin;
  return {
    print: (args) => { lines.push(args.map(a => display(a)).join(' ')); return UNIT; },
    args: () => [...argv],
    readLine: () => {
      if (buf === '') return { tag: 'err', val: 'end of input' };
      const nl = buf.indexOf('\n');
      let line;
      if (nl >= 0) { line = buf.slice(0, nl); buf = buf.slice(nl + 1); } else { line = buf; buf = ''; }
      return { tag: 'ok', val: line.endsWith('\r') ? line.slice(0, -1) : line };
    },
    readAll: () => { const t = buf; buf = ''; return { tag: 'ok', val: t }; },
  };
}
// what the CLI would have written to stdout: every printed line ends in a newline
export const runOutput = (lines) => lines.map(l => l + '\n').join('');
// a trap inside run(...): the program's own diagnostic, plus where the test called run
export function runTrap(e, node, src) {
  if (e instanceof VowError) {
    const loc = nodeLoc(src, node);
    e.diag.notes = [...(e.diag.notes ?? []), '', `the program trapped inside run(...), called from ${loc.file ? loc.file + ', ' : ''}line ${loc.line} of the test`];
  }
  return e;
}
// the detail of a failed expectEq: both values, and for multi-line text the first line that differs
export function eqDetail(actual, expected) {
  let d = `expected: ${display(expected, 1)}\nactual:   ${display(actual, 1)}`;
  if (typeof actual === 'string' && typeof expected === 'string' && (actual.includes('\n') || expected.includes('\n'))) {
    // a trailing newline leaves an empty last piece: drop it, so the pieces are the printed lines
    const pieces = (t) => { const xs = t.split('\n'); return xs.length > 1 && xs[xs.length - 1] === '' ? xs.slice(0, -1) : xs; };
    const a = pieces(actual), b = pieces(expected);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const show = (xs) => xs[i] === undefined ? 'nothing (the text ends here)' : JSON.stringify(xs[i]);
    d += i === a.length && i === b.length
      ? '\nthe lines are the same; only the newline at the end differs'
      : `\nfirst difference at line ${i + 1}: expected ${show(b)}, actual ${show(a)}`;
  }
  return d;
}

export function createRun(src, ast, opts = {}) {
  const st = {
    out: opts.out ?? (() => {}),
    steps: 0,
    maxSteps: opts.maxSteps ?? 1_000_000,
    maxDepth: opts.maxDepth ?? 200, // safe on a default JS stack; the CLI runs on a big-stack worker and raises it
    // the playground debugger needs a pause after every statement; CLI runs don't,
    // and each pause walks the whole generator chain, so deep recursion got O(depth) slower
    stepYields: opts.stepYields ?? true,
    stack: [],
    globals: new Env(),
    // fns of imported modules resolve names here: only internal module names ("geo.area"),
    // never the main file's globals (a module calling map(...) gets the builtin even when
    // the main file defines its own fn map)
    modGlobals: new Env(),
  };
  st.stack.push({ name: '(top level)', env: st.globals, line: 1, rootEnv: st.globals });

  st.snapshot = () => st.stack.map(f => {
    const vars = [];
    const chain = [];
    for (let e = f.env; e; e = e.parent) { chain.push(e); if (e === f.rootEnv) break; }
    for (let i = chain.length - 1; i >= 0; i--) {
      for (const [k, v] of chain[i].vars) {
        if (v && v.fn) continue; // don't list function declarations as variables
        const j = vars.findIndex(x => x.name === k);
        const entry = { name: k, value: trunc(display(v, 1)) };
        if (j >= 0) vars[j] = entry; else vars.push(entry);
      }
    }
    return { name: f.name, line: f.line, vars };
  });

  function trunc(s) { return s.length > 120 ? s.slice(0, 117) + '…' : s; }

  function trap(node, kind, title, detail, fix) {
    let frames = st.stack.slice(1).reverse();
    const extra = frames.length - 8;
    if (extra > 0) frames = frames.slice(0, 8);
    const callTrace = frames.map(f => `at fn ${f.name} (${f.file ? f.file + ', ' : ''}line ${f.line})`);
    if (extra > 0) callTrace.push(`… ${extra} more call${extra === 1 ? '' : 's'}`);
    throw new VowError({
      kind, title, ...nodeLoc(src, node), detail, fix,
      notes: callTrace.length ? ['', 'call stack:', ...callTrace.map(s => '  ' + s)] : undefined,
    });
  }

  // ---------- builtins ----------

  const ok = (v) => ({ tag: 'ok', val: v });
  const err = (v) => ({ tag: 'err', val: v });

  function vowToRaw(v, node, who = 'toJson') {
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(x => vowToRaw(x, node, who));
    if (v instanceof Map) {
      const o = {};
      for (const [k, x] of v) o[k] = vowToRaw(x, node, who);
      return o;
    }
    if (v && v.__struct) {
      const o = {};
      for (const [k, x] of v.fields) o[k] = vowToRaw(x, node, who);
      return o;
    }
    if (isJson(v)) return v.__json;
    trap(node, 'RuntimeError', `${who}() can't serialize ${display(v, 1)}`,
      'Only nums, strs, bools, lists, maps, structs and json values have a JSON form.',
      v && v.tag ? 'match the Result first and serialize the ok value.' : 'convert or unwrap the value first.');
  }

  // Lets a host builtin (serve) call back into a Vow fn or lambda later, e.g. once per
  // HTTP request. Runs to completion, awaiting async builtins; each call gets a fresh step budget.
  const hostCtx = {
    invoke: async (fnVal, args) => {
      st.steps = 0;
      const g = fnVal.fn ? callFn(fnVal.fn, args, fnVal.fn) : callLambda(fnVal, args, fnVal.lambda);
      let r = g.next();
      while (!r.done) r = (r.value && r.value.await) ? g.next(await r.value.await) : g.next();
      return r.value;
    },
  };
  // compiled patterns are cached; a bad pattern built at runtime traps (a bad literal is a
  // compile-time error in the checker)
  const regexCache = new Map();
  function regex(p, flags, node) {
    const key = flags + ':' + p;
    let re = regexCache.get(key);
    if (re) { re.lastIndex = 0; return re; }
    try { re = compileRegex(p, flags); }
    catch (ex) {
      trap(node, 'RuntimeError', `invalid regular expression: ${JSON.stringify(p)}`,
        `${ex.message.replace(/^Invalid regular expression: /, '')}. Patterns are JavaScript regular expressions.`,
        'fix the pattern; to match text literally, escape special characters ( . * + ? ( ) [ ] { } | ^ $ \\ ) with a backslash.');
    }
    if (regexCache.size > 500) regexCache.clear();
    regexCache.set(key, re);
    return re;
  }
  const rand = makeRandom(opts.seed);
  // Math builtins never produce NaN or Infinity: a result with no real (finite) value traps,
  // as division by zero does.
  const math = (name, f) => (args, node) => {
    const r = f(...args);
    if (Number.isFinite(r)) return r;
    const call = `${name}(${args.map(a => display(a)).join(', ')})`;
    const x = args[0];
    if (name === 'sqrt') trap(node, 'RuntimeError', `sqrt() of a negative number: ${call}`,
      `The square root of ${display(x)} is not a real number, and Vow has no NaN.`,
      `guard it: if x >= 0 { ... } else { ... }, or use sqrt(abs(x)) if the sign does not matter.`);
    if (name === 'ln' || name === 'log') trap(node, 'RuntimeError', `${name}() of ${x === 0 ? 'zero' : 'a negative number'}: ${call}`,
      `The logarithm is only defined for numbers above 0${x === 0 ? ' (ln(0) would be minus infinity)' : ''}, and Vow has no NaN.`,
      `guard it: if x > 0 { ... } else { ... }`);
    if (name === 'pow' && x === 0 && args[1] < 0) trap(node, 'RuntimeError', `${call} divides by zero`,
      `A negative power is 1 divided by a positive power, and 0 to a positive power is 0.`,
      'guard it: if base != 0 { ... }');
    if (name === 'pow' && Number.isNaN(r)) trap(node, 'RuntimeError', `${call} has no real value`,
      `A negative number raised to a fractional power is not a real number, and Vow has no NaN.`,
      'use a whole-number exponent, or pow(abs(x), y) if the sign does not matter.');
    if (Number.isNaN(r) || args.some(a => !Number.isFinite(a))) trap(node, 'RuntimeError', `${call} has no finite value`,
      `An argument is too large to work with (it is beyond about 1.8e308), so there is no meaningful result.`,
      'check where that number comes from; it probably overflowed earlier.');
    trap(node, 'RuntimeError', `${call} is too large`,
      `The result is beyond the largest number Vow can represent (about 1.8e308).`,
      'use smaller inputs, or work with logarithms (ln) instead of the raw values.');
  };
  const dateArg = (name, ms, node) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) {
      trap(node, 'RuntimeError', `${name}() got ${display(ms)}, which is not a usable time`,
        'Times are milliseconds since 1970-01-01T00:00:00Z (UTC), like now() returns, within about 275,000 years of 1970.',
        'pass a value from now() or parseDate(...), plus or minus whole days (days * 86400000).');
    }
    return new Date(ms);
  };
  const builtins = {
    print: (args) => { st.out(args.map(a => display(a)).join(' ')); return UNIT; },
    str: ([v]) => display(v),
    num: ([s]) => {
      const t = s.trim();
      if (t === '' || isNaN(Number(t))) return err(`"${s}" is not a number`);
      return ok(Number(t));
    },
    len: ([v]) => v.length,
    range: ([a, b], node) => {
      const n = Math.max(0, Math.floor(b) - Math.ceil(a));
      if (n > 1_000_000) trap(node, 'RuntimeError', `range(${display(a)}, ${display(b)}) is too big`,
        'This range would create over a million items.', 'use a smaller range, or a while loop with a counter.');
      return Array.from({ length: n }, (_, i) => Math.ceil(a) + i);
    },
    push: ([list, v]) => { list.push(v); return list; },
    pop: ([list]) => list.length === 0 ? err('the list is empty') : ok(list.pop()),
    get: ([c, k]) => {
      if (isJson(c)) {
        const raw = c.__json;
        if (Array.isArray(raw)) {
          if (typeof k !== 'number') return err(`this JSON value is an array; index it with a number, not "${k}"`);
          if (!Number.isInteger(k) || k < 0 || k >= raw.length) return err(`index ${display(k)} is out of range (the JSON array has ${raw.length} item${raw.length === 1 ? '' : 's'})`);
          return ok(J(raw[k], k));
        }
        if (raw !== null && typeof raw === 'object') {
          if (typeof k !== 'string') return err(`this JSON value is an object; access it with a string key, not ${display(k)}`);
          if (!Object.hasOwn(raw, k)) {
            const ks = Object.keys(raw).slice(0, 8).map(x => `"${x}"`).join(', ');
            return err(`key "${k}" not found in this JSON object (its keys: ${ks || 'none; the object is empty'})`);
          }
          return ok(J(raw[k], k));
        }
        return err(`can't index into a JSON ${jsonTypeOf(raw)}; only objects and arrays have children`);
      }
      if (c instanceof Map) return c.has(k) ? ok(c.get(k)) : err(`key "${k}" not found`);
      if (typeof c === 'string') {
        if (!Number.isInteger(k) || k < 0 || k >= c.length) return err(`index ${display(k)} is out of range (the string has ${c.length} character${c.length === 1 ? '' : 's'})`);
        return ok(c[k]);
      }
      if (!Number.isInteger(k) || k < 0 || k >= c.length) return err(`index ${display(k)} is out of range (the list has ${c.length} item${c.length === 1 ? '' : 's'})`);
      return ok(c[k]);
    },
    keys: ([m]) => [...m.keys()],
    has: ([m, k]) => isJson(m) ? isJsonObject(m.__json) && Object.hasOwn(m.__json, k) : m.has(k),
    join: ([list, sep]) => list.join(sep),
    split: ([s, sep]) => sep === '' ? [...s] : s.split(sep),
    abs: ([n]) => Math.abs(n),
    floor: ([n]) => Math.floor(n),
    // text with exactly d decimals, rounded half-up like round(): fixed(212.3, 2) is "212.30"
    fixed: ([n, d]) => { const k = Math.max(0, Math.min(20, Math.floor(d))); return builtins.round([n, k]).toFixed(k); },
    // half-up decimal rounding via exponent strings, so round(15.625, 2) is 15.63 (not 15.62 from float error)
    round: ([n, d = 0]) => {
      const k = Math.max(0, Math.floor(d));
      if (/e/i.test(String(n))) return Math.round(n * 10 ** k) / 10 ** k;
      return Number(Math.round(Number(n + 'e' + k)) + 'e-' + k);
    },
    min: ([a, b]) => Math.min(a, b),
    max: ([a, b]) => Math.max(a, b),
    ok: ([v]) => ok(v),
    err: ([v]) => err(v),
    sort: ([l]) => [...l].sort((a, b) => typeof a === 'string' ? compareText(a, b) : a - b),
    reverse: ([l]) => [...l].reverse(),
    contains: ([c, v]) => typeof c === 'string' ? c.includes(v) : c.some(x => deepEq(x, v)),
    slice: ([c, a, b]) => c.slice(Math.max(0, Math.floor(a)), Math.max(0, Math.floor(b))),
    trim: ([s]) => s.trim(),
    upper: ([s]) => s.toUpperCase(),
    lower: ([s]) => s.toLowerCase(),
    sum: ([l]) => l.reduce((a, b) => a + b, 0),
    parseJson: ([s]) => {
      try { return ok(J(JSON.parse(s))); }
      catch (e) { return err(`invalid JSON: ${e.message}`); }
    },
    toJson: ([v], node) => JSON.stringify(vowToRaw(v, node)),
    prettyJson: ([v], node) => JSON.stringify(vowToRaw(v, node), null, 2),
    // json values are read-only, so "modifying" one builds a new one (children are shared)
    jsonSet: ([j, k, v], node) => {
      const raw = j.__json;
      if (raw !== null && !isJsonObject(raw)) trap(node, 'RuntimeError', `jsonSet() needs a JSON object, but ${jsonFound(j)}`,
        'jsonSet(j, key, value) returns a copy of the object j with that key set (a json null counts as an empty object).',
        'check the kind first: if jsonType(j) == "object" { ... }; to build a list, use a Vow list and toJson(...) instead.');
      return J({ ...(raw ?? {}), [k]: vowToRaw(v, node) });
    },
    jsonDelete: ([j, k], node) => {
      const raw = j.__json;
      if (raw !== null && !isJsonObject(raw)) trap(node, 'RuntimeError', `jsonDelete() needs a JSON object, but ${jsonFound(j)}`,
        'jsonDelete(j, key) returns a copy of the object j without that key (a json null counts as an empty object).',
        'check the kind first: if jsonType(j) == "object" { ... }; to drop items from an array, filter jsonList(j) and rebuild it with json(...).');
      const out = { ...(raw ?? {}) };
      delete out[k];
      return J(out);
    },
    // json(v): a Vow value as a json value, directly (no Result: it can't fail for the types the checker lets through)
    json: ([v], node) => J(vowToRaw(v, node, 'json')),
    jsonMerge: ([a, b]) => J(rawJsonMerge(a.__json, b.__json)),
    jsonNum: ([j]) => typeof j.__json === 'number' ? ok(j.__json) : err(`${jsonFound(j)}, not a number`),
    jsonStr: ([j]) => typeof j.__json === 'string' ? ok(j.__json) : err(`${jsonFound(j)}, not a string`),
    jsonBool: ([j]) => typeof j.__json === 'boolean' ? ok(j.__json) : err(`${jsonFound(j)}, not a bool`),
    jsonList: ([j]) => Array.isArray(j.__json) ? j.__json.map((x, i) => J(x, i)) : [],
    jsonKeys: ([j]) => jsonTypeOf(j.__json) === 'object' ? Object.keys(j.__json) : [],
    jsonType: ([j]) => jsonTypeOf(j.__json),
    // missing is a normal case: a json null instead of a Result (get() stays the strict version)
    field: ([j, k]) => isJsonObject(j.__json) && Object.hasOwn(j.__json, k) ? J(j.__json[k], k) : J(null, k),
    at: ([j, i]) => Array.isArray(j.__json) && Number.isInteger(i) && i >= 0 && i < j.__json.length ? J(j.__json[i], i) : J(null, i),
    isNull: ([j]) => j.__json === null,
    truthy: ([j]) => jsonTruthy(j.__json),
    // I/O builtins — the host (CLI) overrides these via opts.builtins.
    // In the browser playground they fail softly, as Results.
    readFile: () => err('readFile is only available in the Vow CLI; the browser playground has no filesystem'),
    writeFile: () => err('writeFile is only available in the Vow CLI; the browser playground has no filesystem'),
    httpGet: () => err('httpGet is only available in the Vow CLI; the browser playground cannot reach the network'),
    httpRequest: () => err('httpRequest is only available in the Vow CLI; the browser playground cannot reach the network'),
    readLine: () => err('readLine is only available in the Vow CLI; the browser playground has no standard input'),
    readAll: () => err('readAll is only available in the Vow CLI; the browser playground has no standard input'),
    env: () => err('env is only available in the Vow CLI; the browser playground has no environment variables'),
    args: () => [],
    serve: () => err('serve is only available in the Vow CLI; the browser playground cannot open a port'),
    // responses are plain values; the host's serve() turns them into HTTP
    html: ([body]) => ({ __response: true, status: 200, type: 'text/html; charset=utf-8', body }),
    text: ([body]) => ({ __response: true, status: 200, type: 'text/plain; charset=utf-8', body }),
    respond: ([status, type, body]) => ({ __response: true, status, type, body }),
    // same-site only ("/path"), so a redirect can never bounce visitors to another domain
    redirect: ([path], node) => {
      if (!/^\/(?![\/\\])/.test(path)) trap(node, 'RuntimeError', `redirect() only goes to paths on this site, got "${path}"`,
        'Redirecting to a full URL taken from user input is an open-redirect hole, so Vow only allows site paths.', 'pass a path that starts with a single /, e.g. redirect("/")');
      return { __response: true, status: 303, type: 'text/plain; charset=utf-8', body: '', location: path };
    },
    // HTTP Basic auth: true when the header carries this password (any username).
    // Both sides are hashed first so the comparison takes the same time whatever the guess.
    checkLogin: ([header, password]) => {
      if (!password || !header.startsWith('Basic ')) return false;
      let given = '';
      try { given = atob(header.slice(6).trim()); } catch { return false; }
      const pass = given.slice(given.indexOf(':') + 1);
      return sameHash(pass, password);
    },
    askLogin: ([realm]) => ({ __response: true, status: 401, type: 'text/plain; charset=utf-8', body: 'login required', authenticate: realm }),
    now: () => Date.now(),
    // ---- math: domain errors trap (no NaN / Infinity values) ----
    sqrt: math('sqrt', Math.sqrt),
    pow: math('pow', Math.pow),
    exp: math('exp', Math.exp),
    ln: math('ln', Math.log),
    log: math('log', Math.log),
    sin: math('sin', Math.sin),
    cos: math('cos', Math.cos),
    tan: math('tan', Math.tan),
    atan2: math('atan2', Math.atan2),
    ceil: math('ceil', Math.ceil),
    trunc: math('trunc', Math.trunc),
    pi: () => Math.PI,
    // ---- randomness: seeded by the host (CLI --seed N) for reproducible runs ----
    random: () => rand(),
    randomInt: ([lo, hi], node) => {
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) trap(node, 'RuntimeError', `randomInt() bounds must be whole numbers, got ${display(lo)} and ${display(hi)}`,
        'randomInt(lo, hi) picks a whole number from lo to hi, both included.', 'round the bounds first: randomInt(floor(a), floor(b)).');
      if (lo > hi) trap(node, 'RuntimeError', `randomInt(${display(lo)}, ${display(hi)}): the low bound is above the high bound`,
        'randomInt(lo, hi) picks a whole number from lo to hi, both included, so lo must be <= hi.', 'swap the arguments, or guard the call: if lo <= hi { ... }');
      return lo + Math.floor(rand() * (hi - lo + 1));
    },
    // ---- dates: milliseconds since 1970-01-01T00:00:00Z, always UTC ----
    dateParts: ([ms], node) => {
      const d = dateArg('dateParts', ms, node);
      return { __struct: 'DateParts', fields: new Map([['year', d.getUTCFullYear()], ['month', d.getUTCMonth() + 1], ['day', d.getUTCDate()],
        ['hour', d.getUTCHours()], ['minute', d.getUTCMinutes()], ['second', d.getUTCSeconds()], ['weekday', d.getUTCDay()]]) };
    },
    isoDate: ([ms], node) => {
      const d = dateArg('isoDate', ms, node);
      const y = d.getUTCFullYear();
      if (y < 0 || y > 9999) trap(node, 'RuntimeError', `isoDate() can't write the year ${y}`,
        'isoDate() writes YYYY-MM-DDTHH:MM:SSZ, which only has room for the years 0000 to 9999.', 'use dateParts(ms) to get the year as a number.');
      return `${String(y).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}Z`;
    },
    parseDate: ([s]) => parseIsoDate(s),
    daysBetween: ([a, b], node) => {
      dateArg('daysBetween', a, node); dateArg('daysBetween', b, node);
      return Math.floor(b / DAY_MS) - Math.floor(a / DAY_MS);
    },
    replace: ([t, a, b]) => a === '' ? t : t.split(a).join(b), // every occurrence; literal, not a pattern
    startsWith: ([t, a]) => t.startsWith(a),
    endsWith: ([t, a]) => t.endsWith(a),
    indexOf: ([t, a]) => {
      if (typeof t === 'string') { const i = t.indexOf(a); return i < 0 ? err(`"${a}" does not occur in the text`) : ok(i); }
      const i = t.findIndex(x => deepEq(x, a));
      return i < 0 ? err(`${display(a, 1)} is not in the list`) : ok(i);
    },
    // ---- URLs and code points ----
    urlEncode: ([t]) => encodeURIComponent(t),
    urlDecode: ([t]) => {
      try { return ok(decodeURIComponent(t)); }
      catch {
        const shown = t.length > 60 ? t.slice(0, 57) + '...' : t;
        const why = /%(?![0-9a-fA-F]{2})/.test(t)
          ? 'a % must be followed by two hex digits'
          : 'the %-escapes are not valid UTF-8';
        return err(`"${shown}" is not valid URL encoding (${why})`);
      }
    },
    chars: ([t]) => [...t], // one str per code point: chars("a😀") is ["a", "😀"]
    ord: ([t], node) => {
      if (t === '') trap(node, 'RuntimeError', 'ord() of an empty string', 'ord(text) gives the code point of the first character, and "" has none.', 'check first: if s != "" { ord(s) }');
      return t.codePointAt(0);
    },
    chr: ([n], node) => {
      if (!Number.isInteger(n) || n < 0 || n > 0x10FFFF) trap(node, 'RuntimeError', `chr(${display(n)}) is not a code point`,
        'chr(n) takes a whole number from 0 to 1114111 (0x10FFFF).', 'pass a whole number in that range, e.g. chr(65) is "A" and chr(9731) is "☃".');
      return String.fromCodePoint(n);
    },
    repeat: ([t, n], node) => {
      if (!Number.isInteger(n) || n < 0 || n * t.length > 10_000_000) trap(node, 'RuntimeError', `repeat() count ${display(n)} is not a usable whole number`, 'The count must be a whole number from 0 up, and the result at most 10 million characters.', 'pass a non-negative whole number.');
      return t.repeat(n);
    },
    padLeft: ([t, w, f]) => (f === '' || t.length >= w) ? t : f.repeat(Math.ceil((w - t.length) / f.length)).slice(0, w - t.length) + t,
    padRight: ([t, w, f]) => (f === '' || t.length >= w) ? t : t + f.repeat(Math.ceil((w - t.length) / f.length)).slice(0, w - t.length),
    lines: ([t]) => t === '' ? [] : t.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'),
    // ---- regex toolkit: patterns are JavaScript regular expressions ----
    matches: ([s, p], node) => regex(p, '', node).test(s),
    find: ([s, p], node) => {
      const m = regex(p, '', node).exec(s);
      return m ? ok([...m].map(x => x ?? '')) : err('no match');
    },
    findAll: ([s, p], node) => s.match(regex(p, 'g', node)) ?? [],
    replaceAll: ([s, p, r], node) => s.replace(regex(p, 'g', node), r),
    // capture groups in the pattern do NOT add pieces (unlike JS split): only the text between matches
    splitOn: ([s, p], node) => {
      const re = regex(p, '', node);
      const groups = new RegExp(p + '|').exec('').length - 1;
      const parts = s.split(re);
      return groups ? parts.filter((_, i) => i % (groups + 1) === 0) : parts;
    },
    words: ([s]) => s.split(/\s+/).filter(w => w !== ''),
    sig: ([x, d], node) => {
      if (!Number.isInteger(d) || d < 1 || d > 21) trap(node, 'RuntimeError', `sig() digits must be a whole number from 1 to 21, got ${display(d)}`,
        `sig(x, digits) rounds x to that many significant digits, e.g. sig(1234.5, 2) is 1200.`, 'pass a whole number from 1 to 21 as the second argument.');
      return Number(x.toPrecision(d));
    },
    isInt: ([x]) => Number.isInteger(x),
    int: ([s]) => /^-?\d+$/.test(s) ? ok(Number(s))
      : err(`"${s}" is not a whole number (int() accepts an optional "-" then digits only: no spaces, "+", decimals or exponents)`),
    uniq: ([xs]) => {
      const seen = new Set(), objs = [], out = [];
      for (const x of xs) {
        if (x !== null && typeof x === 'object') {
          if (objs.some(o => deepEq(o, x))) continue;
          objs.push(x);
        } else if (x === x) { // NaN is never equal to itself, so every NaN is kept (deepEq semantics)
          if (seen.has(x)) continue;
          seen.add(x);
        }
        out.push(x);
      }
      return out;
    },
    values: ([m]) => [...m.values()],
    // makes text safe to put inside HTML (element content or a quoted attribute)
    escape: ([t]) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    param: ([query, name]) => {
      const v = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query).get(name);
      return v === null ? err(`query has no parameter "${name}"`) : ok(v);
    },
    // ---- tests: only reachable from a test block (the checker refuses them elsewhere) ----
    expect: ([c], node) => {
      if (c === true) return UNIT;
      trap(node, 'TestFailure', 'expect(...) failed', `The condition ${src.slice(node.args[0].start, node.args[0].end).replace(/\s+/g, ' ')} is false.`);
    },
    expectEq: ([actual, expected], node) => {
      if (deepEq(actual, expected)) return UNIT;
      trap(node, 'TestFailure', 'expectEq(...) failed: the values differ', eqDetail(actual, expected));
    },
    expectErr: ([r], node) => {
      if (r.tag === 'err') return UNIT;
      trap(node, 'TestFailure', 'expectErr(...) failed: the Result is ok', `expected an err, actual: ${display(r, 1)}`);
    },
    // run(args, stdin): this file's top-level code, in a fresh state, with print captured;
    // returns what it printed. The compiled backend has its own $run with the same contract.
    run: async ([argv, stdin], node) => {
      const lines = [];
      const saved = { print: builtins.print, args: builtins.args, readLine: builtins.readLine, readAll: builtins.readAll };
      const outer = { globals: st.globals, modGlobals: st.modGlobals, stack: st.stack, steps: st.steps };
      Object.assign(builtins, testIO(argv, stdin, lines));
      fresh();
      try { await drive(program()); }
      catch (e) { throw runTrap(e, node, src); }
      finally { Object.assign(builtins, saved); Object.assign(st, outer); }
      return runOutput(lines);
    },
    ...(opts.builtins ?? {}),
  };

  // ---------- execution ----------

  // Fn and Struct never reach here: program() hoists top-level ones and the parser lifts
  // nested fns (or turns capturing ones into a let + lambda).
  function* execStmt(s, env) {
    st.steps++;
    if (st.steps > st.maxSteps) {
      trap(s, 'RuntimeError', `the program ran over ${st.maxSteps.toLocaleString()} steps and was stopped`,
        'That many steps is usually an infinite loop, but it can also be heavy legitimate work.',
        `check that your while condition can become false and that loop counters actually change; if the work is real, raise the limit: vow --max-steps ${st.maxSteps * 10} main.vow (0 = no limit).`);
    }
    const frame = st.stack[st.stack.length - 1];
    frame.line = s.pos.line;
    frame.env = env;
    if (st.stepYields) yield { line: s.pos.line };

    switch (s.t) {
      case 'Let': {
        // a recursive closure (s.rec) needs nothing extra: the closure captures this env,
        // and its name is declared here before any call can look it up
        env.declare(s.name, yield* evalExpr(s.expr, env));
        return NORMAL;
      }
      case 'Assign': {
        const v = yield* evalExpr(s.value, env);
        if (s.target.t === 'Ident') { env.assign(s.target.name, v); return NORMAL; }
        if (s.target.t === 'Field') {
          const obj = yield* evalExpr(s.target.target, env);
          obj.fields.set(s.target.name, v);
          return NORMAL;
        }
        const target = yield* evalExpr(s.target.target, env);
        const key = yield* evalExpr(s.target.index, env);
        if (target instanceof Map) { target.set(key, v); return NORMAL; }
        checkListIndex(target, key, s.target, true);
        target[key] = v;
        return NORMAL;
      }
      case 'ExprStmt':
        yield* evalExpr(s.expr, env);
        return NORMAL;
      case 'If': {
        const c = yield* evalExpr(s.cond, env);
        if (c) return yield* execStmt(s.then, new Env(env));
        if (s.alt) return yield* execStmt(s.alt, s.alt.t === 'If' ? env : new Env(env));
        return NORMAL;
      }
      case 'While': {
        while (yield* evalExpr(s.cond, env)) {
          const c = yield* execBlock(s.body, new Env(env));
          if (c.sig === 'break') break;
          if (c.sig === 'return') return c;
        }
        return NORMAL;
      }
      case 'For': {
        const list = yield* evalExpr(s.iter, env);
        for (const item of [...list]) {
          const inner = new Env(env);
          inner.declare(s.binder, item);
          const c = yield* execBlock(s.body, inner);
          if (c.sig === 'break') break;
          if (c.sig === 'return') return c;
        }
        return NORMAL;
      }
      case 'Return':
        return { sig: 'return', val: s.value ? yield* evalExpr(s.value, env) : UNIT };
      case 'Break': return BREAK;
      case 'Continue': return CONTINUE;
      case 'Block': return yield* execBlock(s, new Env(env));
      case 'MatchStmt': {
        const { arm, inner } = yield* matchArm(s.match, env);
        if (arm.body.t === 'Block') return yield* execBlock(arm.body, inner);
        yield* evalExpr(arm.body, inner);
        return NORMAL;
      }
    }
  }

  function* execBlock(block, env) {
    for (const s of block.stmts) {
      const c = yield* execStmt(s, env);
      if (c.sig !== 'normal') return c;
    }
    return NORMAL;
  }

  function* matchArm(m, env) {
    const subject = yield* evalExpr(m.subject, env);
    // value patterns compare by ===; the checker guarantees a final _ (or true + false)
    const arm = m.arms.find(a => a.tag === 'wild' || (a.tag === 'lit' ? a.value === subject : a.tag === subject.tag));
    const inner = new Env(env);
    if (arm.binder) inner.declare(arm.binder, subject.val);
    return { arm, inner };
  }

  function checkListIndex(list, i, node, isAssign) {
    if (!Number.isInteger(i)) {
      trap(node, 'RuntimeError', `list index ${display(i)} is not a whole number`,
        'List positions are whole numbers: 0, 1, 2, ...',
        `round it first: ${'floor(...)'}; e.g. items[floor(${display(i)})].`);
    }
    if (i < 0 || i >= list.length) {
      trap(node, 'RuntimeError', `index ${i} is out of range`,
        `The list has ${list.length} item${list.length === 1 ? '' : 's'}, so valid indexes are 0 to ${list.length - 1}${i === list.length && isAssign ? ` (to append, use push(list, value))` : ''}.`,
        i < 0 ? 'list indexes start at 0 and can\'t be negative.'
          : isAssign ? 'use push(list, value) to add a new item.'
            : 'check the loop bounds; a classic off-by-one. The last index is len(list) - 1.');
    }
  }

  function* evalExpr(e, env) {
    switch (e.t) {
      case 'Num': return e.value;
      case 'Str': return e.value;
      case 'Bool': return e.value;
      case 'Ident': return env.lookup(e.name);
      case 'ListLit': {
        const out = [];
        for (const item of e.items) out.push(yield* evalExpr(item, env));
        return out;
      }
      case 'MapLit': {
        const m = new Map();
        for (const entry of e.entries) m.set(entry.key, yield* evalExpr(entry.value, env));
        return m;
      }
      case 'Unary': {
        const v = yield* evalExpr(e.operand, env);
        return e.op === 'not' ? !v : -v;
      }
      case 'Binary': {
        if (e.op === 'and') return (yield* evalExpr(e.left, env)) ? yield* evalExpr(e.right, env) : false;
        if (e.op === 'or') return (yield* evalExpr(e.left, env)) ? true : yield* evalExpr(e.right, env);
        const l = yield* evalExpr(e.left, env);
        const r = yield* evalExpr(e.right, env);
        switch (e.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/':
            if (r === 0) trap(e, 'RuntimeError', 'division by zero',
              `The right side of this division is 0 (left side was ${display(l)}).`,
              'guard it: if divisor != 0 { ... }, or return err("...") when the divisor is 0.');
            return l / r;
          case '%':
            if (r === 0) trap(e, 'RuntimeError', 'modulo by zero',
              `The right side of '%' is 0.`, 'guard it with: if divisor != 0 { ... }');
            return l % r;
          case '==': return deepEq(l, r);
          case '!=': return !deepEq(l, r);
          case '<': return typeof l === 'string' ? compareText(l, r) < 0 : l < r;
          case '<=': return typeof l === 'string' ? compareText(l, r) <= 0 : l <= r;
          case '>': return typeof l === 'string' ? compareText(l, r) > 0 : l > r;
          case '>=': return typeof l === 'string' ? compareText(l, r) >= 0 : l >= r;
        }
      }
      case 'Index': {
        const target = yield* evalExpr(e.target, env);
        const key = yield* evalExpr(e.index, env);
        if (isJson(target)) {
          const raw = target.__json;
          if (Array.isArray(raw)) {
            if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key >= raw.length) {
              trap(e, 'RuntimeError', `JSON array index ${display(key)} is out of range`,
                `This JSON array has ${raw.length} item${raw.length === 1 ? '' : 's'}.`,
                `use get(j, ${display(key)}) which returns a Result you can match on.`);
            }
            return J(raw[key], key);
          }
          if (raw !== null && typeof raw === 'object') {
            if (!Object.hasOwn(raw, key)) {
              const ks = Object.keys(raw).slice(0, 8).map(k => `"${k}"`).join(', ');
              trap(e, 'RuntimeError', `key "${key}" not found in this JSON object`,
                `Its keys are: ${ks || '(none; the object is empty)'}.`,
                `use get(j, "${key}") which returns a Result you can match on.`);
            }
            return J(raw[key], key);
          }
          trap(e, 'RuntimeError', `can't index into a JSON ${jsonTypeOf(raw)}`,
            'Only JSON objects and arrays have children.',
            `check the shape first: jsonType(j) == "object" or "array".`);
        }
        if (target instanceof Map) {
          if (!target.has(key)) {
            const ks = [...target.keys()].slice(0, 8).map(k => `"${k}"`).join(', ');
            trap(e, 'RuntimeError', `key "${key}" not found in this map`,
              `The map's keys are: ${ks || '(none; the map is empty)'}.`,
              `check first with has(m, "${key}"), or use get(m, "${key}") which returns a Result you can match on.`);
          }
          return target.get(key);
        }
        if (typeof target === 'string') {
          if (!Number.isInteger(key) || key < 0 || key >= target.length) {
            trap(e, 'RuntimeError', `string index ${display(key)} is out of range`,
              `This string has ${target.length} character${target.length === 1 ? '' : 's'}.`,
              `check first with i < len(s), or use get(s, ${display(key)}) which returns a Result.`);
          }
          return target[key];
        }
        checkListIndex(target, key, e, false);
        return target[key];
      }
      case 'Call': {
        const args = [];
        for (const a of e.args) args.push(yield* evalExpr(a, env));
        const fnVal = env.find(e.callee);
        if (e.callee === 'sortBy' && !fnVal) {
          // stable sort by a user key fn: keys are computed once per item, in order
          const [xs, kf] = args;
          const keyed = [];
          for (let i = 0; i < xs.length; i++) {
            const k = kf.fn ? yield* callFn(kf.fn, [xs[i]], e) : yield* callLambda(kf, [xs[i]], e);
            keyed.push({ k, i, v: xs[i] });
          }
          keyed.sort((a, b) => compareKeys(a.k, b.k) || a.i - b.i);
          return keyed.map(x => x.v);
        }
        // higher-order builtins; a user fn or lambda variable with the same name wins
        if (HIGHER_ORDER.has(e.callee) && !(fnVal && (fnVal.fn || fnVal.lambda))) {
          const call = (f, as) => f.fn ? callFn(f.fn, as, e) : callLambda(f, as, e);
          const [xs, f] = args;
          const items = [...xs];
          switch (e.callee) {
            case 'map': { const out = []; for (const x of items) out.push(yield* call(f, [x])); return out; }
            case 'filter': { const out = []; for (const x of items) if (yield* call(f, [x])) out.push(x); return out; }
            case 'any': { for (const x of items) if (yield* call(f, [x])) return true; return false; }
            case 'all': { for (const x of items) if (!(yield* call(f, [x]))) return false; return true; }
            case 'count': { let n = 0; for (const x of items) if (yield* call(f, [x])) n++; return n; }
            case 'fold': { const g = args[2]; let acc = args[1]; for (const x of items) acc = yield* call(g, [acc, x]); return acc; }
          }
        }
        if (fnVal && fnVal.fn) return yield* callFn(fnVal.fn, args, e);
        if (fnVal && fnVal.lambda) return yield* callLambda(fnVal, args, e);
        let v = builtins[e.callee](args, e, hostCtx);
        // async builtins (CLI I/O) return a promise; the driver awaits it
        if (v && typeof v.then === 'function') v = yield { await: v };
        return v;
      }
      case 'Match': {
        const { arm, inner } = yield* matchArm(e, env);
        if (arm.body.t === 'Block') {
          // checker guarantees no break/continue, and either a trailing ExprStmt or an arm
          // that always returns; a return unwinds out of the expression like '?' does
          const benv = new Env(inner);
          const stmts = arm.body.stmts;
          const last = stmts[stmts.length - 1];
          const n = last && last.t === 'ExprStmt' ? stmts.length - 1 : stmts.length;
          for (let i = 0; i < n; i++) {
            const c = yield* execStmt(stmts[i], benv);
            if (c.sig === 'return') throw new ErrPropagation(c.val);
          }
          return yield* evalExpr(last.expr, benv);
        }
        return yield* evalExpr(arm.body, inner);
      }
      case 'IfExpr': {
        // checker guarantees an else on every level and a trailing value in each branch
        let st = e.stmt;
        while (true) {
          const branch = (yield* evalExpr(st.cond, env)) ? st.then : st.alt;
          if (branch.t === 'If') { st = branch; continue; }
          const benv = new Env(env);
          const stmts = branch.stmts;
          const last = stmts[stmts.length - 1];
          const n = last && last.t === 'ExprStmt' ? stmts.length - 1 : stmts.length;
          for (let i = 0; i < n; i++) {
            const c = yield* execStmt(stmts[i], benv);
            if (c.sig === 'return') throw new ErrPropagation(c.val);
          }
          return yield* evalExpr(last.expr, benv);
        }
      }
      case 'Try': {
        const v = yield* evalExpr(e.operand, env);
        if (v.tag === 'ok') return v.val;
        throw new ErrPropagation(v);
      }
      case 'StructLit': {
        const fields = new Map();
        for (const f of e.fields) fields.set(f.name, yield* evalExpr(f.value, env));
        return { __struct: e.name, fields };
      }
      case 'Field':
        return (yield* evalExpr(e.target, env)).fields.get(e.name);
      case 'InterpStr': {
        let out = '';
        for (const part of e.parts) {
          if (part.kind === 'str') out += part.value;
          else out += display(yield* evalExpr(part.expr, env));
        }
        return out;
      }
      case 'Lambda':
        return { lambda: e, env }; // a closure: the body + the scope it was born in
    }
  }

  // Blame the fn that actually fills the stack, not whichever call happened to tip it over.
  function depthTrap(callNode) {
    const counts = new Map();
    for (const f of st.stack) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const who = top === '(lambda)' ? 'a lambda' : `fn ${top}`;
    trap(callNode, 'RuntimeError', `the call stack hit ${st.maxDepth} calls deep (mostly ${who})`,
      `${who} appears ${counts.get(top)} times on the stack. This is usually infinite recursion: a base case that is missing or never reached. If the recursion is intentional and just deep, rewrite it as a loop.`,
      `check that ${who} has a path that returns WITHOUT calling itself, and that each call moves toward it.`);
  }

  function* callLambda(closure, args, callNode) {
    if (st.stack.length > st.maxDepth) depthTrap(callNode);
    const inner = new Env(closure.env);
    closure.lambda.params.forEach((p, i) => inner.declare(p.name, args[i]));
    st.stack.push({ name: '(lambda)', env: inner, line: closure.lambda.pos.line, rootEnv: inner, file: closure.lambda.fileLabel });
    let c;
    try {
      c = yield* execBlock(closure.lambda.body, new Env(inner));
    } catch (ex) {
      if (ex instanceof ErrPropagation) c = { sig: 'return', val: ex.val };
      else throw ex;
    } finally {
      st.stack.pop();
    }
    return c.sig === 'return' ? c.val : UNIT;
  }

  function* callFn(decl, args, callNode) {
    if (st.stack.length > st.maxDepth) depthTrap(callNode);
    const fnEnv = new Env(decl.mod && !decl.mod.isEntry ? st.modGlobals : st.globals);
    decl.params.forEach((p, i) => fnEnv.declare(p.name, args[i]));

    const argList = () => decl.params.map((p, i) => `${p.name} = ${display(args[i], 1)}`).join(', ');
    const callLine = () => nodeLoc(src, callNode).line; // only needed when a contract fails

    for (const cond of decl.expects) {
      if (!(yield* evalExpr(cond, fnEnv))) {
        trap(callNode, 'ContractViolation', `fn ${decl.name} was called with arguments that break its contract`,
          `fn ${decl.name} declares:  expects ${src.slice(cond.start, cond.end)}\nbut it was called from line ${callLine()} with:  ${argList()}.\nThe bug is in the CALLER, not in fn ${decl.name}.`,
          `at the call site, check the value before calling (if ... { }), or handle the bad input there by returning err(...).`);
      }
    }

    st.stack.push({ name: decl.name, env: fnEnv, line: decl.pos.line, rootEnv: fnEnv, file: decl.fileLabel });
    let c;
    try {
      c = yield* execBlock(decl.body, new Env(fnEnv));
    } catch (ex) {
      if (ex instanceof ErrPropagation) c = { sig: 'return', val: ex.val };
      else throw ex;
    } finally {
      st.stack.pop();
    }
    const result = c.sig === 'return' ? c.val : UNIT;

    if (decl.ensures.length) {
      const ensEnv = new Env(fnEnv);
      ensEnv.declare('result', result);
      for (const cond of decl.ensures) {
        if (!(yield* evalExpr(cond, ensEnv))) {
          trap(cond, 'ContractViolation', `fn ${decl.name} broke its own promise`,
            `fn ${decl.name} declares:  ensures ${src.slice(cond.start, cond.end)}\nbut it returned:  result = ${display(result, 1)}  (called with ${argList()}).\nThe bug is INSIDE fn ${decl.name}; its output doesn't satisfy its own guarantee.`,
            `fix the body of fn ${decl.name} so the returned value always satisfies the ensures condition.`);
        }
      }
    }
    return result;
  }

  // Hoist fn declarations so calls work before their definition line.
  function hoist() {
    for (const s of ast.stmts) if (s.t === 'Fn') {
      st.globals.declare(s.name, { fn: s });
      if (s.mod && !s.mod.isEntry) st.modGlobals.declare(s.name, { fn: s });
    }
  }
  // a program state as if nothing had run yet: run(...) in a test, and each test, start here
  function fresh() {
    st.globals = new Env();
    st.modGlobals = new Env();
    st.stack = [{ name: '(top level)', env: st.globals, line: 1, rootEnv: st.globals }];
    st.steps = 0;
    hoist();
  }
  // runs a generator to the end, awaiting async builtins (the same loop every host uses)
  async function drive(g) {
    let r = g.next();
    while (!r.done) r = (r.value && r.value.await) ? g.next(await r.value.await) : g.next();
    return r.value;
  }

  function* program() {
    hoist();
    try {
      for (const s of ast.stmts) {
        // test blocks never run as part of the program (vow test runs them)
        if (s.t === 'Fn' || s.t === 'Struct' || s.t === 'Test') continue;
        // a top-level return ends the program
        if ((yield* execStmt(s, st.globals)).sig === 'return') return;
      }
    } catch (ex) {
      if (!(ex instanceof ErrPropagation)) throw ex;
    }
  }

  // one test block, in a fresh state (a bare return ends it early, like the top level)
  function* testBody(t) {
    fresh();
    try { yield* execBlock(t.body, new Env(st.globals)); }
    catch (ex) { if (!(ex instanceof ErrPropagation)) throw ex; }
  }
  // the file's tests: { name, node, run } where run() resolves when the test passes and
  // rejects with the VowError (a TestFailure or a trap) when it fails
  const tests = ast.stmts.filter(s => s.t === 'Test').map(t => ({ name: t.name, node: t, run: () => drive(testBody(t)) }));

  // builtins: exposed so the compiled backend (lang/runtime.js) reuses the exact same table
  return { gen: program(), state: st, builtins, tests };
}
