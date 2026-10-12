// Vow type checker — full inference, no annotations needed.
// No nulls. Results must be handled. Errors read like repair instructions.

import { VowError, nodeLoc, editDistance } from './diagnostics.js';
import { prove } from './prove.js';

// ---------- types ----------

let nextVarId = 0;
const tvar = () => ({ k: 'var', id: nextVarId++, ref: null });
const NUM = { k: 'num' }, STR = { k: 'str' }, BOOL = { k: 'bool' }, UNIT = { k: 'unit' };
// json is opaque: a parsed JSON tree. Reads that can fail (get, jsonNum, jsonStr, jsonBool)
// return a Result; field/at/jsonList/jsonKeys give json null or [] instead.
const JSONT = { k: 'json' };
const RESPONSE = { k: 'response' }; // an HTTP response built by html/text/respond, returned from a serve handler
const listT = (el) => ({ k: 'list', el });
const mapT = (val) => ({ k: 'map', val });
const resultT = (ok, err) => ({ k: 'result', ok, err });
const fnT = (params, ret) => ({ k: 'fn', params, ret });

function prune(t) {
  while (t.k === 'var' && t.ref) t = t.ref;
  return t;
}

// Constrained type vars ("typeclass-lite"). A var may carry a promise about what it
// will become, checked when it is finally bound, and re-checked per call site after
// generalization (instantiate copies the constraint):
//   { k: 'ord' }               num or str (sort, comparisons of unknowns)
//   { k: 'len' }               list or str
//   { k: 'index', key, el }    list (key num), str (key num), map (key str), or json (el json):
//                              t[key] / get(t, key) yields el
const cvar = (cons) => { const v = tvar(); v.cons = cons; return v; };

function satisfies(cons, t) {
  switch (cons.k) {
    case 'ord': return t.k === 'num' || t.k === 'str';
    case 'len': return t.k === 'list' || t.k === 'str';
    case 'index':
      if (cons.seq && t.k !== 'list' && t.k !== 'str') return false; // also needs a len()
      if (t.k === 'list') return unify(cons.key, NUM) && unify(cons.el, t.el);
      if (t.k === 'map') return unify(cons.key, STR) && unify(cons.el, t.val);
      if (t.k === 'str') return unify(cons.key, NUM) && unify(cons.el, STR);
      if (t.k === 'json') {
        const pk = prune(cons.key);
        if (pk.k === 'var' && !pk.cons) unify(cons.key, STR);
        const k2 = prune(cons.key).k;
        return (k2 === 'str' || k2 === 'num') && unify(cons.el, JSONT);
      }
      return false;
  }
  return false;
}

// both vars constrained: keep the combined promise on the surviving var
function mergeCons(a, b) {
  if (!a) return b;
  if (!b) return a;
  // same kind here: unify() resolves mixed kinds (ord/len/index) before calling this
  if (a.k !== 'index') return a;
  if (!(unify(a.key, b.key) && unify(a.el, b.el))) return null;
  return { k: 'index', key: a.key, el: a.el, seq: a.seq || b.seq };
}

function occurs(v, t) {
  t = prune(t);
  if (t === v) return true;
  if (t.k === 'var' && t.cons && t.cons.k === 'index') return occurs(v, t.cons.key) || occurs(v, t.cons.el);
  switch (t.k) {
    case 'list': return occurs(v, t.el);
    case 'map': return occurs(v, t.val);
    case 'result': return occurs(v, t.ok) || occurs(v, t.err);
    case 'fn': return t.params.some(p => occurs(v, p)) || occurs(v, t.ret);
    // structs are nominal (one canonical type per name), so they are opaque here;
    // recursing into fields would loop forever on self-referential structs.
    default: return false;
  }
}

function unify(a, b) {
  a = prune(a); b = prune(b);
  if (a === b) return true;
  if (a.k === 'var' && b.k === 'var') {
    if (occurs(a, b)) return false;
    if (a.cons && b.cons && a.cons.k !== b.cons.k) {
      const ks = new Set([a.cons.k, b.cons.k]);
      const idx = a.cons.k === 'index' ? a.cons : b.cons.k === 'index' ? b.cons : null;
      if (ks.has('len') && idx) { // has a length AND is indexable: a list or str, indexed by num
        if (!unify(idx.key, NUM)) return false;
        a.cons = null; a.ref = b; b.cons = { ...idx, seq: true };
        return true;
      }
      // ord+len and ord+index can both only be str
      a.cons = null; b.cons = null; a.ref = b;
      return unify(b, STR) && satisfies(idx ?? { k: 'len' }, STR);
    }
    const m = mergeCons(a.cons, b.cons);
    if ((a.cons || b.cons) && !m) return false;
    a.ref = b; b.cons = m ?? null;
    return true;
  }
  if (a.k === 'var') {
    if (occurs(a, b)) return false;
    const c = a.cons;
    a.ref = b;
    if (c && !satisfies(c, b)) { a.ref = null; return false; }
    return true;
  }
  if (b.k === 'var') return unify(b, a);
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'num': case 'str': case 'bool': case 'unit': case 'json': case 'response': return true;
    case 'struct': return a.name === b.name;
    case 'list': return unify(a.el, b.el);
    case 'map': return unify(a.val, b.val);
    case 'result': return unify(a.ok, b.ok) && unify(a.err, b.err);
    case 'fn':
      if (a.params.length !== b.params.length) return false;
      return a.params.every((p, i) => unify(p, b.params[i])) && unify(a.ret, b.ret);
  }
}

// Free type variables of a type. Structs are opaque (nominal, canonical) —
// their field vars belong to the global environment, never to one function.
function ftv(t, acc = new Set()) {
  t = prune(t);
  switch (t.k) {
    case 'var':
      acc.add(t.id);
      if (t.cons && t.cons.k === 'index') { ftv(t.cons.key, acc); ftv(t.cons.el, acc); }
      break;
    case 'list': ftv(t.el, acc); break;
    case 'map': ftv(t.val, acc); break;
    case 'result': ftv(t.ok, acc); ftv(t.err, acc); break;
    case 'fn': t.params.forEach(p => ftv(p, acc)); ftv(t.ret, acc); break;
  }
  return acc;
}

// Generics: a scheme is a type with some vars universally quantified.
// Each use site gets a fresh copy of the quantified vars.
function instantiate(scheme) {
  if (scheme.vars.length === 0) return scheme.type;
  const fresh = new Map(scheme.vars.map(id => [id, tvar()]));
  const done = new Set();
  const go = (t) => {
    t = prune(t);
    if (t.k === 'var') {
      const f = fresh.get(t.id);
      if (!f) return t;
      if (t.cons && !done.has(t.id)) { // copy the promise onto the fresh var, per call site
        done.add(t.id);
        f.cons = t.cons.k === 'index' ? { k: 'index', key: go(t.cons.key), el: go(t.cons.el), seq: t.cons.seq } : { k: t.cons.k };
      }
      return f;
    }
    switch (t.k) {
      case 'list': return listT(go(t.el));
      case 'map': return mapT(go(t.val));
      case 'result': return resultT(go(t.ok), go(t.err));
      case 'fn': return fnT(t.params.map(go), go(t.ret));
      default: return t; // num/str/bool/unit/json/response/struct
    }
  };
  return go(scheme.type);
}

function typeName(t, names = new Map()) {
  t = prune(t);
  switch (t.k) {
    case 'var': {
      // a constrained var reads as what it promises to be
      if (t.cons?.k === 'ord') return '(num or str)';
      if (t.cons?.k === 'len') return '(list or str)';
      if (t.cons?.k === 'index') return t.cons.seq ? '(list or str)' : '(list, map, str, or json)';
      if (!names.has(t.id)) names.set(t.id, 'abcdefgh'[names.size % 8]);
      return names.get(t.id);
    }
    case 'num': case 'str': case 'bool': case 'unit': case 'json': case 'response': return t.k;
    case 'struct': return t.name;
    case 'list': return `list<${typeName(t.el, names)}>`;
    case 'map': return `map<str, ${typeName(t.val, names)}>`;
    case 'result': return `Result<${typeName(t.ok, names)}, ${typeName(t.err, names)}>`;
    case 'fn': return `fn(${t.params.map(p => typeName(p, names)).join(', ')}) -> ${typeName(t.ret, names)}`;
  }
}

// ---------- scopes ----------

class Scope {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  lookup(name) {
    for (let s = this; s; s = s.parent) {
      if (s.vars.has(name)) return s.vars.get(name);
      if (s.resolve) return s.resolve(name); // a module's root scope (see modScope in check)
    }
    return null;
  }
  declare(name, info) { this.vars.set(name, info); }
  has(name) { return this.vars.has(name); }
  allNames() {
    const out = [];
    for (let s = this; s; s = s.parent) { out.push(...s.vars.keys()); if (s.names) out.push(...s.names()); }
    return out;
  }
}

export const BUILTIN_NAMES = ['print', 'str', 'num', 'len', 'range', 'push', 'pop', 'get', 'keys', 'has', 'join', 'split', 'abs', 'floor', 'round', 'fixed', 'min', 'max', 'ok', 'err',
  'sort', 'sortBy', 'reverse', 'contains', 'slice', 'trim', 'upper', 'lower', 'sum',
  'replace', 'startsWith', 'endsWith', 'indexOf', 'repeat', 'padLeft', 'padRight', 'lines',
  'matches', 'find', 'findAll', 'replaceAll', 'splitOn', 'words', 'sig', 'isInt', 'int',
  'map', 'filter', 'any', 'all', 'count', 'fold', 'uniq', 'values',
  'readFile', 'writeFile', 'httpGet', 'args', 'env', 'serve', 'html', 'text', 'respond', 'redirect', 'param', 'escape', 'checkLogin', 'askLogin', 'now',
  'parseJson', 'toJson', 'jsonNum', 'jsonStr', 'jsonBool', 'jsonList', 'jsonKeys', 'jsonType', 'field', 'at', 'isNull', 'truthy',
  'sqrt', 'pow', 'exp', 'ln', 'log', 'sin', 'cos', 'tan', 'atan2', 'ceil', 'trunc', 'pi', 'random', 'randomInt',
  'dateParts', 'isoDate', 'parseDate', 'daysBetween'];

// fields of the struct dateParts(ms) returns, in display order
const DATE_PARTS_FIELDS = ['year', 'month', 'day', 'hour', 'minute', 'second', 'weekday'];

// ---------- checker ----------

function callsBuiltin(node, name) {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(n => callsBuiltin(n, name));
  if (node.t === 'Call' && node.callee === name) return true;
  for (const k in node) {
    if (k === 'pos' || k === 'tok' || k === 'nameTok' || k === 'tagTok' || k === 'binderTok' || k === 'calleeNode') continue;
    const v = node[k];
    if (v != null && typeof v === 'object' && callsBuiltin(v, name)) return true;
  }
  return false;
}

