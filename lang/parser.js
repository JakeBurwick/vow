// Vow parser — recursive descent + Pratt expressions. No parser libraries.

import { VowError, editDistance } from './diagnostics.js';
import { lex } from './lexer.js';
import { BUILTIN_NAMES } from './checker.js';

const BINARY_PREC = {
  'or': 1, 'and': 2,
  '==': 3, '!=': 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

// opts (all optional; a plain parse(src) is a single-file program):
//   base       offset of this file in the combined source of a multi-file program
//   onImport   ({ path, pathTok, alias, aliasTok }) => module info (lang/modules.js loads it)
//   noImports  { title, detail, fix } for hosts without files (playground, MCP without a path)
//   module     { label } when this file is imported by another one: only fn/struct/import allowed
export function parse(src, opts = {}) {
  const tokens = lex(src);
  if (opts.base) {
    for (const t of tokens) {
      t.start += opts.base; t.end += opts.base;
      for (const b of t.bare ?? []) { b.start += opts.base; b.end += opts.base; }
    }
  }
  let p = 0;
  // import aliases of this file: alias -> { mod, tok, path }
  const aliases = new Map();
  const fnNames = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].type === 'kw' && tokens[i].value === 'fn' && tokens[i + 1].type === 'ident') fnNames.add(tokens[i + 1].value);
  }

  // Pre-scan for struct names so `Name { ... }` can be parsed as a struct
  // literal without colliding with block syntax (if/while/for bodies).
  const structNames = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].type === 'kw' && tokens[i].value === 'struct' && tokens[i + 1].type === 'ident')
      structNames.add(tokens[i + 1].value);
  }

  const peek = (o = 0) => tokens[Math.min(p + o, tokens.length - 1)];
  // true if the tokens from here form `target = ...` (target: name, name.field, name[expr]...)
  // before the end of the line, without consuming anything
  const isAssignAhead = () => {
    let depth = 0;
    for (let k = 0; ; k++) {
      const t = peek(k);
      if (t.type === 'eof' || t.type === 'newline') return false;
      if (t.type === 'punct' && (t.value === '[' || t.value === '(')) depth++;
      else if (t.type === 'punct' && (t.value === ']' || t.value === ')')) depth--;
      else if (depth === 0 && t.type === 'punct' && t.value === '=') return true;
      else if (depth === 0 && !(t.type === 'ident' || (t.type === 'punct' && t.value === '.'))) return false;
      if (depth < 0) return false;
    }
  };
  const next = () => tokens[p++];
  const atPunct = (v) => peek().type === 'punct' && peek().value === v;
  const atKw = (v) => peek().type === 'kw' && peek().value === v;

  function fail(tok, title, detail, fix, kind = 'SyntaxError') {
    throw new VowError({
      kind, title,
      line: tok.line, col: tok.col,
      length: Math.max(1, (tok.end ?? tok.start + 1) - tok.start),
      detail, fix,
    });
  }

  function describe(tok) {
    if (tok.type === 'eof') return 'the end of the file';
    if (tok.type === 'newline') return 'the end of the line';
    if (tok.type === 'str') return `the string "${tok.value}"`;
    return `'${tok.value}'`;
  }

  function expectPunct(v, why) {
    if (!atPunct(v)) fail(peek(), `expected '${v}' but found ${describe(peek())}`, why, `add '${v}' here.`);
    return next();
  }
  function expectIdent(why) {
    if (peek().type !== 'ident') {
      if (peek().type === 'kw') fail(peek(), `'${peek().value}' is a reserved word`, why, 'pick a different name.');
      fail(peek(), `expected a name but found ${describe(peek())}`, why, 'add a name here.');
    }
    return next();
  }
  function skipNewlines() { while (peek().type === 'newline') next(); }

  function endStatement() {
    if (peek().type === 'newline') { skipNewlines(); return; }
    if (peek().type === 'eof' || atPunct('}')) return;
    fail(peek(), `unexpected ${describe(peek())} after the end of a statement`,
      'Each statement goes on its own line in Vow.',
      'put this on a new line, or check for a missing operator before it.');
  }

  // ---------- statements ----------

  function parseProgram() {
    const stmts = [], imports = [];
    skipNewlines();
    while (atKw('import')) {
      imports.push(parseImport());
      endStatement();
      skipNewlines();
    }
    while (peek().type !== 'eof') {
      stmts.push(atTestBlock() ? parseTest() : parseStmt(true));
      endStatement();
      skipNewlines();
    }
    if (opts.module) {
      // A module provides fns and structs; it runs no code of its own, so a top-level
      // statement there would silently never run (or run at an unclear time). Refuse it.
      // (Its test blocks are fine: `vow test module.vow` runs them; importers skip them.)
      const bad = stmts.find(st => st.t !== 'Fn' && st.t !== 'Struct' && st.t !== 'Test');
      if (bad) {
        const what = { Let: 'let', ExprStmt: 'statement', Assign: 'assignment', If: 'if', For: 'for loop', While: 'while loop', MatchStmt: 'match', Return: 'return' }[bad.t] ?? 'statement';
        fail(bad.pos, 'modules may only contain fn, struct and import at the top level',
          `${opts.module.label} is imported by another file, so it is a module: it provides fns and structs and runs no code of its own. This top-level ${what} would never run.`,
          bad.t === 'Let'
            ? `move it into the fn that needs it (a module has no global variables), or into the main file, the one you run.`
            : `move it into a fn, or into the main file (the one you run).`, 'ImportError');
      }
    }
    const program = { t: 'Program', stmts, imports };
    liftNestedFns(program);
    return program;
  }

  // test "name" { ... }: `test` is not a keyword (programs may name a variable or fn `test`);
  // a test block is the word test followed by a string at the start of a statement, which
  // can't be anything else in Vow.
  const atTestBlock = () => peek().type === 'ident' && peek().value === 'test' && peek(1).type === 'str';

  function parseTest() {
    const kw = next();
    const nameTok = next();
    if (nameTok.value.trim() === '') fail(nameTok, 'a test needs a name',
      'The name is what vow test prints for this test, so it should say what the test checks.',
      'write: test "converts celsius to fahrenheit" { ... }');
    if (!atPunct('{')) fail(peek(), `expected '{' after the test name, found ${describe(peek())}`,
      'A test block is written: test "name" { ... }, with the { on the same line as the name.',
      `write: test ${JSON.stringify(nameTok.value)} { ... }`);
    const body = parseBlock(`the body of test ${JSON.stringify(nameTok.value)}`);
    return { t: 'Test', name: nameTok.value, nameTok, body, pos: kw, start: kw.start, end: body.end };
  }

  // import "./geometry.vow" as geo
  function parseImport() {
    const kw = next();
    const pathTok = peek();
    if (pathTok.type === 'istrStart') fail(pathTok, 'an import path must be a plain string',
      'The file to import is fixed when the program is checked, so its path cannot contain ${...}.',
      'write the path as a literal: import "./geometry.vow" as geo', 'ImportError');
    if (pathTok.type !== 'str') fail(pathTok, `expected the path of a .vow file after import, found ${describe(pathTok)}`,
      'An import names a file by its path, in quotes, relative to this file.',
      'write: import "./geometry.vow" as geo', 'ImportError');
    next();
    const path = pathTok.value;
    const stem = (path.split('/').pop() ?? '').replace(/\.vow$/, '');
    let suggested = stem.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(?=\d)/, 'm') || 'mod';
    if (BUILTIN_NAMES.includes(suggested) || ['import', 'fn', 'let', 'struct', 'match', 'for', 'in', 'if', 'else', 'while', 'return'].includes(suggested)) suggested += 'Mod';
    if (!/^\.\.?\//.test(path)) fail(pathTok, `import paths start with ./ or ../`,
      `"${path}" is not a relative path. Imports are files next to this one (./name.vow) or in a folder relative to it (../lib/name.vow).`,
      `write: import "./${path.replace(/^\/+/, '')}" as ${suggested}`, 'ImportError');
    if (!path.endsWith('.vow')) fail(pathTok, 'an import path names a .vow file',
      `"${path}" does not end in .vow. Write the file name in full, extension included.`,
      `write: import "${path}.vow" as ${suggested}`, 'ImportError');
    if (!(peek().type === 'ident' && peek().value === 'as')) fail(peek(), `expected 'as' after the import path, found ${describe(peek())}`,
      'Every import gives the module a name, and its fns and structs are used through that name: geo.area(2), geo.Point { x: 1, y: 2 }.',
      `name it: import "${path}" as ${suggested}`, 'ImportError');
    next();
    const aliasTok = expectIdent(`name the module: import "${path}" as ${suggested}`);
    const alias = aliasTok.value;
    if (aliases.has(alias)) fail(aliasTok, `the name '${alias}' is already used for another import`,
      `Line ${aliases.get(alias).tok.line} imports "${aliases.get(alias).path}" as ${alias}. Each import needs its own name.`,
      `pick a different name: import "${path}" as ${suggested === alias ? alias + '2' : suggested}`, 'ImportError');
    if (BUILTIN_NAMES.includes(alias)) fail(aliasTok, `'${alias}' is a builtin function, so it can't name a module`,
      `${alias}(...) would become ambiguous in this file.`, `pick a different name: import "${path}" as ${alias}Mod`, 'ImportError');
    if (fnNames.has(alias) || structNames.has(alias)) fail(aliasTok, `'${alias}' is also the name of a ${fnNames.has(alias) ? 'fn' : 'struct'} in this file`,
      `A module name and a ${fnNames.has(alias) ? 'fn' : 'struct'} with the same name would make '${alias}' ambiguous.`,
      `pick a different module name: import "${path}" as ${alias}Mod`, 'ImportError');
    if (!opts.onImport) {
      const n = opts.noImports ?? {};
      fail(kw, n.title ?? 'imports work in the Vow CLI; this runs one file',
        n.detail ?? 'This host runs a single source text with no files around it, so there is nothing to import from.',
        n.fix ?? 'run the program with the CLI, which loads imported files from disk: vow main.vow (or paste the module\'s fns into this file).', 'ImportError');
    }
    const mod = opts.onImport({ path, pathTok, alias, aliasTok });
    for (const [other, a] of aliases) {
      if (a.mod === mod) fail(pathTok, `${mod.label} is already imported as ${other}`,
        `Line ${a.tok.line} imports the same file. Importing it twice would give one module two names.`,
        `use ${other}.name everywhere and delete this import.`, 'ImportError');
    }
    aliases.set(alias, { mod, tok: aliasTok, path });
    return { t: 'Import', path, alias, mod, pos: kw, start: kw.start, end: aliasTok.end };
  }

  // an alias is a module name for the whole file: nothing else may reuse it
  function notAlias(tok, what) {
    if (tok && aliases.has(tok.value)) fail(tok, `'${tok.value}' is the name of an imported module`,
      `Line ${aliases.get(tok.value).tok.line} imports "${aliases.get(tok.value).path}" as ${tok.value}, so it can't also be ${what}.`,
      `pick another name for ${what}, or rename the import.`, 'ImportError');
    return tok;
  }

  // geo.area / geo.Point { ... }: a name from an imported module
  function parseQualified(aliasTok) {
    const { mod } = aliases.get(aliasTok.value);
    const alias = aliasTok.value;
    if (!atPunct('.')) {
      const called = atPunct('(');
      fail(aliasTok, `'${alias}' is a module, not a value`,
        `${alias} is the name of the imported file ${mod.label}. It holds fns and structs; use them through the dot: ${alias}.name.`,
        mod.exports.length
          ? `${called ? 'call a fn from it' : 'use one of its names'}: ${mod.exports.slice(0, 4).map(n => `${alias}.${n}`).join(', ')}`
          : `${mod.label} exports nothing yet: add a fn to it (names starting with _ stay private).`, 'ImportError');
    }
    next(); // .
    const mem = expectIdent(`after ${alias}. comes the name of a fn or struct from ${mod.label}: ${alias}.name`);
    const m = mem.value;
    const exported = mod.exports.includes(m);
    if (!exported) {
      if (mod.lifted.has(m)) fail(mem, `${alias}.${m} is not exported`,
        `${m} is a nested fn inside fn ${mod.lifted.get(m)} in ${mod.label}. A module exports only its top-level fns and structs.`,
        `move fn ${m} to the top level of ${mod.label}.`, 'ImportError');
      if (m.startsWith('_') && (mod.fns.has(m) || mod.structs.has(m))) fail(mem, `${alias}.${m} is private to ${mod.label}`,
        `Names that start with _ are not exported: only code inside ${mod.label} can use ${m}.`,
        `use one of its exported names (${mod.exports.join(', ') || 'none yet'}), or rename ${m} in ${mod.label} without the _ to export it.`, 'ImportError');
      let best = null, bestD = 3;
      for (const n of mod.exports) { const d = editDistance(m, n); if (d < bestD) { bestD = d; best = n; } }
      fail(mem, `module ${alias} has no fn or struct named '${m}'`,
        `${alias} is ${mod.label}, which exports: ${mod.exports.join(', ') || '(nothing yet)'}.`,
        best ? `did you mean ${alias}.${best}?` : `check the name, or add fn ${m}(...) to ${mod.label}.`, 'ImportError');
    }
    const shown = `${alias}.${m}`;
    if (mod.structs.has(m)) {
      const internal = mod.structs.get(m);
      if (!atPunct('{')) fail(mem, `${shown} is a struct, not a value`,
        `A struct is built with a literal that sets every field.`,
        `build one: ${shown} { ${mod.structFields.get(m).map(f => `${f}: ...`).join(', ')} }`, 'ImportError');
      const tok = { type: 'ident', value: internal, shown, line: aliasTok.line, col: aliasTok.col, start: aliasTok.start, end: mem.end };
      return parseStructLit(tok);
    }
    return { t: 'Ident', name: mod.fns.get(m), shown, pos: aliasTok, start: aliasTok.start, end: mem.end };
  }

  // Nested `fn` declarations (bench: agents wrote them in 3 rounds running, as Python and
  // TypeScript allow). A nested fn that only uses its own params and globals is lifted to the
  // top level, keeping recursion, generics and contracts. One that reads its parent's locals
  // becomes a closure: `let name = (params) => { body }`, marked rec when it calls itself.
  function liftNestedFns(program) {
    const topNames = new Set();
    for (const s of program.stmts) if (s.t === 'Fn' || s.t === 'Struct' || s.t === 'Let') topNames.add(s.name);
    const lifted = [];

    const walk = (node, visit) => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
      if (visit(node) === false) return;
      for (const k in node) {
        if (k === 'pos' || k === 'tok' || k === 'nameTok' || k === 'tagTok' || k === 'binderTok') continue;
        const v = node[k];
        if (v != null && typeof v === 'object') walk(v, visit);
      }
    };
    // names a body declares for itself (params, lets, loop/match binders, lambda params), not
    // looking inside nested fns, which get their own scope
    const declaredIn = (fn) => {
      const names = new Set(fn.params.map(p => p.name));
      walk(fn.body, (n) => {
        if (n.t === 'Fn') return false;
        if (n.t === 'Let') names.add(n.name);
        if (n.t === 'For') names.add(n.binder);
        if (n.t === 'Match') for (const a of n.arms) if (a.binder) names.add(a.binder);
        if (n.t === 'Lambda') for (const p of n.params) names.add(p.name);
      });
      return names;
    };
    const usedIn = (body) => {
      const names = new Set();
      walk(body, (n) => {
        if (n.t === 'Ident') names.add(n.name); // a call's calleeNode is an Ident too
      });
      return names;
    };
    const rename = (body, from, to) => walk(body, (n) => {
      if (n.t === 'Ident' && n.name === from) n.name = to;
      if (n.t === 'Call' && n.callee === from) n.callee = to;
    });

    const processFn = (parent) => {
      const parentLocals = declaredIn(parent);
      // every nested fn directly inside this parent (not inside another nested fn), with its block
      const nested = [];
      walk(parent.body, (blk) => {
        if (blk.t === 'Fn') return false; // handled when its own block is reached
        if (!Array.isArray(blk.stmts)) return;
        for (const fn of blk.stmts) if (fn.t === 'Fn') nested.push({ blk, fn });
      });
      for (const { fn } of nested) processFn(fn); // inner-most first
      const captured = new Map(); // fn -> the parent names it uses
      for (const { fn } of nested) {
        const own = declaredIn(fn);
        captured.set(fn, [...usedIn(fn.body)].filter(n => parentLocals.has(n) && !own.has(n) && n !== fn.name));
      }
      // A nested fn that calls a sibling closure must stay a closure too (it needs the sibling,
      // which only exists inside the parent), even when it reads no parent variable itself.
      const closureNames = new Set(nested.filter(({ fn }) => captured.get(fn).length).map(({ fn }) => fn.name));
      for (let changed = true; changed;) {
        changed = false;
        for (const { fn } of nested) {
          if (closureNames.has(fn.name)) continue;
          const sibling = [...usedIn(fn.body)].find(n => closureNames.has(n));
          if (sibling) { captured.get(fn).push(sibling); closureNames.add(fn.name); changed = true; }
        }
      }
      for (const { blk, fn } of nested) {
        const captures = captured.get(fn);
        const i = blk.stmts.indexOf(fn);
        if (captures.length === 0) {
          let name = fn.name;
          if (topNames.has(name)) { name = `${parent.name}_${fn.name}`; rename(parent.body, fn.name, name); rename(fn.body, fn.name, name); }
          topNames.add(name);
          fn.name = name;
          fn.lifted = parent.name; // not exported from a module
          lifted.push(fn);
          blk.stmts.splice(i, 1);
        } else {
          if (fn.expects.length || fn.ensures.length || fn.uses.length) fail(fn.nameTok,
            `nested fn ${fn.name} uses ${captures.join(', ')} from fn ${parent.name}, so it can't have expects/ensures/uses`,
            'A nested fn that reads its parent\'s variables becomes a closure, and closures have no contracts or capability clauses.',
            `move fn ${fn.name} to the top level and pass ${captures.join(', ')} in as parameters.`);
          // A closure that calls itself (a DFS helper over the parent's visited map) is a
          // `let rec`: its own name is in scope inside its body.
          const rec = usedIn(fn.body).has(fn.name);
          // fnName/nameTok: the checker names it `fn visit` in diagnostics, not "this lambda"
          const lambda = { t: 'Lambda', params: fn.params, body: fn.body, fnName: fn.name, nameTok: fn.nameTok, pos: fn.pos, start: fn.start, end: fn.end };
          blk.stmts[i] = { t: 'Let', name: fn.name, nameTok: fn.nameTok, expr: lambda, rec, pos: fn.pos, start: fn.start, end: fn.end };
        }
      }
    };
    const top = { name: 'main', params: [], body: { t: 'Block', stmts: [] } };
    for (const s of program.stmts) {
      if (s.t === 'Fn') processFn(s);
      else processFn({ ...top, body: s }); // nested fns inside top-level if/for blocks
    }
    program.stmts.push(...lifted);
  }

  function parseStmt(topLevel = false) {
    const tok = peek();
    if (!topLevel && atTestBlock()) fail(tok, 'test blocks go at the top level of the file',
      'A test is a whole-file check: it runs with vow test file.vow, never as part of a fn or another test.',
      'move this test block to the top level, outside every fn, loop and test.');
    if (tok.type === 'kw') {
      switch (tok.value) {
        case 'let': return parseLet();
        case 'fn': return parseFn(); // nested fns are lifted or turned into closures after parsing
        case 'struct':
          if (!topLevel) fail(tok, 'structs must be declared at the top level',
            'A struct is a program-wide shape, like a fn.',
            'move this struct outside of the surrounding block.');
          return parseStruct();
        case 'if': return parseIf();
        case 'while': return parseWhile();
        case 'for': return parseFor();
        case 'return': return parseReturn();
        case 'break': { const t = next(); return { t: 'Break', pos: t, start: t.start, end: t.end }; }
        case 'continue': { const t = next(); return { t: 'Continue', pos: t, start: t.start, end: t.end }; }
        case 'match': { const m = parseMatch(); return { t: 'MatchStmt', match: m, pos: m.pos, start: m.start, end: m.end }; }
        case 'import': fail(tok, 'imports go at the top of the file',
          'An import must come before any other code, at the top level of the file.',
          'move this import to the top of the file.');
        case 'else': fail(tok, "'else' without a matching 'if'",
          "An else must come right after an if block's closing '}'.",
          "attach this else to an if: } else { ...");
      }
    }
    return parseExprOrAssign();
  }

  function parseLet() {
    const kw = next();
    const name = notAlias(expectIdent('let declares a new variable: let name = value'), 'a variable');
    expectPunct('=', `let needs an initial value: let ${name.value} = ...`);
    const expr = parseExpr();
    return { t: 'Let', name: name.value, nameTok: name, expr, pos: kw, start: kw.start, end: expr.end };
  }

  function parseFn() {
    const kw = next();
    const name = notAlias(expectIdent('functions are declared as: fn name(args) { ... }'), 'a fn');
    expectPunct('(', `fn ${name.value} needs a parameter list, even if empty: fn ${name.value}() { ... }`);
    const params = [];
    if (!atPunct(')')) {
      for (;;) {
        const param = notAlias(expectIdent('parameters are plain names separated by commas'), 'a parameter');
        if (params.some(q => q.name === param.value))
          fail(param, `duplicate parameter '${param.value}'`, `fn ${name.value} already has a parameter with this name.`, 'rename one of them.');
        params.push({ name: param.value, tok: param });
        if (atPunct(',')) { next(); continue; }
        break;
      }
    }
    expectPunct(')', 'close the parameter list.');
    skipNewlines();

    const expects = [], ensures = [], uses = [];
    while (atKw('expects') || atKw('ensures') || atKw('uses')) {
      const clause = next().value;
      if (clause === 'uses') {
        for (;;) {
          const cap = expectIdent(`uses lists capability names: fn ${name.value}(...) uses net, fs { ... }`);
          if (uses.some(u => u.name === cap.value))
            fail(cap, `duplicate capability '${cap.value}'`, `fn ${name.value} already lists '${cap.value}' in its uses clause.`, 'remove the duplicate.');
          uses.push({ name: cap.value, tok: cap });
          if (atPunct(',')) { next(); continue; }
          break;
        }
        skipNewlines();
        continue;
      }
      const which = clause === 'expects' ? expects : ensures;
      for (;;) {
        which.push(parseExpr());
        if (atPunct(',')) { next(); continue; }
        break;
      }
      skipNewlines();
    }

    const body = parseBlock(`the body of fn ${name.value}`);
    return { t: 'Fn', name: name.value, nameTok: name, params, expects, ensures, uses, body, pos: kw, start: kw.start, end: body.end };
  }

  function parseStruct() {
    const kw = next();
    const name = notAlias(expectIdent('structs are declared as: struct Name { field1, field2 }'), 'a struct');
    expectPunct('{', `struct ${name.value} needs a field list: struct ${name.value} { x, y }`);
    skipNewlines();
    const fields = [];
    while (!atPunct('}')) {
      if (peek().type === 'eof') fail(kw, `struct ${name.value} is never closed`,
        'No matching } was found.', 'add a closing } after the last field.');
      const f = expectIdent('struct fields are plain names separated by commas or newlines');
      if (fields.some(q => q.name === f.value))
        fail(f, `duplicate field '${f.value}'`, `struct ${name.value} already has a field with this name.`, 'rename one of them.');
      fields.push({ name: f.value, tok: f });
      if (atPunct(',')) next();
      skipNewlines();
    }
    const close = next();
    if (fields.length === 0) fail(kw, `struct ${name.value} has no fields`,
      'A struct groups named values, so it needs at least one field.',
      `add fields: struct ${name.value} { x, y }`);
    return { t: 'Struct', name: name.value, nameTok: name, fields, pos: kw, start: kw.start, end: close.end };
  }

  function parseStructLit(nameTok) {
    const shown = nameTok.shown ?? nameTok.value;
    expectPunct('{', `a ${shown} value is built as: ${shown} { field: value, ... }`);
    skipNewlines();
    const fields = [];
    while (!atPunct('}')) {
      if (peek().type === 'eof') fail(nameTok, `this ${shown} literal is never closed`,
        'No matching } was found.', 'add a closing } after the last field.');
      const f = expectIdent(`struct literal entries look like: field: value`);
      expectPunct(':', `each entry is field: value, e.g. ${f.value}: ...`);
      const value = parseExpr();
      if (fields.some(q => q.name === f.value))
        fail(f, `field '${f.value}' is set twice`, `This ${shown} literal already sets '${f.value}'.`, 'remove one of them.');
      fields.push({ name: f.value, tok: f, value });
      if (atPunct(',')) { next(); skipNewlines(); continue; }
      skipNewlines();
    }
    const close = next();
    return { t: 'StructLit', name: nameTok.value, shown: nameTok.shown, nameTok, fields, pos: nameTok, start: nameTok.start, end: close.end };
  }

  function parseBlock(what) {
    const open = peek();
    if (!atPunct('{')) fail(open, `expected '{' to start ${what}`,
      `Found ${describe(open)} instead.`, `add { ... } around ${what}.`);
    next();
    const stmts = [];
    skipNewlines();
    while (!atPunct('}')) {
      if (peek().type === 'eof') fail(open, "this '{' is never closed",
        `The block starting at line ${open.line} has no matching '}'.`, "add a closing } for this block.");
      stmts.push(parseStmt(false));
      endStatement();
      skipNewlines();
    }
    const close = next();
    return { t: 'Block', stmts, pos: open, start: open.start, end: close.end };
  }

  function parseIf() {
    const kw = next();
    const cond = parseExpr();
    const then = parseBlock('the if branch');
    let alt = null;
    const save = p;
    skipNewlines();
    if (atKw('else')) {
      next();
      alt = atKw('if') ? parseIf() : parseBlock('the else branch');
    } else {
      p = save; // no else; don't eat the statement-ending newline
    }
    return { t: 'If', cond, then, alt, pos: kw, start: kw.start, end: (alt ?? then).end };
  }

  function parseWhile() {
    const kw = next();
    const cond = parseExpr();
    const body = parseBlock('the while body');
    return { t: 'While', cond, body, pos: kw, start: kw.start, end: body.end };
  }

  function parseFor() {
    const kw = next();
    const binder = notAlias(expectIdent('for loops look like: for item in someList { ... }'), 'a loop variable');
    if (!atKw('in')) fail(peek(), "expected 'in'", 'for loops look like: for item in someList { ... }', "add 'in' between the loop variable and the list.");
    next();
    const iter = parseExpr();
    const body = parseBlock('the for body');
    return { t: 'For', binder: binder.value, binderTok: binder, iter, body, pos: kw, start: kw.start, end: body.end };
  }

  function parseReturn() {
    const kw = next();
    let value = null;
    if (peek().type !== 'newline' && !atPunct('}') && peek().type !== 'eof') value = parseExpr();
    return { t: 'Return', value, pos: kw, start: kw.start, end: value ? value.end : kw.end };
  }

  function parseMatch() {
    const kw = next();
    const subject = parseExpr();
    expectPunct('{', 'match needs a body: match value { ok(v) => ...  err(e) => ... }');
    skipNewlines();
    const arms = [];
    while (!atPunct('}')) {
      if (peek().type === 'eof') fail(kw, 'this match is never closed', 'No matching } was found.', 'add a closing } for the match.');
      const tag = peek();
      // Value patterns: match a str/num/bool against literals, with `_` as the catch-all.
      // (bench: agents wrote `match jsonType(v) { "string" => ... }` in 3 of 10 failed attempts)
      let lit = null;
      if (tag.type === 'str' || tag.type === 'num') lit = { kind: 'lit', value: tag.value };
      else if (tag.type === 'kw' && (tag.value === 'true' || tag.value === 'false')) lit = { kind: 'lit', value: tag.value === 'true' };
      else if (tag.type === 'ident' && tag.value === '_') lit = { kind: 'wild' };
      else if (tag.type !== 'ident' || (tag.value !== 'ok' && tag.value !== 'err')) {
        fail(tag, `match arms must be ok(...)/err(...) or literal values, found ${describe(tag)}`,
          'A Result match uses ok(v) and err(e). A value match uses literals like "a", 3 or true, with _ for everything else.',
          'write the arm as: ok(v) => ... / err(e) => ...  or  "text" => ... / _ => ...');
      }
      next();
      let binder = null;
      if (!lit) {
        expectPunct('(', `the ${tag.value} pattern binds a name: ${tag.value}(v) => ...`);
        binder = notAlias(expectIdent(`name the ${tag.value === 'ok' ? 'value' : 'error'} inside, e.g. ${tag.value}(v)`), 'a match binding');
        expectPunct(')', 'close the pattern.');
      }
      const patText = lit ? (lit.kind === 'wild' ? '_' : JSON.stringify(lit.value)) : `${tag.value}(${binder.value})`;
      if (!atPunct('=>')) fail(peek(), "expected '=>' after the pattern", 'Each arm maps a pattern to a result.', `write: ${patText} => ...`);
      next();
      // `err(e) => continue` / `break` / `return x`: a bare control-flow arm is sugar for a one-statement block
      const ctl = (peek().type === 'kw' && ['break', 'continue', 'return'].includes(peek().value))
        // `ok(n) => total = n` / `ok(n) => m["k"] = n`: a one-line assignment arm
        || (peek().type === 'ident' && isAssignAhead());
      let body;
      if (atPunct('{')) body = parseBlock(`the ${tag.value} arm`);
      else if (ctl) {
        const st = parseStmt(false);
        body = { t: 'Block', stmts: [st], pos: st.pos, start: st.start, end: st.end };
      } else body = parseExpr();
      arms.push(lit
        ? { tag: lit.kind, value: lit.value, tagTok: tag, binder: null, body, pos: tag, start: tag.start, end: body.end }
        : { tag: tag.value, tagTok: tag, binder: binder.value, binderTok: binder, body, pos: tag, start: tag.start, end: body.end });
      skipNewlines();
    }
    const close = next();
    return { t: 'Match', subject, arms, pos: kw, start: kw.start, end: close.end };
  }

  function parseExprOrAssign() {
    const e = parseExpr();
    if (atPunct('=')) {
      const eq = next();
      if (e.t !== 'Ident' && e.t !== 'Index' && e.t !== 'Field') {
        fail(eq, "can't assign to this",
          'Only a variable (x = ...), an element (list[i] = ...), or a field (p.x = ...) can be assigned to.',
          'did you mean == (comparison)?');
      }
      const value = parseExpr();
      return { t: 'Assign', target: e, value, pos: eq, start: e.start, end: value.end };
    }
    return { t: 'ExprStmt', expr: e, pos: e.pos, start: e.start, end: e.end };
  }

  // ---------- expressions ----------

  function parseExpr(minPrec = 1) {
    let left = parseUnary();
    for (;;) {
      const tok = peek();
      const op = (tok.type === 'punct' || tok.type === 'kw') ? tok.value : null;
      const prec = BINARY_PREC[op];
      if (prec == null || prec < minPrec) break;
      next();
      const right = parseExpr(prec + 1);
      left = { t: 'Binary', op, left, right, pos: tok, start: left.start, end: right.end };
    }
    return left;
  }

  function parseUnary() {
    if (atKw('not')) {
      const tok = next();
      const operand = parseUnary();
      return { t: 'Unary', op: 'not', operand, pos: tok, start: tok.start, end: operand.end };
    }
    if (atPunct('-')) {
      const tok = next();
      const operand = parseUnary();
      return { t: 'Unary', op: '-', operand, pos: tok, start: tok.start, end: operand.end };
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let e = parsePrimary();
    for (;;) {
      if (atPunct('(')) {
        const open = next();
        const args = [];
        if (!atPunct(')')) {
          for (;;) {
            args.push(parseExpr());
            if (atPunct(',')) { next(); continue; }
            break;
          }
        }
        const close = expectPunct(')', 'close the argument list.');
        if (e.t !== 'Ident') fail(open, 'only named functions can be called',
          'Vow calls functions through a name: a top-level fn, a parameter, or a variable.',
          'assign the function to a variable first: let f = x => x + 1, then call f(x).');
        e = { t: 'Call', callee: e.name, calleeNode: e, args, pos: e.pos, start: e.start, end: close.end };
        if (e.calleeNode.shown) e.shown = e.calleeNode.shown;
        continue;
      }
      if (atPunct('[')) {
        next();
        const index = parseExpr();
        const close = expectPunct(']', 'close the index.');
        e = { t: 'Index', target: e, index, pos: e.pos, start: e.start, end: close.end };
        continue;
      }
      if (atPunct('?')) {
        const tok = next();
        e = { t: 'Try', operand: e, pos: tok, start: e.start, end: tok.end };
        continue;
      }
      if (atPunct('.')) {
        next();
        const name = expectIdent('a dot accesses a struct field: point.x');
        e = { t: 'Field', target: e, name: name.value, nameTok: name, pos: name, start: e.start, end: name.end };
        continue;
      }
      break;
    }
    return e;
  }


  function parenIsLambda() {
    let q = p + 1; // just past '('
    const isP = (k, v) => tokens[Math.min(k, tokens.length - 1)].type === 'punct'
      && tokens[Math.min(k, tokens.length - 1)].value === v;
    if (isP(q, ')')) return isP(q + 1, '=>');
    for (;;) {
      if (tokens[Math.min(q, tokens.length - 1)].type !== 'ident') return false;
      q++;
      if (isP(q, ',')) { q++; continue; }
      break;
    }
    return isP(q, ')') && isP(q + 1, '=>');
  }

  function parseLambda(params, startTok) {
    const arrow = expectPunct('=>', 'a lambda looks like: x => x + 1');
    for (let a = 0; a < params.length; a++)
      for (let b = a + 1; b < params.length; b++)
        if (params[a].name === params[b].name)
          fail(params[b].tok, `duplicate parameter '${params[b].name}'`,
            'This lambda already has a parameter with this name.', 'rename one of them.');
    let body;
    if (atPunct('{')) {
      body = parseBlock('the lambda body');
    } else {
      const e = parseExpr();
      body = { t: 'Block', stmts: [{ t: 'Return', value: e, pos: e.pos, start: e.start, end: e.end }], pos: e.pos, start: e.start, end: e.end };
    }
    return { t: 'Lambda', params, body, pos: arrow, start: startTok.start, end: body.end };
  }

  function parsePrimary() {
    const tok = peek();
    if (tok.type === 'num') { next(); return { t: 'Num', value: tok.value, pos: tok, start: tok.start, end: tok.end }; }
    if (tok.type === 'str') { next(); return { t: 'Str', value: tok.value, bare: tok.bare ?? [], pos: tok, start: tok.start, end: tok.end }; }
    if (tok.type === 'istrStart') {
      next();
      const parts = [{ kind: 'str', value: tok.value, tok }];
      const bare = [...tok.bare];
      for (;;) {
        const expr = parseExpr();
        parts.push({ kind: 'expr', expr });
        const seg = peek();
        if (seg.type === 'istrMid') { next(); parts.push({ kind: 'str', value: seg.value, tok: seg }); bare.push(...seg.bare); continue; }
        if (seg.type === 'istrEnd') {
          next(); parts.push({ kind: 'str', value: seg.value, tok: seg }); bare.push(...seg.bare);
          return { t: 'InterpStr', parts, bare, pos: tok, start: tok.start, end: seg.end };
        }
        fail(seg, `unexpected ${describe(seg)} inside a string interpolation`,
          'Each ${...} in a string holds exactly one expression, closed by }.',
          'check for a missing operator, or close the interpolation with } right after the expression: "${a + b} total". If "${" is meant as literal text, escape the dollar: \\${');
      }
    }
    if (tok.type === 'kw' && (tok.value === 'true' || tok.value === 'false')) {
      next(); return { t: 'Bool', value: tok.value === 'true', pos: tok, start: tok.start, end: tok.end };
    }
    if (tok.type === 'ident') {
      next();
      if (aliases.has(tok.value)) {
        if (atPunct('=>')) notAlias(tok, 'a lambda parameter');
        return parseQualified(tok);
      }
      if (structNames.has(tok.value) && atPunct('{')) return parseStructLit(tok);
      if (atPunct('{')) {
        for (const [alias, a] of aliases) {
          if (a.mod.structs.has(tok.value) && a.mod.exports.includes(tok.value)) fail(tok, `struct ${tok.value} is in an imported module: write ${alias}.${tok.value} { ... }`,
            'Names from another file are always used through the module\'s name, so they can never collide with names here.',
            `write ${alias}.${tok.value} { ${a.mod.structFields.get(tok.value).map(f => `${f}: ...`).join(', ')} }`, 'ImportError');
        }
      }
      if (atPunct('=>')) return parseLambda([{ name: tok.value, tok }], tok);
      return { t: 'Ident', name: tok.value, pos: tok, start: tok.start, end: tok.end };
    }
    if (tok.type === 'kw' && tok.value === 'match') return parseMatch();
    // `if c { a } else { b }` in value position: each branch's last line is its value
    if (tok.type === 'kw' && tok.value === 'if') { const st = parseIf(); return { t: 'IfExpr', stmt: st, pos: st.pos, start: st.start, end: st.end }; }
    if (atPunct('(')) {
      if (parenIsLambda()) {
        next(); // (
        const params = [];
        while (!atPunct(')')) {
          const param = notAlias(expectIdent('lambda parameters are plain names separated by commas'), 'a lambda parameter');
          params.push({ name: param.value, tok: param });
          if (atPunct(',')) next();
        }
        next(); // )
        return parseLambda(params, tok);
      }
      next();
      const e = parseExpr();
      expectPunct(')', 'close the parenthesis.');
      return e;
    }
    if (atPunct('[')) {
      const open = next();
      const items = [];
      if (!atPunct(']')) {
        for (;;) {
          items.push(parseExpr());
          if (atPunct(',')) { next(); if (atPunct(']')) break; continue; }
          break;
        }
      }
      const close = expectPunct(']', 'close the list.');
      return { t: 'ListLit', items, pos: open, start: open.start, end: close.end };
    }
    if (atPunct('{')) {
      const open = next();
      const entries = [];
      skipNewlines();
      if (!atPunct('}')) {
        for (;;) {
          const key = peek();
          if (key.type !== 'str') fail(key, 'map keys must be strings',
            'Map literals look like: {"name": "Ada", "age": 36}. A bare name is not allowed as a key.',
            key.type === 'ident'
              ? `for the literal key write {"${key.value}": ...}; to use the VALUE of ${key.value} as the key, start empty and assign: let m = {} then m[${key.value}] = ...`
              : 'put the key in double quotes.');
          next();
          expectPunct(':', 'each map entry is "key": value.');
          const value = parseExpr();
          entries.push({ key: key.value, value });
          if (atPunct(',')) { next(); skipNewlines(); if (atPunct('}')) break; continue; }
          skipNewlines();
          break;
        }
      }
      const close = expectPunct('}', 'close the map.');
      return { t: 'MapLit', entries, pos: open, start: open.start, end: close.end };
    }
    if (tok.type === 'kw') fail(tok, `'${tok.value}' can't be used as a value here`,
      `'${tok.value}' is a Vow keyword.`,
      tok.value === 'fn' ? 'declare functions at the top level, then call them by name.' : 'check the statement structure.');
    fail(tok, `expected a value but found ${describe(tok)}`,
      'A value is a number, string, true/false, a name, a list [..], a map {..}, a call, or (expr).',
      'check for a missing value or an extra operator right before this.');
  }

  return parseProgram();
}