export function check(src, ast) {
  nextVarId = 0;
  const globals = new Scope();
  // Multi-file programs (lang/modules.js): ast.modules[0] is the main file, the rest are
  // imported modules. A module's fns see only their own module's names (bare), names they
  // reach through their own imports (internal "stem.name", written alias.name), and builtins:
  // never the main file's or another module's globals.
  const modules = ast.modules ?? null;
  const entryMod = modules ? modules[0] : null;
  let currentMod = entryMod;
  const inModule = () => currentMod != null && !currentMod.isEntry;
  const modScopes = new Map();
  const modScope = (mod) => {
    let sc = modScopes.get(mod);
    if (!sc) {
      sc = new Scope();
      sc.resolve = (name) => name.includes('.') ? globals.lookup(name) : null;
      sc.names = () => [...mod.fns.keys()].filter(n => !mod.lifted.has(n));
      modScopes.set(mod, sc);
    }
    return sc;
  };
  // a bare name in a module that is one of that module's own fns: rewritten in place to its
  // internal name, so the interpreter and compiler see one global name per fn
  function lookupName(scope, node, key) {
    const entry = scope.lookup(node[key]);
    if (entry || !inModule()) return entry;
    const internal = currentMod.fns.get(node[key]);
    if (!internal) return null;
    const bare = node[key];
    node[key] = internal;
    node.shown = node.shown ?? bare;
    if (key === 'callee' && node.calleeNode) { node.calleeNode.name = internal; node.calleeNode.shown = bare; }
    return globals.lookup(internal);
  }
  function structByName(name) {
    if (structs.has(name)) return structs.get(name);
    if (inModule() && currentMod.structs.has(name)) return structs.get(currentMod.structs.get(name));
    return undefined;
  }
  // structs that code in the current file can see: its own and its direct imports'
  const visibleStructs = () => [...structs.values()].filter(st => !modules || st.builtin || st.mod === currentMod || (currentMod && currentMod.imports.has(st.mod)));
  // "did you mean geo.area?" for a bare name that an import of this file exports
  function importHint(name) {
    if (!currentMod || !currentMod.aliases) return null;
    for (const [alias, mod] of currentMod.aliases) if (mod.exports.includes(name)) return `${alias}.${name}`;
    return null;
  }
  const dname = (s) => s.bare ?? s.name;
  // module code naming one of the main file's fns: say why it can't see it
  function mainNameHint(node, name) {
    if (!inModule() || !globals.vars.has(name)) return;
    diag(node, `'${name}' is defined in the main file, which a module can't see`,
      `${currentMod.label} is a module: it sees only its own fns and structs, the modules it imports, and builtins. That keeps a module working the same whoever imports it.`,
      `move fn ${name} into ${currentMod.label} (or into a module both files import), or pass it in as a parameter.`);
  }
  const fnInfo = new Map(); // Fn node -> {paramTypes, retType, firstReturnLine, tryLine}
  let currentFn = null;
  let loopDepth = 0;
  let fieldPending = [];
  function resolveFieldPending() {
    let progress = true;
    while (progress && fieldPending.length) {
      progress = false;
      for (const item of [...fieldPending]) {
        const pt = prune(item.targetT);
        if (pt.k === 'var') continue;
        fieldPending.splice(fieldPending.indexOf(item), 1);
        progress = true;
        const { e, ft } = item;
        if (pt.k !== 'struct' || !pt.fields.has(e.name)) {
          diag(e.nameTok, `${tn(pt)} has no field '${e.name}'`, '', 'check the field name or the value it is read from.');
        }
        if (!unify(ft, pt.fields.get(e.name))) diag(e, `field ${pt.name}.${e.name} holds ${tn(pt.fields.get(e.name))}, but it is used as a ${tn(ft)}`, '', 'convert the value or use a different field.');
      }
    }
    for (const { e, owners } of fieldPending) {
      diag(e.nameTok, `'.${e.name}' is ambiguous here`,
        `'${snippet(e.target)}' could be any of: ${owners.map(o => o.name).join(', ')}; they all have a field '${e.name}', and nothing in this function pins down which struct it is.`,
        `use another (unique) field of the intended struct, or build/compare it with a struct literal so the type is known.`);
    }
    fieldPending = [];
  }
  // Struct fields shared by several structs are settled once the body has been checked.
  function resolvePending() {
    resolveFieldPending();
  }

  function diag(node, title, detail, fix, kind = 'TypeError') {
    // A Result handed to something that wants the plain value: the generic
    // "pass a list" fix doesn't help, unwrapping does.
    if (kind === 'TypeError' && /takes an? .*, but this is a Result</.test(title)) {
      const s = snippet(node);
      fix = `this value is a Result; unwrap it first. Inside a fn: ${s}? . Anywhere: match ${s} { ok(v) => ...  err(e) => ... }`;
    }
    throw new VowError({ kind, title, ...nodeLoc(src, node), detail, fix });
  }
  const tn = (t) => typeName(t);
  const snippet = (node) => {
    const s = src.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
    return s.length > 48 ? s.slice(0, 45) + '...' : s;
  };

  // Pass 0: hoist struct declarations (field types start as inference vars and
  // get pinned by usage — one type per field across the whole program).
  const structs = new Map(); // name -> { k:'struct', name, fields: Map(field -> type), line }
  for (const s of ast.stmts) {
    if (s.t !== 'Struct') continue;
    if (structs.has(s.name)) {
      diag(s.nameTok, `struct ${s.name} is declared twice`,
        `Another struct named '${s.name}' already exists (line ${structs.get(s.name).line}).`, 'rename one of them.');
    }
    const fields = new Map(s.fields.map(f => [f.name, tvar()]));
    structs.set(s.name, { k: 'struct', name: s.name, fields, line: s.pos.line, mod: s.mod });
  }
  // dateParts(ms) returns a builtin struct. It is only declared in programs that call
  // dateParts, so its field names (year, day, ...) never make field inference ambiguous elsewhere.
  if (callsBuiltin(ast, 'dateParts')) {
    if (structs.has('DateParts')) {
      const s = ast.stmts.find(st => st.t === 'Struct' && st.name === 'DateParts');
      diag(s.nameTok, `'DateParts' is the struct that dateParts() returns`,
        'This program calls dateParts(ms), whose result is a builtin struct named DateParts, so the name is taken.', 'rename your struct.');
    }
    structs.set('DateParts', { k: 'struct', name: 'DateParts', fields: new Map(DATE_PARTS_FIELDS.map(f => [f, NUM])), line: 0, builtin: true });
  }

  // Pass 1: hoist top-level functions so they can call each other (and recurse).
  for (const s of ast.stmts) {
    if (s.t !== 'Fn') continue;
    if (globals.has(s.name)) {
      diag(s.nameTok, `fn ${s.name} is declared twice`,
        `Another fn named '${s.name}' already exists in this program.`, 'rename one of them.');
    }
    const paramTypes = s.params.map(() => tvar());
    const retType = tvar();
    fnInfo.set(s, { paramTypes, retType, firstReturnLine: null, tryLine: null });
    globals.declare(s.name, { type: fnT(paramTypes, retType), line: s.pos.line, isFn: true });
  }

  // An agent coming from Python/Go/C often wraps everything in fn main() and never
  // calls it; the program then silently prints nothing. Catch that statically.
  const mainFn = ast.stmts.find(st => st.t === 'Fn' && st.name === 'main');
  if (mainFn && !/\bmain\s*\(/.test(src.slice(0, mainFn.start) + src.slice(mainFn.end))) {
    diag(mainFn.nameTok, 'fn main is declared but never called',
      'Vow has no implicit entry point: it runs the top-level statements of the file, top to bottom. Nothing calls main, so this program would do nothing.',
      'call it at the bottom of the file: main()  (or move its body to the top level). If main returns a Result, handle it: match main() { ok(v) => {} err(e) => print(e) }');
  }

  // Pass 2: check everything in order.
  for (const s of ast.stmts) checkStmt(s, globals);
  resolvePending();

  // Pass 3: capability effects — a fn can't touch net/fs/env unless its signature says so.
  const effects = checkEffects();

  // Pass 4: static contract proofs — refute contracts that can never hold.
  return { ...prove(src, ast), effects };

  function checkEffects() {
    const BUILTIN_EFFECTS = new Map([
      ['httpGet', 'net'], ['serve', 'net'], ['readFile', 'fs'], ['writeFile', 'fs'], ['env', 'env'],
    ]);
    const CAPS = ['net', 'fs', 'env'];
    const fnUses = new Map(); // fn name -> Set of declared capabilities
    for (const s of ast.stmts) if (s.t === 'Fn') fnUses.set(s.name, new Set((s.uses ?? []).map(u => u.name)));

    for (const s of ast.stmts) {
      if (s.t !== 'Fn') continue;
      for (const u of s.uses ?? []) {
        if (!CAPS.includes(u.name)) {
          let best = null, bestD = 3;
          for (const c of CAPS) { const d = editDistance(u.name, c); if (d < bestD) { bestD = d; best = c; } }
          diag(u.tok, `'${u.name}' is not a capability`,
            `Vow has three capabilities: net (httpGet, serve), fs (readFile, writeFile) and env (env).`,
            best ? `did you mean '${best}'?` : `remove it from the uses clause.`, 'EffectError');
        }
      }
    }

    // required: cap -> { node, why } (first use wins, for the error location)
    // inMod: code inside an imported module, where a bare name is never a fn of another file
    // (its own fns were rewritten to internal dotted names by the checker)
    function collect(node, required, inMod = false) {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const n of node) collect(n, required, inMod); return; }
      const usesOf = (name) => inMod && !name.includes('.') ? undefined : fnUses.get(name);
      if (node.t === 'Call') {
        const eff = BUILTIN_EFFECTS.get(node.callee);
        if (eff && !required.has(eff)) {
          required.set(eff, { node, why: `calls ${node.callee}(...), which needs the '${eff}' capability` });
        }
        const callee = usesOf(node.callee);
        const shown = node.shown ?? node.callee;
        if (callee) for (const cap of callee) {
          if (!required.has(cap)) required.set(cap, { node, why: `calls fn ${shown}, which declares 'uses ${cap}'` });
        }
        collect(node.args, required, inMod);
        return;
      }
      if (node.t === 'Ident') {
        const callee = usesOf(node.name);
        const shown = node.shown ?? node.name;
        if (callee) for (const cap of callee) {
          if (!required.has(cap)) required.set(cap, { node, why: `passes fn ${shown} around as a value, and fn ${shown} declares 'uses ${cap}'` });
        }
        return;
      }
      for (const k in node) {
        if (k === 'pos' || k === 'tok' || k === 'nameTok' || k === 'start' || k === 'end' || k === 'calleeNode') continue;
        const v = node[k];
        if (v != null && typeof v === 'object') collect(v, required, inMod);
      }
    }

    for (const s of ast.stmts) {
      if (s.t !== 'Fn') continue;
      const required = new Map();
      collect(s.body, required, s.mod != null && !s.mod.isEntry);
      const declared = fnUses.get(s.name);
      const n = dname(s);
      for (const [cap, info] of required) {
        if (!declared.has(cap)) {
          const allCaps = [...new Set([...required.keys(), ...declared])].sort();
          diag(info.node, `fn ${n} uses the '${cap}' capability without declaring it`,
            `fn ${n} ${info.why}, but its signature doesn't say so. In Vow a function can't touch the network, filesystem or environment unless it declares the capability; anyone reading the signature knows exactly what it can reach.`,
            `declare it in the signature: fn ${n}(...) uses ${allCaps.join(', ')} { ... }`, 'EffectError');
        }
      }
      for (const u of s.uses ?? []) {
        if (!required.has(u.name)) {
          diag(u.tok, `fn ${n} declares '${u.name}' but never uses it`,
            `Nothing in fn ${n}'s body needs the '${u.name}' capability. An unused capability is misleading; readers assume the function can reach more than it does.`,
            `remove '${u.name}' from the uses clause.`, 'EffectError');
        }
      }
    }

    // Everything the whole program can reach: top-level code (which needs no
    // declaration) plus every fn's declared caps. A host checks this against its
    // --allow policy before running anything.
    const program = new Map();
    collect(ast.stmts.filter(s => s.t !== 'Fn'), program);
    for (const s of ast.stmts) {
      if (s.t !== 'Fn') continue;
      for (const cap of fnUses.get(s.name)) {
        if (!program.has(cap)) program.set(cap, { node: s.nameTok ?? s, why: `fn ${s.name} declares 'uses ${cap}'${s.mod && !s.mod.isEntry ? ` (imported from ${s.mod.label})` : ''}` });
      }
    }
    return program;
  }

  function checkStmt(s, scope) {
    switch (s.t) {
      case 'Fn': return checkFn(s);
      case 'Struct': return;
      case 'Let': {
        if (structByName(s.name) && !structByName(s.name).builtin) {
          diag(s.nameTok, `'${s.name}' is already a struct name`,
            `struct ${s.name} is declared at line ${structByName(s.name).line}, and a variable with the same name would make ${s.name} { ... } literals ambiguous.`,
            'pick a different variable name (struct names are usually Capitalized, variables lowercase).');
        }
        if (scope.has(s.name)) {
          const prev = scope.vars.get(s.name);
          diag(s.nameTok, `'${s.name}' is already declared`,
            `'${s.name}' was created at line ${prev.line}. 'let' always creates a new variable.`,
            `to change its value write: ${s.name} = ... (without let), or pick a new name.`);
        }
        let selfT = null;
        if (s.rec) { // recursive closure: its own name is visible (monomorphic) inside its body
          selfT = tvar();
          scope.declare(s.name, { type: selfT, line: s.pos.line });
        }
        const t = inferExpr(s.expr, scope);
        if (selfT) unify(selfT, t);
        if (prune(t).k === 'unit') {
          diag(s.expr, `this has no value to store`,
            `The right side of this 'let' is a call that returns nothing (unit).`,
            `make the function return a value, or drop the 'let ${s.name} ='.`);
        }
        scope.declare(s.name, { type: t, line: s.pos.line });
        return;
      }
      case 'Assign': return checkAssign(s, scope);
      case 'ExprStmt': {
        const t = inferExpr(s.expr, scope);
        if (prune(t).k === 'result') {
          diag(s.expr, 'this Result is ignored',
            `'${snippet(s.expr)}' returns a ${tn(t)}; it might be an error, and Vow requires every possible error to be handled.`,
            `wrap it in a match:\n  match ${snippet(s.expr)} {\n    ok(v) => ...\n    err(e) => ...\n  }`);
        }
        // pure builtins return a NEW value and never change their argument, so calling
        // one as a statement is always a bug (sort(xs) leaves xs unsorted)
        const PURE = ['replace', 'startsWith', 'endsWith', 'indexOf', 'repeat', 'padLeft', 'padRight', 'lines', 'checkLogin', 'askLogin', 'now', 'fixed', 'html', 'text', 'respond', 'redirect', 'param', 'escape', 'sort', 'sortBy', 'reverse', 'slice', 'trim', 'upper', 'lower', 'join', 'split', 'keys', 'str', 'abs', 'floor', 'min', 'max', 'sum', 'len', 'contains', 'has', 'toJson',
          'matches', 'findAll', 'replaceAll', 'splitOn', 'words', 'sig', 'isInt', 'map', 'filter', 'any', 'all', 'count', 'fold', 'uniq', 'values', 'field', 'at', 'isNull', 'truthy', 'jsonType', 'jsonKeys', 'jsonList',
          'sqrt', 'pow', 'exp', 'ln', 'log', 'sin', 'cos', 'tan', 'atan2', 'ceil', 'trunc', 'pi', 'random', 'randomInt', 'dateParts', 'isoDate', 'daysBetween'];
        if (s.expr.t === 'Call' && PURE.includes(s.expr.callee) && !scope.lookup(s.expr.callee)) {
          const a0 = s.expr.args[0] ? snippet(s.expr.args[0]) : 'x';
          const isVar = s.expr.args[0] && s.expr.args[0].t === 'Ident';
          diag(s.expr, `the result of ${s.expr.callee}(...) is thrown away`,
            `${s.expr.callee}() returns a new value and never modifies its argument, so this line has no effect.`,
            ['map', 'any', 'all', 'count', 'fold'].includes(s.expr.callee)
              ? `use the value (let v = ${snippet(s.expr)}), or, to just do something for each item, use a loop: for x in ${a0} { ... }`
              : isVar && ['sort', 'sortBy', 'reverse', 'slice', 'trim', 'upper', 'lower', 'filter', 'uniq', 'replaceAll'].includes(s.expr.callee)
              ? `assign it back: ${a0} = ${snippet(s.expr)}`
              : `use the value: let v = ${snippet(s.expr)}`);
        }
        return;
      }
      case 'If': {
        checkCond(s.cond, scope, 'if');
        checkStmt(s.then, new Scope(scope));
        if (s.alt) checkStmt(s.alt, s.alt.t === 'If' ? scope : new Scope(scope));
        return;
      }
      case 'While': {
        checkCond(s.cond, scope, 'while');
        loopDepth++;
        checkStmt(s.body, new Scope(scope));
        loopDepth--;
        return;
      }
      case 'For': {
        const iterT = inferExpr(s.iter, scope);
        const el = tvar();
        if (!unify(iterT, listT(el))) {
          const pi = prune(iterT);
          let fix = 'give the for loop a list to walk over.';
          if (pi.k === 'map') fix = `loop over the keys instead: for ${s.binder} in keys(${snippet(s.iter)})`;
          if (pi.k === 'str') fix = `split it into a list first: for ${s.binder} in split(${snippet(s.iter)}, "")`;
          if (pi.k === 'num') fix = `use a range: for ${s.binder} in range(0, ${snippet(s.iter)})`;
          if (pi.k === 'json') fix = `for a json array: for ${s.binder} in jsonList(${snippet(s.iter)}); for a json object: for k in jsonKeys(${snippet(s.iter)}) and read field(${snippet(s.iter)}, k). Both give [] when the value is the other kind.`;
          diag(s.iter, `for loops walk over lists, but this is a ${tn(iterT)}`, '', fix);
        }
        loopDepth++;
        const inner = new Scope(scope);
        inner.declare(s.binder, { type: el, line: s.pos.line });
        checkStmt(s.body, inner);
        loopDepth--;
        return;
      }
      case 'Return': {
        if (!currentFn) {
          // A bare top-level return ends the program, like exiting a script early.
          // (bench: agents wrote this in 2 of 14 failed head-to-head attempts)
          if (s.value) diag(s.value, "a top-level 'return' can't carry a value",
            "At the top level, 'return' just ends the program; there is no caller to receive a value.",
            `print it first, then end the program: print(${snippet(s.value)}) then return`);
          return;
        }
        const t = s.value ? inferExpr(s.value, scope) : UNIT;
        const info = currentFn.info;
        if (!unify(info.retType, t)) {
          const cause = info.firstReturnLine != null
            ? `An earlier return (line ${info.firstReturnLine})`
            : info.tryLine != null
              ? `A '?' on line ${info.tryLine} (which makes the function return the err it unwraps)`
              : 'An earlier part of the function';
          const kinds = new Set([prune(info.retType).k, prune(t).k]);
          const isLambda = currentFn.name === '(lambda)';
          diag(s.value ?? s, isLambda ? 'this lambda returns two different types' : `fn ${currentFn.name} returns two different types`,
            `${cause} made this ${isLambda ? 'lambda' : 'function'} return ${tn(info.retType)}, but this return gives back ${tn(t)}. A Vow ${isLambda ? 'lambda' : 'function'} returns exactly one type.`,
            // a sortBy key that is a num for some rows and a str for others (bench: mini-query)
            kinds.has('json') && kinds.size === 2 && [...kinds].some(k => k === 'str' || k === 'num' || k === 'bool')
              ? `keep one type: to render a json value as text return str(v) (strings as-is, numbers like str(num), true/false, null as "null"); test it with truthy(v) / isNull(v); return the json value itself and convert at the use site.`
              : !isLambda && kinds.has('result') && prune(info.retType).k === 'result' && prune(t).k === 'result' && [prune(info.retType).ok, prune(t).ok].every(x => ['num', 'str', 'bool'].includes(prune(x).k))
              ? `different json kinds give different types (jsonNum → Result<num, str>, jsonStr → Result<str, str>). To turn any json value into text, return str(v); to test it, truthy(v).`
              : kinds.has('bool') && kinds.has('result')
              ? `for a true/false answer about a json value, truthy(v) or isNull(v) give a plain bool; otherwise wrap: return ok(...) on every path.`
              : isLambda && kinds.has('num') && kinds.has('str')
              ? 'if this is a sort key, decide the key type before sorting and use two sortBy calls: if allNumeric { rows = sortBy(rows, r => numKey(r)) } else { rows = sortBy(rows, r => strKey(r)) }. Otherwise convert one side with str(...) or num(...).'
              : info.tryLine != null && prune(info.retType).k === 'result'
              ? `either wrap this value in ok(...), as in return ok(${snippet(s.value ?? s)}, which makes every CALLER handle a Result, or keep this return as-is and replace the '?' on line ${info.tryLine} with a match that handles the err right there.`
              : `make every return give the same type; to allow success and failure, return ok(...) / err(...) so the type is a Result.`);
        }
        if (info.firstReturnLine == null) info.firstReturnLine = s.pos.line;
        return;
      }
      case 'Break':
      case 'Continue':
        if (loopDepth === 0) diag(s, `'${s.t.toLowerCase()}' outside of a loop`,
          'break and continue only work inside while or for loops.', 'remove it or move it into a loop.');
        return;
      case 'Block': {
        const inner = new Scope(scope);
        for (const st of s.stmts) checkStmt(st, inner);
        return;
      }
      case 'MatchStmt': return void checkMatch(s.match, scope, false);
    }
  }

  function checkCond(cond, scope, kw) {
    const t = inferExpr(cond, scope);
    if (!unify(t, BOOL)) {
      const pt = prune(t);
      let fix = 'use a comparison that produces a bool.';
      if (pt.k === 'num') fix = `compare it explicitly: ${snippet(cond)} != 0`;
      if (pt.k === 'str') fix = `compare it explicitly: ${snippet(cond)} != ""`;
      if (pt.k === 'result') fix = `a Result is handled with match, not if: match ${snippet(cond)} { ok(v) => ... err(e) => ... }`;
      if (pt.k === 'json') fix = `truthy(${snippet(cond)}) is false for null, false, 0, "", [] and {}; isNull(${snippet(cond)}) tests for null only.`;
      if (pt.k === 'list') fix = `test it explicitly: len(${snippet(cond)}) > 0`;
      diag(cond, `${kw} needs a bool condition, but this is a ${tn(t)}`,
        'Vow never treats other types as true/false.', fix);
    }
  }

  function checkAssign(s, scope) {
    const valT = inferExpr(s.value, scope);
    if (s.target.t === 'Ident') {
      const entry = scope.lookup(s.target.name);
      if (!entry) {
        diag(s.target, `'${s.target.name}' doesn't exist yet`,
          'Assignment changes an existing variable, but this one was never declared.',
          `declare it first: let ${s.target.name} = ${snippet(s.value)}`);
      }
      if (entry.isFn) diag(s.target, `'${s.target.name}' is a function`, 'Functions cannot be reassigned.', 'pick a different variable name.');
      if (!unify(entry.type, valT)) {
        diag(s.value, `'${s.target.name}' would change type from ${tn(entry.type)} to ${tn(valT)}`,
          `'${s.target.name}' was created as a ${tn(entry.type)} at line ${entry.line}, and a Vow variable keeps one type for its whole life.`,
          prune(valT).k === 'str' || prune(entry.type).k === 'str'
            ? `convert explicitly with str(...) or num(...), or create a new variable with let.`
            : 'create a new variable with let.');
      }
      return;
    }
    if (s.target.t === 'Field') {
      const slotT = inferField(s.target, scope);
      if (!unify(slotT, valT)) {
        diag(s.value, `this field holds ${tn(slotT)}, but you're storing a ${tn(valT)}`,
          'A struct field keeps one type for its whole life, in every instance.',
          'convert the value first (str(...) / num(...)), or use a different field.');
      }
      return;
    }
    // Index assignment
    const slotT = inferIndex(s.target, scope, true);
    if (!unify(slotT, valT)) {
      diag(s.value, `this element holds ${tn(slotT)}, but you're storing a ${tn(valT)}`,
        'Every element of a list or map has the same type.',
        'convert the value first (e.g. with str(...)), or use a different collection.');
    }
  }

  function checkFn(s) {
    const prevMod = currentMod;
    if (s.mod) currentMod = s.mod;
    try { checkFnIn(s); } finally { currentMod = prevMod; }
  }
  function checkFnIn(s) {
    const info = fnInfo.get(s);
    const scope = new Scope(s.mod && !s.mod.isEntry ? modScope(s.mod) : globals);
    s.params.forEach((p, i) => scope.declare(p.name, { type: info.paramTypes[i], line: s.pos.line }));

    for (const cond of s.expects) {
      const t = inferExpr(cond, scope);
      if (!unify(t, BOOL)) diag(cond, `an expects clause must be a bool condition, but this is a ${tn(t)}`,
        'Contracts are conditions that are checked when the function is called.',
        `write a comparison, e.g. expects ${snippet(cond)} > 0`);
    }

    const prevFn = currentFn;
    currentFn = { name: dname(s), info };
    implicitReturn(s.body);
    checkStmt(s.body, new Scope(scope));
    currentFn = prevFn;

    const ensuresScope = new Scope(scope);
    ensuresScope.declare('result', { type: info.retType, line: s.pos.line });
    for (const cond of s.ensures) {
      const t = inferExpr(cond, ensuresScope);
      if (!unify(t, BOOL)) diag(cond, `an ensures clause must be a bool condition, but this is a ${tn(t)}`,
        "Use 'result' to refer to the value being returned.",
        'write a comparison, e.g. ensures result >= 0');
    }

    const ret = prune(info.retType);
    if (ret.k === 'var' && !usesRet(s.body)) unify(info.retType, UNIT); // never returns a value
    if (prune(info.retType).k !== 'unit' && !definitelyReturns(s.body)) {
      diag(s.nameTok, `fn ${dname(s)} might finish without returning a value`,
        `This function returns ${tn(info.retType)}, but there's a path through the body that reaches the end with no return statement.`,
        'add a return at the end of the function, or make sure every if/else and match arm returns.');
    }

    resolvePending();

    // Generalize: vars used only by this fn become generic, so each call site
    // gets its own copy (fn first(xs) { return xs[0] } works for any list).
    const entry = globals.vars.get(s.name);
    const envVars = new Set();
    for (const [name, g] of globals.vars) if (name !== s.name) ftv(g.type, envVars);
    for (const st of structs.values()) for (const t of st.fields.values()) ftv(t, envVars);
    entry.scheme = { vars: [...ftv(entry.type)].filter(id => !envVars.has(id)), type: entry.type };
  }

  // Finds a return/break/continue that would escape a value-producing match arm.
  function findEscape(node, inLoop) {
    switch (node.t) {
      case 'Return': return { kind: 'return', node };
      case 'Break': return inLoop ? null : { kind: 'break', node };
      case 'Continue': return inLoop ? null : { kind: 'continue', node };
      case 'Block': {
        for (const s of node.stmts) { const e = findEscape(s, inLoop); if (e) return e; }
        return null;
      }
      case 'If': return findEscape(node.then, inLoop) || (node.alt ? findEscape(node.alt, inLoop) : null);
      case 'While': case 'For': return findEscape(node.body, true);
      case 'MatchStmt': {
        for (const a of node.match.arms) {
          if (a.body.t === 'Block') { const e = findEscape(a.body, inLoop); if (e) return e; }
        }
        return null;
      }
      default: return null;
    }
  }

  function usesRet(node) {
    switch (node.t) {
      case 'Return': return node.value != null;
      case 'Block': return node.stmts.some(usesRet);
      case 'If': return usesRet(node.then) || (node.alt != null && usesRet(node.alt));
      case 'While': case 'For': return usesRet(node.body);
      case 'MatchStmt': return node.match.arms.some(a => a.body.t === 'Block' && usesRet(a.body));
      default: return false;
    }
  }

  function definitelyReturns(node) {
    switch (node.t) {
      case 'Return': return true;
      case 'Block': return node.stmts.some(definitelyReturns);
      case 'If': return node.alt != null && definitelyReturns(node.then) && definitelyReturns(node.alt);
      // the checker rejects non-exhaustive matches, so every arm returning means the match returns
      case 'MatchStmt': return node.match.arms.every(a => a.body.t === 'Block' && definitelyReturns(a.body));
      default: return false;
    }
  }

  // ---------- expressions ----------

  function inferExpr(e, scope) {
    switch (e.t) {
      case 'Num': return NUM;
      case 'Str': checkBare(e, scope); return STR;
      case 'Bool': return BOOL;
      case 'Ident': {
        const entry = lookupName(scope, e, 'name');
        if (entry) return entry.scheme ? instantiate(entry.scheme) : entry.type;
        mainNameHint(e, e.name);
        const hint = importHint(e.name);
        if (hint) diag(e, `'${e.name}' is in an imported module: write ${hint}`,
          `Names from another file are always used through the module's name, so they can never collide with names here.`, `write ${hint}`);
        if (BUILTIN_NAMES.includes(e.name)) {
          diag(e, `'${e.name}' is a builtin function; call it`,
            `Builtins can only be used as calls in Vow v0.1.`, `write ${e.name}(...) with arguments.`);
        }
        if (['null', 'nil', 'None', 'undefined'].includes(e.name)) {
          diag(e, `'${e.name}' doesn't exist: Vow has no null`,
            'A plain Vow value is never missing. JSON nulls are json values: field(j, "key") and at(j, i) give a json null when the key or index is missing, and isNull(j) tests for one.',
            'for json data, return field(...)/at(...) (a json null when missing) and test with isNull(v); for anything else that may be missing, return a Result: ok(value) / err("missing").');
        }
        const names = [...new Set([...scope.allNames(), ...BUILTIN_NAMES])].filter(n => !n.includes('.'));
        let best = null, bestD = 3;
        for (const n of names) {
          const d = editDistance(e.name, n);
          if (d < bestD) { bestD = d; best = n; }
        }
        diag(e, `'${e.name}' doesn't exist`,
          `No variable or function with this name is in scope here.`,
          best ? `did you mean '${best}'?` : `declare it first: let ${e.name} = ...`);
      }
      case 'ListLit': {
        const el = tvar();
        for (const item of e.items) {
          const t = inferExpr(item, scope);
          if (!unify(el, t)) {
            // a short literal of differently-shaped things is almost always a tuple
            // (return [columns, rows]); a struct is the Vow way to bundle them (bench: mini-query)
            const parts = e.items.map(i => snippet(i));
            const scalar = (k) => k === 'num' || k === 'str' || k === 'bool';
            const bothScalar = scalar(prune(el).k) && scalar(prune(t).k);
            diag(item, `this list mixes ${tn(el)} and ${tn(t)}`,
              'A Vow list holds values of a single type, and there are no tuples.',
              !bothScalar && e.items.length <= 4 && e.items.every(i => i.t === 'Ident')
                ? `to return several things together, declare a struct at the top level and build one: struct Pair { ${e.items.map(i => i.name).join(', ')} } then Pair { ${e.items.map(i => `${i.name}: ${i.name}`).join(', ')} }`
                : `convert the values to one type (e.g. with str(...)), or bundle different things in a struct instead of a list (${parts.slice(0, 2).join(', ')}).`);
          }
        }
        return listT(el);
      }
      case 'MapLit': {
        const val = tvar();
        for (const entry of e.entries) {
          const t = inferExpr(entry.value, scope);
          if (!unify(val, t)) {
            diag(entry.value, `this map mixes ${tn(val)} and ${tn(t)} values`,
              'All values in a Vow map have a single type (keys are always strings).',
              `for a record with fields of different types, declare a struct instead: struct Item { ${e.entries.slice(0, 3).map(en => en.key).join(', ')} } then Item { ${e.entries.slice(0, 3).map(en => en.key + ': ...').join(', ')} }. Maps are for many entries of ONE type.`);
          }
        }
        return mapT(val);
      }
      case 'Unary': {
        const t = inferExpr(e.operand, scope);
        if (e.op === 'not') {
          if (!unify(t, BOOL)) diag(e.operand, `'not' needs a bool, but this is a ${tn(t)}`,
            'Vow never treats other types as true/false.', `compare explicitly, e.g. not (${snippet(e.operand)} == 0)`);
          return BOOL;
        }
        if (!unify(t, NUM)) diag(e.operand, `unary '-' needs a num, but this is a ${tn(t)}`,
          'Only numbers can be negated.', 'convert it with num(...) first (and match the Result).');
        return NUM;
      }
      case 'Try': {
        const t = inferExpr(e.operand, scope);
        const okT = tvar(), errT = tvar();
        if (!unify(t, resultT(okT, errT))) {
          diag(e.operand, `'?' unwraps a Result, but this is a ${tn(t)}`,
            `'?' turns ok(v) into v, and makes the function return early when the value is err(e).`,
            isPlainJsonList(e.operand)
              ? `${e.operand.callee}() returns a plain list ([] when the value is the wrong kind), so drop the ?: ${snippet(e.operand)}`
              : 'remove the ?, or apply it to something that returns a Result (like num(...) or get(...)).');
        }
        if (!currentFn) {
          diag(e, `'?' only works inside a function`,
            `When the value is err(e), '?' makes the surrounding function return that err; at the top level there's nothing to return from.`,
            `handle the Result with match instead:\n  match ${snippet(e.operand)} { ok(v) => ...  err(e) => ... }`);
        }
        const info = currentFn.info;
        if (!unify(info.retType, resultT(tvar(), errT))) {
          diag(e, `'?' needs fn ${currentFn.name} to return a Result`,
            `When this value is err(e), fn ${currentFn.name} returns that err to its caller; so its return type must be a Result, but it is ${tn(info.retType)}.`,
            'return ok(...) for the success case so the function returns a Result, or handle this value with match instead of ?.');
        }
        if (info.tryLine == null) info.tryLine = nodeLoc(src, e).line;
        return okT;
      }
      case 'Binary': return inferBinary(e, scope);
      case 'Index': return inferIndex(e, scope, false);
      case 'Call': return inferCall(e, scope);
      case 'Match': return checkMatch(e, scope, true);
      case 'IfExpr': return inferIfExpr(e.stmt, scope);
      case 'StructLit': return inferStructLit(e, scope);
      case 'Field': return inferField(e, scope);
      case 'InterpStr': {
        checkBare(e, scope);
        for (const part of e.parts) {
          if (part.kind !== 'expr') continue;
          const t = inferExpr(part.expr, scope);
          if (prune(t).k === 'unit') {
            diag(part.expr, 'this interpolation has no value to insert',
              `'${snippet(part.expr)}' returns nothing (unit), so there's nothing to put into the string.`,
              'interpolate an expression that produces a value.');
          }
        }
        return STR;
      }
      case 'Lambda': return inferLambda(e, scope);
    }
  }

  // Old-style "hi {name}" is literal text now that only ${...} interpolates. When the
  // braces wrap a variable that is in scope, the author almost surely meant to insert it.
  // ("{{name}}" template text and an escaped \{name} are left alone; the lexer filters those.)
  function checkBare(e, scope) {
    for (const b of e.bare ?? []) {
      const entry = scope.lookup(b.name);
      if (!entry || entry.isFn) continue;
      const lit = src.slice(e.start, e.end);
      const fixed = lit.slice(0, b.start - e.start) + '${' + b.name + '}' + lit.slice(b.end - e.start);
      diag(b, `"{${b.name}}" is literal text in Vow; to insert the value write \${${b.name}}`,
        `'${b.name}' is a variable here, but in a Vow string only \${...} inserts a value: plain braces are kept as text, so this would print the braces and the name.`,
        `${fixed.length <= 80 ? fixed : '"...${' + b.name + '}..."'}  (if you really want the braces as text, write \\{${b.name}})`);
    }
  }

  function inferLambda(e, scope) {
    const paramTypes = e.params.map(() => tvar());
    const retType = tvar();
    const inner = new Scope(scope);
    e.params.forEach((p, i) => inner.declare(p.name, { type: paramTypes[i], line: p.tok.line }));

    const info = { paramTypes, retType, firstReturnLine: null, tryLine: null };
    const prevFn = currentFn, prevLoop = loopDepth;
    currentFn = { name: '(lambda)', info };
    loopDepth = 0; // break/continue can't escape a lambda into an outer loop
    implicitReturn(e.body);
    checkStmt(e.body, inner);
    currentFn = prevFn; loopDepth = prevLoop;

    const ret = prune(retType);
    if (ret.k === 'var' && !usesRet(e.body)) unify(retType, UNIT);
    if (prune(retType).k !== 'unit' && !definitelyReturns(e.body)) {
      diag(e, 'this lambda might finish without returning a value',
        `It returns ${tn(retType)}, but there's a path through the body that reaches the end with no return statement.`,
        'add a return at the end of the lambda body.');
    }
    // Lambdas are monomorphic: they close over local variables, so their
    // type vars belong to the enclosing scope and are never generalized.
    return fnT(paramTypes, retType);
  }

  function inferStructLit(e, scope) {
    const st = structByName(e.name);
    if (!st || st.builtin) {
      const hint = importHint(e.name);
      if (hint) diag(e.nameTok, `struct ${e.name} is in an imported module: write ${hint} { ... }`,
        'Names from another file are always used through the module\'s name.', `write ${hint} { ${e.fields.map(f => f.name + ': ...').join(', ')} }`);
      diag(e.nameTok, `struct ${e.name} is not declared`,
        'A struct must be declared at the top level before values of it can be built.',
        `declare it first: struct ${e.name} { ${e.fields.map(f => f.name).join(', ')} }`);
    }
    if (st.name !== e.name) { e.shown = e.shown ?? e.name; e.name = st.name; }
    for (const f of e.fields) {
      if (!st.fields.has(f.name)) {
        let best = null, bestD = 3;
        for (const n of st.fields.keys()) {
          const d = editDistance(f.name, n);
          if (d < bestD) { bestD = d; best = n; }
        }
        diag(f.tok, `struct ${e.shown ?? e.name} has no field '${f.name}'`,
          `Its fields are: ${[...st.fields.keys()].join(', ')}.`,
          best ? `did you mean '${best}'?` : `remove this entry, or add '${f.name}' to the struct declaration.`);
      }
      const t = inferExpr(f.value, scope);
      const ft = st.fields.get(f.name);
      if (!unify(ft, t)) {
        diag(f.value, `field ${e.name}.${f.name} holds ${tn(ft)}, but this is a ${tn(t)}`,
          `Every ${e.name} in the program uses the same type for each field.`,
          'convert the value (str(...) / num(...)), or use a different field.');
      }
    }
    const missing = [...st.fields.keys()].filter(n => !e.fields.some(f => f.name === n));
    if (missing.length) {
      diag(e, `this ${e.name} is missing field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
        `struct ${e.name} declares ${st.fields.size} field${st.fields.size === 1 ? '' : 's'} (${[...st.fields.keys()].join(', ')}), and a Vow struct value always sets all of them; there are no nulls to fill the gaps.`,
        `add ${missing.map(n => `${n}: ...`).join(', ')} to this literal.`);
    }
    return st;
  }

  function inferField(e, scope) {
    const targetT = inferExpr(e.target, scope);
    const pt = prune(targetT);

    if (pt.k === 'var') {
      // Field-based inference: if exactly one struct has this field, that's the type.
      const owners = visibleStructs().filter(st => st.fields.has(e.name));
      if (owners.length === 1) { unify(targetT, owners[0]); return owners[0].fields.get(e.name); }
      if (owners.length > 1) {
        // several structs share this field: wait for the rest of the body to pin the type
        // (a later p.cost, a struct literal, a call) before calling it ambiguous
        const ft = tvar();
        fieldPending.push({ targetT, ft, e, owners });
        return ft;
      }
      if (visibleStructs().length === 0) {
        diag(e.nameTok, `'.${e.name}' reads a struct field, but no structs are declared`,
          'The dot operator only works on struct values.',
          `declare one first: struct Thing { ${e.name} }`);
      }
      diag(e.nameTok, `no struct has a field '${e.name}'`,
        `Declared structs: ${visibleStructs().map(st => st.name).join(', ')}.`,
        suggestField(e.name) ?? `add '${e.name}' to one of the struct declarations.`);
    }

    if (pt.k === 'struct') {
      if (!pt.fields.has(e.name)) {
        let best = null, bestD = 3;
        for (const n of pt.fields.keys()) {
          const d = editDistance(e.name, n);
          if (d < bestD) { bestD = d; best = n; }
        }
        diag(e.nameTok, `struct ${pt.name} has no field '${e.name}'`,
          `Its fields are: ${[...pt.fields.keys()].join(', ')}.`,
          best ? `did you mean '.${best}'?` : `add '${e.name}' to the struct ${pt.name} declaration.`);
      }
      return pt.fields.get(e.name);
    }

    let fix = 'the dot operator only works on struct values.';
    if (pt.k === 'map') fix = `maps are indexed with brackets: ${snippet(e.target)}["${e.name}"]`;
    if (pt.k === 'result') fix = `unpack the Result first: match ${snippet(e.target)} { ok(v) => v.${e.name} ... }`;
    if (pt.k === 'list') fix = `index the list first: ${snippet(e.target)}[0].${e.name}`;
    diag(e.nameTok, `'.${e.name}' reads a struct field, but this is a ${tn(targetT)}`, '', fix);
  }

  function suggestField(name) {
    let best = null, bestD = 3;
    for (const st of visibleStructs()) {
      for (const n of st.fields.keys()) {
        const d = editDistance(name, n);
        if (d < bestD) { bestD = d; best = `${st.name} has '.${n}'`; }
      }
    }
    return best ? `did you mean ${best}?` : null;
  }

  function inferBinary(e, scope) {
    const { op } = e;
    const lt = inferExpr(e.left, scope);
    const rt = inferExpr(e.right, scope);
    const pl = prune(lt), pr = prune(rt);

    if (op === 'and' || op === 'or') {
      for (const [t, node] of [[lt, e.left], [rt, e.right]]) {
        if (!unify(t, BOOL)) diag(node, `'${op}' needs bool operands, but this side is a ${tn(t)}`,
          'and/or combine true/false values.', `turn this into a comparison, e.g. ${snippet(node)} != 0`);
      }
      return BOOL;
    }

    if (op === '+') {
      if ((pl.k === 'str' && pr.k === 'num') || (pl.k === 'num' && pr.k === 'str')) {
        const numSide = pl.k === 'num' ? e.left : e.right;
        diag(e, `can't add a num and a str`,
          `'${snippet(e.left)}' is a ${tn(lt)} and '${snippet(e.right)}' is a ${tn(rt)}. Vow never converts types implicitly.`,
          `convert the number to text first: str(${snippet(numSide)})`);
      }
      if (!unify(lt, rt)) {
        const js = prune(lt).k === 'json' ? e.left : prune(rt).k === 'json' ? e.right : null;
        diag(e, `can't add ${tn(lt)} and ${tn(rt)}`,
          `'+' joins two nums (addition) or two strs (concatenation), and both sides must match.`,
          js ? `for text, str(${snippet(js)}) renders a json value (strings as-is, numbers like str(num)); for arithmetic, jsonNum(${snippet(js)}) gives a Result<num, str>.`
            : 'convert one side with str(...) or num(...).');
      }
      const both = prune(lt);
      if (both.k === 'var') { unify(lt, cvar({ k: 'ord' })); return lt; } // num or str, settled per call
      if (both.k === 'num' || both.k === 'str') return both;
      diag(e, `'+' doesn't work on ${tn(lt)}`,
        `'+' joins two nums or two strs.`,
        both.k === 'list' ? 'use push(list, item) to add to a list.' : 'convert the values with str(...) first.');
    }

    if (['-', '*', '/', '%'].includes(op)) {
      for (const [t, node] of [[lt, e.left], [rt, e.right]]) {
        if (!unify(t, NUM)) diag(node, `'${op}' needs numbers, but this side is a ${tn(t)}`,
          'Math operators only work on nums.',
          prune(t).k === 'str' ? `parse it first: num(${snippet(node)}); and match the Result it returns.` : 'use a num here.');
      }
      return NUM;
    }

    if (['<', '<=', '>', '>='].includes(op)) {
      if (!unify(lt, rt)) diag(e, `can't compare ${tn(lt)} with ${tn(rt)}`,
        'Both sides of a comparison must be the same type.', 'convert one side with str(...) or num(...).');
      const both = prune(lt);
      if (both.k === 'var') unify(lt, cvar({ k: 'ord' })); // num or str, settled per call
      else if (both.k !== 'num' && both.k !== 'str') {
        diag(e, `'${op}' can't order two ${tn(lt)} values`, 'Only nums and strs have an ordering.', 'compare a specific field or use == instead.');
      }
      return BOOL;
    }

    // == and !=
    if (!unify(lt, rt)) {
      // json is opaque: it has to be unwrapped, not converted (bench: json-flatten, 2 attempts)
      const jsonSide = prune(lt).k === 'json' ? e.left : prune(rt).k === 'json' ? e.right : null;
      const other = prune(jsonSide === e.left ? rt : lt).k;
      diag(e, `comparing a ${tn(lt)} with a ${tn(rt)}`,
        'These are different types, so this comparison could never be true, almost certainly a bug.',
        jsonSide
          ? (other === 'str'
            ? `compare its text: str(${snippet(jsonSide)}) == ... (str of a json string is the string itself), or unwrap it: jsonStr(${snippet(jsonSide)}) gives a Result to match on; jsonType(${snippet(jsonSide)}) == "string" checks the kind`
            : other === 'bool'
            ? `truthy(${snippet(jsonSide)}) gives a bool (false for null, false, 0, "", [] and {}); jsonBool(${snippet(jsonSide)}) gives a Result for a strict bool`
            : `a json value has to be unwrapped first: ${other === 'num' ? 'jsonNum' : 'jsonStr'}(${snippet(jsonSide)}) gives a Result to match on, or check its kind with jsonType(${snippet(jsonSide)}) == "number"`)
          : 'convert one side so both have the same type (str(...) or num(...)).');
    }
    return BOOL;
  }

  function inferIndex(e, scope, isAssign) {
    const targetT = inferExpr(e.target, scope);
    const indexT = inferExpr(e.index, scope);
    const pt = prune(targetT);

    if (pt.k === 'var') {
      // list, map, str, or json, whichever the caller passes (the key type narrows it; checked per call)
      const el = tvar();
      if (!unify(targetT, cvar({ k: 'index', key: indexT, el }))) diag(e.target, `only strs, lists, maps, and json can be indexed, but this is a ${tn(targetT)}`, '', 'index a list with a number or a map with a string.');
      return el;
    }
    if (pt.k === 'list') {
      if (!unify(indexT, NUM)) diag(e.index, `list indexes are nums, but this is a ${tn(indexT)}`,
        `'${snippet(e.target)}' is a ${tn(targetT)}, so it's indexed by position.`, 'use a numeric index, e.g. items[0].');
      return pt.el;
    }
    if (pt.k === 'json') {
      if (isAssign) {
        diag(e.target, 'JSON values are read-only',
          'A json value is a snapshot of parsed text; it cannot be modified in place.',
          'build Vow data (maps/lists/structs) and serialize it with toJson(...) instead.');
      }
      const pk = prune(indexT);
      if (pk.k === 'var') unify(indexT, STR);
      else if (pk.k !== 'str' && pk.k !== 'num') {
        diag(e.index, `JSON is indexed by str (object key) or num (array position), but this is a ${tn(indexT)}`,
          '', 'use a string key like j["name"] or a numeric index like j[0].');
      }
      return JSONT; // traps at runtime if missing — use get(j, key) for a Result instead
    }
    if (pt.k === 'map') {
      if (!unify(indexT, STR)) diag(e.index, `map keys are strs, but this is a ${tn(indexT)}`,
        `'${snippet(e.target)}' is a ${tn(targetT)}, so it's indexed by string key.`,
        prune(indexT).k === 'num' ? `convert it: ${snippet(e.target)}[str(${snippet(e.index)})]` : 'use a string key.');
      return pt.val;
    }
    if (pt.k === 'str') { // s[i] is the one-character str at position i (Vow has no char type)
      if (isAssign) diag(e.target, `strings can't be changed in place`, 'A str value is immutable.',
        `build a new string instead, e.g. slice(s, 0, i) + "x" + slice(s, i + 1, len(s))`);
      if (!unify(indexT, NUM)) diag(e.index, `strings are indexed by position (a num), but this is a ${tn(indexT)}`, '', 'use a numeric index, e.g. s[0].');
      return STR;
    }
    diag(e.target, `can't index into a ${tn(targetT)}`,
      'Only strs and lists (by a num position), maps (by a str key) and json values can be indexed.', 'check the type of this value.');
  }

  function inferCall(e, scope) {
    const entry = lookupName(scope, e, 'callee');
    const cn = e.shown ?? e.callee; // as written: geo.area for a module fn
    if (entry) {
      const ft = prune(entry.scheme ? instantiate(entry.scheme) : entry.type);
      if (ft.k === 'var') {
        const params = e.args.map(() => tvar()), ret = tvar();
        unify(entry.type, fnT(params, ret));
        e.args.forEach((a, i) => unify(params[i], inferExpr(a, scope)));
        return ret;
      }
      if (ft.k !== 'fn') {
        diag(e.calleeNode, `'${e.callee}' is a ${tn(entry.type)}, not a function`,
          `It was declared at line ${entry.line}.`,
          BUILTIN_NAMES.includes(e.callee) ? `'${e.callee}' is also a builtin; rename your variable so the builtin is usable.` : 'check the name; maybe you meant a different one.');
      }
      if (ft.params.length !== e.args.length) {
        diag(e, `fn ${cn} takes ${ft.params.length} argument${ft.params.length === 1 ? '' : 's'}, but got ${e.args.length}`,
          '', `call it as ${cn}(${ft.params.map((p, i) => 'arg' + (i + 1)).join(', ')}).`);
      }
      e.args.forEach((a, i) => {
        const at = inferExpr(a, scope);
        if (!unify(ft.params[i], at)) {
          const pk = prune(ft.params[i]).k, ak = prune(at).k;
          diag(a, `argument ${i + 1} of ${cn} should be ${tn(ft.params[i])}, but this is a ${tn(at)}`,
            `fn ${cn} uses this parameter as a ${tn(ft.params[i])}.`,
            ak === 'json' && pk === 'map'
              ? (() => { const d = ast.stmts.find(st => st.t === 'Fn' && st.name === e.callee); const pn = d?.params[i]?.name ?? 'param';
                return `a json object is not a map. Inside ${cn}, read ${pn} as json instead: field(${pn}, "key") (json null when missing), has(${pn}, "key"), for k in jsonKeys(${pn}); then ${pn} is a json parameter.`; })()
              : ak === 'json' && pk === 'list'
              ? `pass its elements: jsonList(${snippet(a)}) (a list<json>, [] when it is not an array).`
              : ak === 'json' && (pk === 'str' || pk === 'num' || pk === 'bool')
              ? (pk === 'str' ? `str(${snippet(a)}) gives its text (strings as-is, numbers like str(num), null as "null").` : pk === 'bool' ? `truthy(${snippet(a)}) gives a bool.` : `unwrap it: jsonNum(${snippet(a)}) gives a Result<num, str>.`)
              : pk === 'json' && ak === 'map'
              ? `fn ${cn} reads this parameter as json; pass a json value, or convert: parseJson(toJson(${snippet(a)})).`
              : 'convert the value (str(...) / num(...)), or pass a different one.');
        }
      });
      return ft.ret;
    }
    return inferBuiltinCall(e, scope);
  }

  function arity(e, n, usage) {
    if (e.args.length !== n) diag(e, `${e.callee} takes ${n} argument${n === 1 ? '' : 's'}, but got ${e.args.length}`, '', `call it as ${usage}.`);
  }

  // helpers for the higher-order and regex builtins
  function lambdaArity(a, n, name, usage) {
    if (a && a.t === 'Lambda' && a.params.length !== n) {
      diag(a, `${name}() calls its function with ${n} argument${n === 1 ? '' : 's'}, but this lambda takes ${a.params.length}`,
        name === 'fold' ? 'fold() passes the accumulator and the current item: (acc, x).' : `${name}() passes one item at a time (no index).`,
        `write it as: ${usage}`);
    }
  }
  function listArg(a, t, el, name, usage) {
    if (!unify(t, listT(el))) {
      const pt = prune(t);
      diag(a, `${name}() takes a list first, but this is a ${tn(t)}`, '',
        pt.k === 'map' ? `for a map, go through its keys or values: ${name}(keys(${snippet(a)}), ...) or ${name}(values(${snippet(a)}), ...)`
          : pt.k === 'str' ? `for the characters of a str, use split(${snippet(a)}, "")` : `call it as ${usage}`);
    }
  }
  function fnArg(a, ft, params, ret, name, usage, what) {
    if (unify(ft, fnT(params, ret))) return;
    const pf = prune(ft);
    if (pf.k === 'fn' && pf.params.length === params.length && params.every((p, i) => unify(pf.params[i], p))) {
      diag(a, `${name}() needs a function that ${what}, but this one returns a ${tn(pf.ret)}`, '',
        prune(pf.ret).k === 'result' ? 'match the Result inside the lambda and return a plain value.' : `call it as ${usage}`);
    }
    diag(a, `${name}() needs a ${params.length}-argument function that ${what}, but this is a ${tn(ft)}`,
      pf.k === 'fn' ? `The list holds ${tn(params[params.length - 1])}.` : '', `pass a lambda: ${usage}`);
  }
  // a pattern written as a literal is checked now; one built at runtime is checked when it runs
  function checkPattern(a, name, usage) {
    if (!a || a.t !== 'Str') return;
    try { new RegExp(a.value); }
    catch (ex) {
      diag(a, `invalid regular expression in ${name}()`,
        `${ex.message}. Patterns are JavaScript regular expressions.`,
        `fix the pattern (write it as a backtick raw string so backslashes are kept: ${usage}); to match a special character literally ( . * + ? ( ) [ ] { } | ^ $ \\ ), put a backslash before it.`);
    }
  }

  // one diagnostic for every builtin that reads a json value (jsonNum ... truthy, field, at)
  function jsonArg(a, t, name) {
    if (unify(t, JSONT)) return;
    const pt = prune(t), s = snippet(a);
    if (pt.k === 'result') {
      const fromGet = a.t === 'Call' && a.callee === 'get' && a.args.length === 2;
      diag(a, `${name}() reads a json value, but this is a ${tn(t)}`,
        fromGet ? 'get() returns a Result: err when the key or index is missing.' : 'A Result has to be unwrapped before its value can be used.',
        fromGet
          ? `when missing is a normal case, use ${a.args[1].t === 'Num' ? 'at' : 'field'}(${snippet(a.args[0])}, ${snippet(a.args[1])}): it gives json null when missing (test with isNull(...)). Or unwrap: ${s}? inside a fn, match ${s} { ok(v) => ...  err(e) => ... } anywhere.`
          : `unwrap it first. Inside a fn: ${s}? . Anywhere: match ${s} { ok(v) => ...  err(e) => ... }`);
    }
    const fixes = {
      str: name === 'truthy' ? `for a str, test it directly: ${s} != ""` : `this is already a str; use it directly.`,
      num: name === 'truthy' ? `for a num, test it directly: ${s} != 0` : `this is already a num; use it directly.`,
      bool: name === 'truthy' ? `this is already a bool; use it directly: if ${s} { ... }` : `this is already a bool; use it directly.`,
      list: name === 'truthy' ? `for a list, test len(${s}) > 0` : `this is already a list; use it directly.`,
      map: name === 'truthy' ? `for a map, test len(keys(${s})) > 0` : `this is a map, not json: use ${s}["key"], get(${s}, "key") or has(${s}, "key").`,
    };
    diag(a, `${name}() reads a json value, but this is a ${tn(t)}`,
      'json values come from parseJson(...), and from field()/at()/get()/jsonList() on another json value.',
      fixes[pt.k] ?? 'pass a json value.');
  }

  function inferBuiltinCall(e, scope) {
    const args = () => e.args.map(a => inferExpr(a, scope));
    switch (e.callee) {
      case 'print': {
        if (e.args.length === 0) diag(e, 'print needs at least one argument', '', 'pass a value: print("hello").');
        args();
        return UNIT;
      }
      case 'str': { arity(e, 1, 'str(value)'); args(); return STR; }
      case 'num': {
        arity(e, 1, 'num(text)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `num() parses a str, but this is already a ${tn(t)}`,
          '', prune(t).k === 'num' ? 'this value is already a num; drop the num() call.' : 'pass a string like num("42").');
        return resultT(NUM, STR);
      }
      case 'len': {
        arity(e, 1, 'len(listOrString)');
        const [t] = args();
        const pt = prune(t);
        if (pt.k === 'str') return NUM;
        if (pt.k === 'var') {
          if (!unify(t, cvar({ k: 'len' }))) diag(e.args[0], `len() works on lists and strs, but this is a ${tn(t)}`, '', 'pass a list or a string.');
          return NUM;
        }
        if (pt.k === 'json') diag(e.args[0], 'len() works on lists and strs, not json values',
          '', `count a json array with len(jsonList(${snippet(e.args[0])})), an object's keys with len(jsonKeys(${snippet(e.args[0])})); for a json string, len(str(${snippet(e.args[0])})).`);
        if (pt.k === 'map') diag(e.args[0], 'len() works on lists and strs, not maps',
          '', `count the keys instead: len(keys(${snippet(e.args[0])}))`);
        if (!unify(t, listT(tvar()))) diag(e.args[0], `len() works on lists and strs, but this is a ${tn(t)}`, '', 'pass a list or a string.');
        return NUM;
      }
      case 'range': {
        arity(e, 2, 'range(start, stop)');
        const ts = args();
        ts.forEach((t, i) => {
          if (!unify(t, NUM)) diag(e.args[i], `range() takes nums, but this is a ${tn(t)}`, '', 'pass numbers: range(0, 10).');
        });
        return listT(NUM);
      }
      case 'push': {
        arity(e, 2, 'push(list, item)');
        const [lt, it] = args();
        const el = tvar();
        if (!unify(lt, listT(el))) diag(e.args[0], `push() adds to a list, but this is a ${tn(lt)}`, '', 'pass a list as the first argument.');
        if (!unify(el, it)) diag(e.args[1], `this list holds ${tn(el)}, but you're pushing a ${tn(it)}`,
          'A Vow list holds values of a single type.', 'convert the item (str(...)/num(...)), or use a different list.');
        return listT(el);
      }
      case 'pop': {
        arity(e, 1, 'pop(list)');
        const [lt] = args();
        const el = tvar();
        if (!unify(lt, listT(el))) diag(e.args[0], `pop() takes a list, but this is a ${tn(lt)}`, '', 'pass a list.');
        return resultT(el, STR);
      }
      case 'get': {
        arity(e, 2, 'get(collection, key)');
        const [ct, kt] = args();
        const pc = prune(ct);
        if (pc.k === 'json') {
          const pk = prune(kt);
          if (pk.k === 'var') unify(kt, STR);
          else if (pk.k !== 'str' && pk.k !== 'num') {
            diag(e.args[1], `JSON is accessed by str key or num index, but this is a ${tn(kt)}`,
              '', 'use a string key for objects or a numeric index for arrays.');
          }
          return resultT(JSONT, STR);
        }
        if (pc.k === 'map') {
          if (!unify(kt, STR)) diag(e.args[1], `map keys are strs, but this is a ${tn(kt)}`, '', 'use a string key.');
          return resultT(pc.val, STR);
        }
        if (pc.k === 'str') {
          if (!unify(kt, NUM)) diag(e.args[1], `strings are indexed by position (a num), but this is a ${tn(kt)}`, '', 'use a numeric index.');
          return resultT(STR, STR);
        }
        if (pc.k === 'var') {
          // container not known yet (e.g. an un-annotated param): decide after the body is checked
          const v = tvar();
          if (!unify(ct, cvar({ k: 'index', key: kt, el: v }))) diag(e.args[0], `get() takes a list, map, or json, but this is a ${tn(ct)}`, '', 'pass a list, a map, or a json value.');
          return resultT(v, STR);
        }
        const el = tvar();
        if (!unify(ct, listT(el))) diag(e.args[0], `get() takes a list or map, but this is a ${tn(ct)}`, '', 'pass a list or a map.');
        if (!unify(kt, NUM)) diag(e.args[1], `list indexes are nums, but this is a ${tn(kt)}`, '', 'use a numeric index.');
        return resultT(el, STR);
      }
      case 'keys': {
        arity(e, 1, 'keys(map)');
        const [t] = args();
        if (!unify(t, mapT(tvar()))) diag(e.args[0], `keys() takes a map, but this is a ${tn(t)}`, '', 'pass a map like {"a": 1}.');
        return listT(STR);
      }
      case 'has': {
        arity(e, 2, 'has(map, key)');
        const [mt, kt] = args();
        // container not known yet (an un-annotated param): a map or a json object, settled per call
        if (prune(mt).k === 'var' && unify(kt, STR) && unify(mt, cvar({ k: 'index', key: STR, el: tvar() }))) return BOOL;
        if (prune(mt).k === 'json') {
          if (!unify(kt, STR)) diag(e.args[1], `has() on a json object takes a str key, but this is a ${tn(kt)}`, '', `for an array, check the index against len(jsonList(${snippet(e.args[0])})).`);
          return BOOL;
        }
        if (!unify(mt, mapT(tvar()))) diag(e.args[0], `has() takes a map, but this is a ${tn(mt)}`, '', 'pass a map.');
        if (!unify(kt, STR)) diag(e.args[1], `map keys are strs, but this is a ${tn(kt)}`, '', 'use a string key.');
        return BOOL;
      }
      case 'join': {
        arity(e, 2, 'join(listOfStrings, separator)');
        const [lt, st] = args();
        if (!unify(lt, listT(STR))) diag(e.args[0], `join() takes a list<str>, but this is a ${tn(lt)}`,
          '', 'convert the items first, e.g. build a list of str(...) values.');
        if (!unify(st, STR)) diag(e.args[1], `the separator must be a str, but this is a ${tn(st)}`, '', 'use a string like ", ".');
        return STR;
      }
      case 'split': {
        arity(e, 2, 'split(text, separator)');
        const ts = args();
        ts.forEach((t, i) => {
          if (!unify(t, STR)) diag(e.args[i], `split() takes strs, but this is a ${tn(t)}`, '', 'pass strings: split("a,b", ",").');
        });
        return listT(STR);
      }
      case 'abs': case 'floor': {
        arity(e, 1, `${e.callee}(n)`);
        const [t] = args();
        if (!unify(t, NUM)) diag(e.args[0], `${e.callee}() takes a num, but this is a ${tn(t)}`, '', 'pass a number.');
        return NUM;
      }
      case 'fixed': {
        arity(e, 2, 'fixed(n, digits)');
        const ts = args();
        ts.forEach((t, i) => { if (!unify(t, NUM)) diag(e.args[i], `fixed() takes nums, but this is a ${tn(t)}`, '', 'fixed(price, 2) gives "212.30"'); });
        return STR;
      }
      case 'round': {
        // round(x) = round(x, 0), as in Python/JS (bench: rpn-calc)
        if (e.args.length !== 1) arity(e, 2, 'round(n, digits) or round(n)');
        const ts = args();
        ts.forEach((t, i) => { if (!unify(t, NUM)) diag(e.args[i], `round() takes nums, but this is a ${tn(t)}`, '', 'round(price, 2) rounds to 2 decimals; round(x, 0) to a whole number.'); });
        return NUM;
      }
      case 'min': case 'max': {
        arity(e, 2, `${e.callee}(a, b)`);
        const ts = args();
        ts.forEach((t, i) => {
          if (!unify(t, NUM)) diag(e.args[i], `${e.callee}() takes nums, but this is a ${tn(t)}`, '', 'pass numbers.');
        });
        return NUM;
      }
      case 'sort': {
        arity(e, 1, 'sort(list)');
        const [t] = args();
        const el = tvar();
        if (!unify(t, listT(el))) diag(e.args[0], `sort() takes a list, but this is a ${tn(t)}`, '', 'pass a list of nums or strs.');
        const pe = prune(el);
        if (pe.k === 'var') unify(el, cvar({ k: 'ord' })); // stays generic: num or str, checked per call
        else if (pe.k !== 'num' && pe.k !== 'str') diag(e.args[0], `sort() orders nums or strs, but this list holds ${tn(el)}`,
          'There is no built-in ordering for these values.', 'use sortBy(xs, x => key) to sort by a num or str key.');
        return listT(el);
      }
      case 'sortBy': {
        arity(e, 2, 'sortBy(list, item => key)');
        const [t, ft] = args();
        const el = tvar(), key = tvar();
        if (!unify(t, listT(el))) diag(e.args[0], `sortBy() takes a list first, but this is a ${tn(t)}`, '', 'pass a list: sortBy(xs, x => x.price)');
        if (!unify(ft, fnT([el], key))) diag(e.args[1], `sortBy() needs a one-argument function that maps each item to its sort key, but this is a ${tn(ft)}`,
          '', 'pass a lambda: sortBy(xs, x => x.price)');
        const pk = prune(key);
        if (pk.k === 'var') unify(key, cvar({ k: 'ord' })); // num or str, whichever the key fn returns
        else if (pk.k !== 'num' && pk.k !== 'str') diag(e.args[1], `sortBy() keys must be nums or strs, but this key is a ${tn(key)}`,
          'Items are ordered by comparing their keys.', 'return a number or a string from the key function.');
        return listT(el);
      }
      case 'reverse': {
        arity(e, 1, 'reverse(list)');
        const [t] = args();
        const el = tvar();
        if (!unify(t, listT(el))) diag(e.args[0], `reverse() takes a list, but this is a ${tn(t)}`, '',
          prune(t).k === 'str' ? 'for text, use join(reverse(split(s, "")), "").' : 'pass a list.');
        return listT(el);
      }
      case 'contains': {
        arity(e, 2, 'contains(listOrString, item)');
        const ct = inferExpr(e.args[0], scope);
        const it = inferExpr(e.args[1], scope);
        const pc = prune(ct);
        if (pc.k === 'str') {
          if (!unify(it, STR)) diag(e.args[1], `searching a str for a ${tn(it)}`, 'A string can only contain another string.', 'convert it: contains(text, str(x)).');
          return BOOL;
        }
        const el = tvar();
        if (!unify(ct, listT(el))) diag(e.args[0], `contains() searches a list or str, but this is a ${tn(ct)}`, '',
          pc.k === 'map' ? `for maps, use has(${snippet(e.args[0])}, key).` : 'pass a list or a string.');
        if (!unify(el, it)) diag(e.args[1], `this list holds ${tn(el)}, but you're searching for a ${tn(it)}`,
          'The search value must have the same type as the list items.', 'convert it with str(...) or num(...).');
        return BOOL;
      }
      case 'slice': {
        arity(e, 3, 'slice(listOrString, start, end)');
        const ct = inferExpr(e.args[0], scope);
        const ts = [inferExpr(e.args[1], scope), inferExpr(e.args[2], scope)];
        ts.forEach((t, i) => {
          if (!unify(t, NUM)) diag(e.args[i + 1], `slice() positions are nums, but this is a ${tn(t)}`, '', 'pass numbers: slice(x, 0, 3).');
        });
        const pc = prune(ct);
        if (pc.k === 'str') return STR;
        // not known yet (an un-annotated param, e.g. a template that is also indexed with t[i]):
        // a slice has the same type as what it slices, so don't guess "list" here
        // (bench: template, 16 of 52 failed attempts ended on trim(slice(t, ...)) being a list<str>)
        if (pc.k === 'var') {
          if (!unify(ct, cvar({ k: 'len' }))) diag(e.args[0], `slice() takes a list or str, but this is a ${tn(ct)}`, '', 'pass a list or a string.');
          return ct;
        }
        const el = tvar();
        if (!unify(ct, listT(el))) diag(e.args[0], `slice() takes a list or str, but this is a ${tn(ct)}`, '', 'pass a list or a string.');
        return listT(el);
      }
      // ---- text toolkit: every argument is a str except the counts ----
      case 'replace': case 'startsWith': case 'endsWith': case 'indexOf': {
        const n = e.callee === 'replace' ? 3 : 2;
        const usage = { replace: 'replace(text, old, new)', startsWith: 'startsWith(text, prefix)', endsWith: 'endsWith(text, suffix)', indexOf: 'indexOf(text, piece)' }[e.callee];
        arity(e, n, usage);
        args().forEach((t, i) => { if (!unify(t, STR)) diag(e.args[i], `${e.callee}() takes strs, but argument ${i + 1} is a ${tn(t)}`, '', usage); });
        if (e.callee === 'replace') return STR;
        if (e.callee === 'indexOf') return resultT(NUM, STR);
        return BOOL;
      }
      case 'repeat': case 'padLeft': case 'padRight': {
        const usage = { repeat: 'repeat(text, count)', padLeft: 'padLeft(text, width, fill)', padRight: 'padRight(text, width, fill)' }[e.callee];
        arity(e, e.callee === 'repeat' ? 2 : 3, usage);
        const want = e.callee === 'repeat' ? [STR, NUM] : [STR, NUM, STR];
        args().forEach((t, i) => { if (!unify(t, want[i])) diag(e.args[i], `${e.callee}() argument ${i + 1} should be a ${tn(want[i])}, but this is a ${tn(t)}`, '', usage); });
        return STR;
      }
      case 'lines': {
        arity(e, 1, 'lines(text)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `lines() takes a str, but this is a ${tn(t)}`, '', 'lines(text)');
        return listT(STR);
      }
      // ---- regex toolkit: the pattern is a JavaScript regular expression ----
      case 'matches': case 'find': case 'findAll': case 'replaceAll': case 'splitOn': {
        const usage = {
          matches: 'matches(text, `^\\d+$`)', find: 'find(text, `(\\w+)@(\\w+)`)', findAll: 'findAll(text, `\\d+`)',
          replaceAll: 'replaceAll(text, `\\s+`, " ")', splitOn: 'splitOn(text, `[,;]\\s*`)',
        }[e.callee];
        arity(e, e.callee === 'replaceAll' ? 3 : 2, usage);
        const names = ['the text', 'the pattern', 'the replacement'];
        args().forEach((t, i) => {
          if (!unify(t, STR)) diag(e.args[i], `${e.callee}() argument ${i + 1} is ${names[i]} (a str), but this is a ${tn(t)}`, '',
            i === 0 && prune(t).k !== 'result' ? `convert it first: ${e.callee}(str(${snippet(e.args[0])}), ...)` : usage);
        });
        checkPattern(e.args[1], e.callee, usage);
        if (e.callee === 'matches') return BOOL;
        if (e.callee === 'find') return resultT(listT(STR), STR);
        if (e.callee === 'replaceAll') return STR;
        return listT(STR);
      }
      case 'words': {
        arity(e, 1, 'words(text)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `words() takes a str, but this is a ${tn(t)}`, '', 'words(text) splits on any run of whitespace.');
        return listT(STR);
      }
      case 'sig': {
        arity(e, 2, 'sig(x, digits)');
        args().forEach((t, i) => { if (!unify(t, NUM)) diag(e.args[i], `sig() takes nums, but argument ${i + 1} is a ${tn(t)}`, '', 'sig(1234.5, 2) rounds to 2 significant digits: 1200'); });
        const d = e.args[1];
        if (d.t === 'Num' && !(Number.isInteger(d.value) && d.value >= 1 && d.value <= 21)) {
          diag(d, `sig() digits must be a whole number from 1 to 21, got ${d.value}`,
            'sig(x, digits) keeps that many significant digits.', 'e.g. sig(1234.5, 2) is 1200 and sig(0.012345, 3) is 0.0123.');
        }
        return NUM;
      }
      case 'isInt': {
        arity(e, 1, 'isInt(x)');
        const [t] = args();
        if (!unify(t, NUM)) diag(e.args[0], `isInt() takes a num, but this is a ${tn(t)}`, '',
          prune(t).k === 'str' ? `to check text, parse it: match int(${snippet(e.args[0])}) { ok(n) => ...  err(e) => ... }` : 'pass a number.');
        return BOOL;
      }
      case 'int': {
        arity(e, 1, 'int(text)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `int() parses a str, but this is a ${tn(t)}`, '',
          prune(t).k === 'num' ? `this is already a num: use isInt(${snippet(e.args[0])}) to test it, or floor(...) to drop decimals.` : 'pass text like int("42").');
        return resultT(NUM, STR);
      }
      case 'map': case 'filter': case 'any': case 'all': case 'count': {
        const usage = {
          map: 'map(xs, x => x * 2)', filter: 'filter(xs, x => x > 0)', any: 'any(xs, x => x > 0)',
          all: 'all(xs, x => x > 0)', count: 'count(xs, x => x > 0)',
        }[e.callee];
        arity(e, 2, usage);
        lambdaArity(e.args[1], 1, e.callee, usage);
        const [t, ft] = args();
        const el = tvar();
        listArg(e.args[0], t, el, e.callee, usage);
        const ret = e.callee === 'map' ? tvar() : BOOL;
        fnArg(e.args[1], ft, [el], ret, e.callee, usage,
          e.callee === 'map' ? 'maps each item to its new value' : 'returns a bool for each item');
        if (e.callee === 'map') {
          if (prune(ret).k === 'unit') diag(e.args[1], `map()'s function returns nothing for an item`,
            `map() builds a new list from the values the function returns; this function returns no value (unit).`,
            `to just do something for each item, use a loop: for x in ${snippet(e.args[0])} { ... }`);
          return listT(ret);
        }
        if (e.callee === 'filter') return listT(el);
        return e.callee === 'count' ? NUM : BOOL;
      }
      case 'fold': {
        const usage = 'fold(xs, 0, (acc, x) => acc + x)';
        arity(e, 3, usage);
        lambdaArity(e.args[2], 2, 'fold', usage);
        const [t, it, ft] = args();
        const el = tvar();
        listArg(e.args[0], t, el, 'fold', usage);
        fnArg(e.args[2], ft, [it, el], it, 'fold', usage, `takes (accumulator, item) and returns the next accumulator (the same type as the start value, a ${tn(it)})`);
        return it;
      }
      case 'uniq': {
        arity(e, 1, 'uniq(xs)');
        const [t] = args();
        const el = tvar();
        listArg(e.args[0], t, el, 'uniq', 'uniq(xs)');
        return listT(el);
      }
      case 'values': {
        arity(e, 1, 'values(map)');
        const [t] = args();
        const v = tvar();
        if (!unify(t, mapT(v))) diag(e.args[0], `values() takes a map, but this is a ${tn(t)}`, '',
          prune(t).k === 'json' ? `for json objects, loop over jsonKeys(${snippet(e.args[0])}) and get(...) each key.` : 'pass a map like {"a": 1}.');
        return listT(v);
      }
      case 'trim': case 'upper': case 'lower': {
        arity(e, 1, `${e.callee}(text)`);
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `${e.callee}() takes a str, but this is a ${tn(t)}`, '', 'convert it first with str(...).');
        return STR;
      }
      case 'sum': {
        arity(e, 1, 'sum(listOfNums)');
        const [t] = args();
        if (!unify(t, listT(NUM))) diag(e.args[0], `sum() takes a list<num>, but this is a ${tn(t)}`, '',
          prune(t).k === 'list' ? 'convert the items to nums first.' : 'pass a list of numbers.');
        return NUM;
      }
      case 'ok': {
        if (e.args.length === 0) diag(e, 'ok takes 1 argument, but got 0',
          'There is no empty/unit ok in Vow; every ok carries a value.',
          'if there is no meaningful value to return, the idiom is ok(true).');
        arity(e, 1, 'ok(value)'); const [t] = args(); return resultT(t, tvar());
      }
      case 'err': { arity(e, 1, 'err(error)'); const [t] = args(); return resultT(tvar(), t); }
      case 'readFile': {
        arity(e, 1, 'readFile(path)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `readFile() takes a str path, but this is a ${tn(t)}`, '', 'pass a path like readFile("data.txt").');
        return resultT(STR, STR);
      }
      case 'writeFile': {
        arity(e, 2, 'writeFile(path, text)');
        const ts = args();
        ts.forEach((t, i) => {
          if (!unify(t, STR)) diag(e.args[i], `writeFile() takes strs, but this is a ${tn(t)}`, '',
            i === 0 ? 'pass a path like "out.txt".' : 'convert the content first with str(...).');
        });
        return resultT(BOOL, STR);
      }
      case 'httpGet': {
        arity(e, 1, 'httpGet(url)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `httpGet() takes a str url, but this is a ${tn(t)}`, '', 'pass a url like httpGet("https://...").');
        return resultT(STR, STR);
      }
      case 'args': { arity(e, 0, 'args()'); return listT(STR); }
      case 'serve': {
        arity(e, 2, 'serve(port, handler)');
        const [pt, ht] = args();
        if (!unify(pt, NUM)) diag(e.args[0], `serve() takes a port number first, but this is a ${tn(pt)}`, '', 'e.g. serve(8080, handle)');
        if (!unify(ht, fnT([mapT(STR)], RESPONSE))) diag(e.args[1], `serve() needs a handler that takes the request map and returns a response, but this is a ${tn(ht)}`,
          'The request is a map<str, str> with keys "method", "path", "query" and "body". The handler must return html(...), text(...) or respond(status, type, body) on EVERY path.',
          'fn handle(req) {\n    if req["path"] == "/" { return html("<h1>hi</h1>") }\n    return respond(404, "text/plain", "not found")\n  }');
        return resultT(BOOL, STR);
      }
      case 'html': case 'text': case 'redirect': {
        arity(e, 1, e.callee === 'redirect' ? 'redirect(path)' : `${e.callee}(body)`);
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `${e.callee}() takes the response body as a str, but this is a ${tn(t)}`, '', 'convert it with str(...), or toJson(...) for data.');
        return RESPONSE;
      }
      case 'respond': {
        arity(e, 3, 'respond(status, contentType, body)');
        const ts = args();
        const want = [NUM, STR, STR], names = ['status (a num like 404)', 'content type (a str like "application/json")', 'body (a str)'];
        ts.forEach((t, i) => { if (!unify(t, want[i])) diag(e.args[i], `respond() argument ${i + 1} is the ${names[i]}, but this is a ${tn(t)}`, '', 'respond(404, "text/plain", "not found")'); });
        return RESPONSE;
      }
      case 'checkLogin': {
        arity(e, 2, 'checkLogin(req["authorization"], password)');
        const ts = args();
        ts.forEach((t, i) => { if (!unify(t, STR)) diag(e.args[i], `checkLogin() takes strs (the authorization header and the password), but this is a ${tn(t)}`, '', 'checkLogin(req["authorization"], password)'); });
        return BOOL;
      }
      case 'askLogin': {
        arity(e, 1, 'askLogin(realm)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `askLogin() takes a str (the name shown in the login box), but this is a ${tn(t)}`, '', 'askLogin("my site")');
        return RESPONSE;
      }
      case 'now': { arity(e, 0, 'now()'); return NUM; }
      // ---- math (domain errors trap at runtime, like division by zero) ----
      case 'sqrt': case 'exp': case 'ln': case 'log': case 'sin': case 'cos': case 'tan': case 'ceil': case 'trunc': {
        const usage = `${e.callee}(x)`;
        arity(e, 1, usage);
        const [t] = args();
        if (!unify(t, NUM)) diag(e.args[0], `${e.callee}() takes a num, but this is a ${tn(t)}`, '',
          prune(t).k === 'str' ? `parse it first: match num(${snippet(e.args[0])}) { ok(n) => ${e.callee}(n)  err(e) => ... }` : 'pass a number.');
        return NUM;
      }
      case 'pow': case 'atan2': {
        const usage = e.callee === 'pow' ? 'pow(base, exponent)' : 'atan2(y, x)';
        arity(e, 2, usage);
        args().forEach((t, i) => { if (!unify(t, NUM)) diag(e.args[i], `${e.callee}() takes nums, but argument ${i + 1} is a ${tn(t)}`, '', `call it as ${usage}.`); });
        return NUM;
      }
      case 'pi': case 'random': {
        if (e.args.length) diag(e, `${e.callee}() takes no arguments, but got ${e.args.length}`, '',
          e.callee === 'random' ? 'random() gives a num in [0, 1); for a whole number in a range use randomInt(lo, hi).' : 'write pi() (3.14159...).');
        return NUM;
      }
      case 'randomInt': {
        arity(e, 2, 'randomInt(lo, hi)');
        args().forEach((t, i) => { if (!unify(t, NUM)) diag(e.args[i], `randomInt() takes nums, but argument ${i + 1} is a ${tn(t)}`, '', 'randomInt(1, 6) is a whole number from 1 to 6, both included.'); });
        return NUM;
      }
      // ---- dates: ms since 1970-01-01T00:00:00Z (what now() returns), always UTC ----
      case 'dateParts': case 'isoDate': {
        arity(e, 1, `${e.callee}(ms)`);
        const [t] = args();
        if (!unify(t, NUM)) diag(e.args[0], `${e.callee}() takes a time in milliseconds (a num, like now() returns), but this is a ${tn(t)}`, '',
          prune(t).k === 'str' ? `parse the text first: match parseDate(${snippet(e.args[0])}) { ok(ms) => ${e.callee}(ms)  err(e) => ... }` : `pass a num: ${e.callee}(now()).`);
        return e.callee === 'isoDate' ? STR : structs.get('DateParts');
      }
      case 'parseDate': {
        arity(e, 1, 'parseDate(text)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `parseDate() parses a str like "2026-10-08", but this is a ${tn(t)}`, '',
          prune(t).k === 'num' ? 'this is already a time in milliseconds: use it directly.' : 'pass an ISO date string.');
        return resultT(NUM, STR);
      }
      case 'daysBetween': {
        arity(e, 2, 'daysBetween(fromMs, toMs)');
        args().forEach((t, i) => { if (!unify(t, NUM)) diag(e.args[i], `daysBetween() takes two times in milliseconds (nums), but argument ${i + 1} is a ${tn(t)}`, '',
          prune(t).k === 'str' ? `parse it first with parseDate(${snippet(e.args[i])}).` : 'daysBetween(parseDate-result, now())'); });
        return NUM;
      }
      case 'escape': {
        arity(e, 1, 'escape(text)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `escape() takes a str, but this is a ${tn(t)}`, '', 'convert it first: escape(str(x))');
        return STR;
      }
      case 'param': {
        arity(e, 2, 'param(query, name)');
        const ts = args();
        ts.forEach((t, i) => { if (!unify(t, STR)) diag(e.args[i], `param() takes strs (the query string and a parameter name), but this is a ${tn(t)}`, '', 'param(req["query"], "id")'); });
        return resultT(STR, STR);
      }
      case 'parseJson': {
        arity(e, 1, 'parseJson(text)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `parseJson() parses a str, but this is a ${tn(t)}`, '',
          prune(t).k === 'json' ? 'this value is already parsed json.' : 'pass the raw text, e.g. the body from httpGet(...) or readFile(...).');
        return resultT(JSONT, STR);
      }
      case 'toJson': {
        arity(e, 1, 'toJson(value)');
        const [t] = args();
        const pt = prune(t);
        if (pt.k === 'result') diag(e.args[0], `toJson() can't serialize a Result`,
          'A Result might be an error, and JSON has no representation for that.',
          `match it first and serialize the ok value.`);
        if (pt.k === 'fn') diag(e.args[0], `toJson() can't serialize a function`,
          'Code has no JSON form.', 'serialize the data the function works on instead.');
        if (pt.k === 'unit') diag(e.args[0], `toJson() needs a value, but this returns nothing (unit)`,
          '', 'pass a value: a num, str, bool, list, map, struct or json.');
        return STR;
      }
      case 'jsonNum': case 'jsonStr': case 'jsonBool': {
        arity(e, 1, `${e.callee}(j)`);
        const [t] = args();
        const want = { jsonNum: NUM, jsonStr: STR, jsonBool: BOOL }[e.callee];
        if (prune(t).k === want.k) diag(e.args[0], `${e.callee}() reads a json value, but this is a ${tn(t)}`,
          'json values come from parseJson(...) or from get(...) / [..] on another json value.', `this value is already a ${want.k}; drop the ${e.callee}() call.`);
        jsonArg(e.args[0], t, e.callee);
        return resultT(want, STR);
      }
      case 'jsonList': {
        arity(e, 1, 'jsonList(j)');
        const [t] = args();
        if (prune(t).k === 'result') jsonArg(e.args[0], t, 'jsonList');
        if (!unify(t, JSONT)) diag(e.args[0], `jsonList() reads a json value, but this is a ${tn(t)}`,
          'json values come from parseJson(...).', prune(t).k === 'list' ? 'this value is already a list.' : 'pass a json value.');
        // plain list, [] when j isn't an array: unwrapping a Result here was the most common
        // remaining agent error (sort(jsonKeys(j))), and callers check jsonType first anyway
        return listT(JSONT);
      }
      case 'jsonKeys': {
        arity(e, 1, 'jsonKeys(j)');
        const [t] = args();
        if (prune(t).k === 'result') jsonArg(e.args[0], t, 'jsonKeys');
        if (!unify(t, JSONT)) diag(e.args[0], `jsonKeys() reads a json value, but this is a ${tn(t)}`,
          'json values come from parseJson(...).', prune(t).k === 'map' ? `for maps, use keys(${snippet(e.args[0])}).` : 'pass a json value.');
        return listT(STR); // [] when j isn't an object
      }
      case 'jsonType': {
        arity(e, 1, 'jsonType(j)');
        const [t] = args();
        jsonArg(e.args[0], t, 'jsonType');
        return STR;
      }
      // convenient access: a missing key / index is a json null, not a Result
      case 'field': case 'at': {
        const usage = e.callee === 'field' ? 'field(j, "key")' : 'at(j, 0)';
        arity(e, 2, usage);
        const [jt, kt] = args();
        jsonArg(e.args[0], jt, e.callee);
        const want = e.callee === 'field' ? STR : NUM;
        if (!unify(kt, want)) diag(e.args[1], e.callee === 'field'
          ? `field() reads an object by str key, but this is a ${tn(kt)}`
          : `at() reads an array by num index, but this is a ${tn(kt)}`, '',
          e.callee === 'field' ? `for an array index use at(${snippet(e.args[0])}, ${snippet(e.args[1])}).` : `for an object key use field(${snippet(e.args[0])}, ${snippet(e.args[1])}).`);
        return JSONT;
      }
      case 'isNull': case 'truthy': {
        arity(e, 1, `${e.callee}(j)`);
        const [t] = args();
        jsonArg(e.args[0], t, e.callee);
        return BOOL;
      }
      case 'env': {
        arity(e, 1, 'env(name)');
        const [t] = args();
        if (!unify(t, STR)) diag(e.args[0], `env() takes a str name, but this is a ${tn(t)}`, '', 'pass a name like env("HOME").');
        return resultT(STR, STR);
      }
      default: {
        mainNameHint(e.calleeNode ?? e, e.callee);
        const hint = importHint(e.callee);
        if (hint) diag(e.calleeNode ?? e, `'${e.callee}' is in an imported module: write ${hint}(...)`,
          `Names from another file are always used through the module's name, so they can never collide with names here.`, `write ${hint}(...)`);
        let best = null, bestD = 3;
        for (const n of [...new Set([...scope.allNames(), ...BUILTIN_NAMES])].filter(n => !n.includes('.'))) {
          const d = editDistance(e.callee, n);
          if (d < bestD) { bestD = d; best = n; }
        }
        diag(e.calleeNode ?? e, `'${e.callee}' is not a function that exists`,
          'No fn or builtin with this name is in scope.',
          best ? `did you mean '${best}'?` : `declare it first: fn ${e.callee}(...) { ... }`);
      }
    }
  }

  // A value-producing block may end in a match or an if/else: that IS its value. Rewritten
  // in place so the interpreter evaluates it as an expression too.
  function valueTail(stmts) {
    const last = stmts[stmts.length - 1];
    if (!last) return;
    if (last.t === 'MatchStmt') stmts[stmts.length - 1] = { t: 'ExprStmt', expr: last.match, pos: last.pos, start: last.start, end: last.end };
    else if (last.t === 'If' && last.alt) stmts[stmts.length - 1] = { t: 'ExprStmt', expr: { t: 'IfExpr', stmt: last, pos: last.pos, start: last.start, end: last.end }, pos: last.pos, start: last.start, end: last.end };
  }

  function inferIfExpr(st, scope) {
    checkCond(st.cond, scope, 'if');
    if (!st.alt) {
      diag(st, 'an if used as a value needs an else',
        'Without an else there is no value when the condition is false, and Vow has no null to fill the gap.',
        `add an else branch: if ${snippet(st.cond)} { a } else { b }`);
    }
    const a = blockValue(st.then, scope, 'the if branch');
    const b = st.alt.t === 'If' ? inferIfExpr(st.alt, scope) : blockValue(st.alt, scope, 'the else branch');
    if (!unify(a, b)) {
      diag(st.alt, `the if and else branches produce different types`,
        `The if branch produces ${tn(a)}, but the else branch produces ${tn(b)}; a value must have one type.`,
        'make both branches produce the same type (convert with str(...)/num(...)).');
    }
    return a;
  }

  function blockValue(block, scope, what) {
    const stmts = block.stmts;
    valueTail(stmts);
    const esc = findEscape(block, false);
    // as in match arms: inside a fn a branch may `return`; one that always returns needs no value
    const retOk = esc && esc.kind === 'return' && (currentFn != null || !esc.node.value);
    if (retOk && definitelyReturns(block)) {
      checkStmt(block, new Scope(scope));
      return tvar(); // never produces a value, so it fits whatever the other branch produces
    }
    if (esc && !retOk) diag(esc.node, `'${esc.kind}' inside ${what}, which produces a value`,
      `This if/else is used as a value, so each branch produces its value via its last line; '${esc.kind}' would jump out of the expression instead.`,
      esc.kind === 'return' ? `drop the 'return': the branch's last line is its value` : `move the '${esc.kind}' out of the if/else.`);
    const last = stmts[stmts.length - 1];
    if (!last || last.t !== 'ExprStmt') {
      diag(last ?? block, `${what} must end with its value`,
        'When if/else is used as a value, each branch produces the value of its final line, which must be a bare expression.',
        `add the value as the last line: if cond { ... theValue } else { ... otherValue }`);
    }
    const inner = new Scope(scope);
    for (let i = 0; i < stmts.length - 1; i++) checkStmt(stmts[i], inner);
    return inferExpr(last.expr, inner);
  }

  // Like match arms and if/else, a fn or lambda body's last line is its value when the body
  // never says `return <value>`: fn isNum(s) { match num(s) { ok(n) => true  err(e) => false } }.
  // Rewritten in place, so the interpreter just sees a return. It used to silently return
  // unit and fail later at the caller as "this has no value to store" (bench: mini-query, 4x).
  // A trailing match / if-else counts only when every branch ends in a bare expression, so
  // side-effect bodies whose branches end in assignments are left alone.
  function implicitReturn(body) {
    if (body.t !== 'Block' || usesRet(body)) return;
    const stmts = body.stmts;
    // recursive: a branch may itself end in a match or if/else (bench: mini-query sort keys)
    const tailIsValue = (s) => s != null && (s.t === 'ExprStmt' ||
      (s.t === 'MatchStmt' && s.match.arms.every(a => endsInExpr(a.body))) ||
      (s.t === 'If' && s.alt != null && endsInExpr(s.then) && endsInExpr(s.alt)));
    const endsInExpr = (b) => b.t === 'If' ? tailIsValue(b) : b.t !== 'Block' || tailIsValue(b.stmts[b.stmts.length - 1]);
    const last = stmts[stmts.length - 1];
    if (last && (
      (last.t === 'MatchStmt' && last.match.arms.every(a => endsInExpr(a.body))) ||
      (last.t === 'If' && last.alt && endsInExpr(last.then) && endsInExpr(last.alt)))) valueTail(stmts);
    const tail = stmts[stmts.length - 1];
    if (tail && tail.t === 'ExprStmt') stmts[stmts.length - 1] = { t: 'Return', value: tail.expr, pos: tail.pos, start: tail.start, end: tail.end };
  }

  function isPlainJsonList(n) { return n.t === 'Call' && (n.callee === 'jsonKeys' || n.callee === 'jsonList'); }

  function checkValuePatterns(m, st) {
    const resultArm = m.arms.find(a => a.tag === 'ok' || a.tag === 'err');
    if (resultArm) diag(resultArm.tagTok, `this match mixes ${resultArm.tag}(...) with value patterns`,
      'A match either unpacks a Result (ok/err) or compares a plain value against literals, not both.',
      'split it into two matches, or use only literals with _ for the rest.');
    const lits = m.arms.filter(a => a.tag === 'lit');
    for (const arm of lits) {
      const lt = typeof arm.value === 'string' ? STR : typeof arm.value === 'number' ? NUM : BOOL;
      if (!unify(st, lt)) diag(arm.tagTok, `this pattern is a ${tn(lt)}, but the match subject is a ${tn(st)}`,
        'Every literal in a value match must have the same type as the value being matched.',
        prune(st).k === 'result' ? 'a Result is matched with ok(v) => ... and err(e) => ...' : `use ${tn(st)} literals in every arm.`);
    }
    if (!lits.length) unify(st, tvar());
    const k = prune(st).k;
    if (k !== 'str' && k !== 'num' && k !== 'bool') diag(m.subject, `match on a ${tn(st)} can only use ok/err patterns or literals of str, num or bool`,
      'Value patterns compare against literal strings, numbers or booleans.', 'use if/else for other comparisons.');
    const seen = new Map();
    m.arms.forEach((arm, i) => {
      const key = arm.tag === 'wild' ? '_' : JSON.stringify(arm.value);
      if (seen.has(key)) diag(arm.tagTok, `duplicate ${key} arm`, `This match already handles ${key} at line ${seen.get(key)}.`, 'remove one of the arms.');
      seen.set(key, arm.pos.line);
      if (arm.tag === 'wild' && i !== m.arms.length - 1) diag(arm.tagTok, '_ must be the last arm',
        '_ matches everything, so any arm after it could never run.', 'move the _ arm to the end.');
    });
    const exhaustive = seen.has('_') || (k === 'bool' && seen.has('true') && seen.has('false'));
    if (!exhaustive) diag(m, `this match doesn't handle every ${tn(st)}`,
      `A value match must cover every possible value, and a ${tn(st)} has more values than these literals.`,
      'add a catch-all as the last arm: _ => ...');
  }

  function checkMatch(m, scope, asExpr) {
    const okT = tvar(), errT = tvar();
    const st = inferExpr(m.subject, scope);
    if (m.arms.some(a => a.tag === 'lit' || a.tag === 'wild')) {
      checkValuePatterns(m, st);
    } else {
      if (!unify(st, resultT(okT, errT))) {
        diag(m.subject, `match works on Result values, but this is a ${tn(st)}`,
          'match unpacks ok(...) / err(...). To compare a plain value, use literal patterns.',
          isPlainJsonList(m.subject) ? `${m.subject.callee}() returns a plain list ([] when the value is the wrong kind), so use it directly: for x in ${snippet(m.subject)} { ... }`
          : prune(st).k === 'bool' ? `use if ${snippet(m.subject)} { ... } else { ... }`
            : `match it against literals with _ for the rest: match ${snippet(m.subject)} { "a" => ...  _ => ... }`);
      }
      const seen = new Map();
      for (const arm of m.arms) {
        if (seen.has(arm.tag)) diag(arm.tagTok ?? arm.pos, `duplicate ${arm.tag}(...) arm`,
          `This match already handles ${arm.tag} at line ${seen.get(arm.tag)}.`, 'remove one of the arms.');
        seen.set(arm.tag, arm.pos.line);
      }
      for (const tag of ['ok', 'err']) {
        if (!seen.has(tag)) diag(m, `this match doesn't handle ${tag}(...)`,
          `A Result is always either ok or err, and Vow requires both to be handled.`,
          `add an arm: ${tag}(${tag === 'ok' ? 'v' : 'e'}) => ...`);
      }
    }

    let valueT = asExpr ? tvar() : null;
    for (const arm of m.arms) {
      const inner = new Scope(scope);
      if (arm.binder) inner.declare(arm.binder, { type: arm.tag === 'ok' ? okT : errT, line: arm.pos.line });
      if (arm.body.t === 'Block') {
        if (asExpr) {
          // `return` may leave a value arm when there is a function to return from (as in Rust);
          // an arm that always returns needs no value. break/continue still can't escape.
          const esc = findEscape(arm.body, false);
          const retOk = esc && esc.kind === 'return' && (currentFn != null || !esc.node.value);
          if (retOk && definitelyReturns(arm.body)) {
            checkStmt(arm.body, inner);
            continue;
          }
          if (esc && !retOk) diag(esc.node, `'${esc.kind}' inside a match arm that produces a value`,
            `This match is used as a value, so a block arm produces its value via its last line; '${esc.kind}' would jump out of the expression instead.`,
            esc.kind === 'return'
              ? `drop the 'return' and make the value the block's last line; or return the whole match: return match ...`
              : `move the '${esc.kind}' logic out of the match, or use a statement match: declare a variable first, then assign it inside each arm's block.`);
          const stmts = arm.body.stmts;
          // a nested match as the last line IS the value (rewritten in place, so the
          // interpreter evaluates it as an expression too)
          valueTail(stmts);
          const last = stmts[stmts.length - 1];
          if (!last || last.t !== 'ExprStmt')
            diag(last ?? arm.body, `this arm's block must end with the arm's value`,
              'When match is used as a value, a block arm produces the value of its final line; which must be a bare expression.',
              `add the value as the block's last line: ${arm.binder ? `${arm.tag}(${arm.binder})` : arm.tag === 'wild' ? '_' : JSON.stringify(arm.value)} => { ... theValue }`);
          const blockScope = new Scope(inner);
          for (let i = 0; i < stmts.length - 1; i++) checkStmt(stmts[i], blockScope);
          const t = inferExpr(last.expr, blockScope);
          if (!unify(valueT, t)) {
            diag(last.expr, `match arms produce different types`,
              `The other arm produces ${tn(valueT)}, but this one produces ${tn(t)}; a match that's used as a value must produce one type.`,
              'make both arms produce the same type (convert with str(...)/num(...)).');
          }
        } else {
          checkStmt(arm.body, inner);
        }
      } else {
        const t = inferExpr(arm.body, inner);
        if (asExpr && !unify(valueT, t)) {
          diag(arm.body, `match arms produce different types`,
            `The other arm produces ${tn(valueT)}, but this one produces ${tn(t)}; a match that's used as a value must produce one type.`,
            'make both arms produce the same type (convert with str(...)/num(...)).');
        }
      }
    }
    return asExpr ? valueT : UNIT;
  }
}
