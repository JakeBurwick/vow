// Vow module loader: `import "./geometry.vow" as geo` across files.
//
// Rules (also in bench/VOW_GUIDE.md):
//   - imports come first in a file; the path is a string literal starting with ./ or ../,
//     relative to the importing file, naming a .vow file; `as name` is required
//   - a module (an imported file) holds only fn, struct and import at its top level
//   - its top-level fns and structs are exported, except names starting with _ (private)
//     and nested fns; importers use them as geo.area(...) and geo.Point { ... }
//   - each file is loaded once however many files import it; cycles are an error
//
// All files are concatenated into one combined source string (the main file first, at
// offset 0), each parsed with its own base offset, so every node offset is unique and the
// rest of the toolchain (checker, prover, interpreter, compiler) keeps working on one AST.
// diagnostics.js maps offsets back to file + line. A module's fns and structs get internal
// names "<stem>.<name>" (a dot no user name can contain), so they never collide.
//
// host = {
//   read(abs) -> text (throws { code } on failure)
//   resolve(fromAbs, relPath) -> abs
//   label(abs) -> the path shown in diagnostics
//   siblings(abs) -> names of the .vow files in that file's folder (for "did you mean")
// }

import { parse } from './parser.js';
import { VowError, registerSources } from './diagnostics.js';

function editDistance(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

const SKIP = new Set(['pos', 'tok', 'nameTok', 'tagTok', 'binderTok', 'keyTok', 'calleeNode', 'mod']);
// AST nodes point at their module through a non-enumerable property, so every generic AST
// walker in the toolchain (for...in / Object.keys) skips it instead of looping through
// module records.
const setMod = (node, mod) => Object.defineProperty(node, 'mod', { value: mod, enumerable: false, writable: true, configurable: true });

function walk(node, visit) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  visit(node);
  for (const k in node) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (v != null && typeof v === 'object') walk(v, visit);
  }
}

export function loadProgram(entrySrc, entryAbs, host) {
  const entryLabel = host.label(entryAbs);
  const files = [{ start: 0, end: entrySrc.length, label: entryLabel, text: entrySrc, abs: entryAbs }];
  let combined = entrySrc;
  const mods = new Map(); // abs -> loaded module
  const loading = []; // the import chain being loaded right now: [{ abs, label }]
  const order = []; // modules in dependency order (a module before anything that imports it)
  const prefixes = new Set();

  const importError = (tok, title, detail, fix) => {
    const e = new VowError({ kind: 'ImportError', title, line: tok.line, col: tok.col, length: Math.max(1, tok.end - tok.start), detail, fix });
    e.diag.importError = true;
    return e;
  };

  const onImportFrom = (fromAbs, fromLabel) => ({ path, pathTok }) => {
    const abs = host.resolve(fromAbs, path);
    const cyc = loading.findIndex(l => l.abs === abs);
    if (cyc >= 0) {
      const chain = [...loading.slice(cyc).map(l => l.label), host.label(abs)];
      throw importError(pathTok, `import cycle: ${chain.join(' -> ')}`,
        `These files import each other in a circle, so none of them can be loaded first.`,
        `move the fns and structs they share into a separate module that imports none of them, and import that one from each file.`);
    }
    if (mods.has(abs)) return mods.get(abs);
    let text;
    try { text = host.read(abs); } catch (e) {
      const shown = host.label(abs);
      if (e && e.code === 'ENOENT') {
        const base = path.split('/').pop();
        let best = null, bestD = 4;
        for (const n of host.siblings(abs)) { const d = editDistance(base, n); if (d < bestD && d > 0) { bestD = d; best = n; } }
        throw importError(pathTok, `can't find the module "${path}"`,
          `This import looks for ${shown}${shown !== abs ? ` (${abs})` : ''}, relative to the folder of ${fromLabel}, but there is no such file.`,
          best ? `did you mean "${path.slice(0, path.length - base.length)}${best}"?` : `check the path (it is relative to ${fromLabel}), or create ${shown}.`);
      }
      throw importError(pathTok, `can't read the module "${path}"`,
        `Reading ${shown} failed: ${e && e.code ? e.code : e && e.message}.`,
        e && e.code === 'EISDIR' ? 'import a .vow file, not a folder.' : 'check that the file exists and can be read.');
    }
    return loadModule(abs, text);
  };

  function tag(e, f) {
    if (e instanceof VowError && !e.diag.file) { e.diag.file = f.label; e.diag.fileSrc = f.text; }
  }

  function loadModule(abs, text) {
    const label = host.label(abs);
    const start = combined.length + 1;
    combined += '\n' + text;
    const f = { start, end: start + text.length, label, text, abs };
    files.push(f);
    loading.push({ abs, label });
    let ast;
    try { ast = parse(text, { base: start, onImport: onImportFrom(abs, label), module: { label } }); }
    catch (e) { tag(e, f); throw e; }
    loading.pop();

    let stem = (abs.split(/[\\/]/).pop() ?? 'module').replace(/\.vow$/, '') || 'module';
    let prefix = stem;
    for (let n = 2; prefixes.has(prefix); n++) prefix = `${stem}${n}`;
    prefixes.add(prefix);

    const mod = { abs, label, prefix, isEntry: false, fns: new Map(), structs: new Map(), structFields: new Map(), lifted: new Map(), exports: [], imports: new Set(ast.imports.map(i => i.mod)), aliases: new Map(ast.imports.map(i => [i.alias, i.mod])), stmts: ast.stmts };
    for (const s of ast.stmts) {
      const internal = `${prefix}.${s.name}`;
      if (s.t === 'Fn') {
        mod.fns.set(s.name, internal);
        if (s.lifted) mod.lifted.set(s.name, s.lifted);
      } else {
        mod.structs.set(s.name, internal);
        mod.structFields.set(s.name, s.fields.map(x => x.name));
      }
    }
    for (const s of ast.stmts) {
      s.bare = s.name;
      s.name = `${prefix}.${s.name}`;
      setMod(s, mod);
    }
    mod.exports = [...mod.fns.keys(), ...mod.structs.keys()].filter(n => !n.startsWith('_') && !mod.lifted.has(n)).sort();
    mods.set(abs, mod);
    order.push(mod);
    return mod;
  }

  const entryFile = files[0];
  loading.push({ abs: entryAbs, label: entryLabel });
  let entryAst;
  try { entryAst = parse(entrySrc, { onImport: onImportFrom(entryAbs, entryLabel) }); }
  catch (e) { if (files.length > 1 || e?.diag?.importError || e?.diag?.kind === 'ImportError' || /^\s*import\b/m.test(entrySrc)) tag(e, entryFile); throw e; }
  loading.pop();

  if (files.length === 1) return { src: entrySrc, ast: { t: 'Program', stmts: entryAst.stmts }, multi: false };

  const entryMod = { abs: entryAbs, label: entryLabel, prefix: '', isEntry: true, fns: new Map(), structs: new Map(), imports: new Set(entryAst.imports.map(i => i.mod)), aliases: new Map(entryAst.imports.map(i => [i.alias, i.mod])), stmts: entryAst.stmts };
  for (const s of entryAst.stmts) if (s.t === 'Fn' || s.t === 'Struct') setMod(s, entryMod);
  // which file each fn and lambda lives in: runtime call stacks name it
  for (const m of [entryMod, ...order]) {
    walk(m.stmts, (n) => { if (n.t === 'Fn' || n.t === 'Lambda') n.fileLabel = m.label; });
  }
  registerSources(combined, files);
  const ast = { t: 'Program', stmts: [...order.flatMap(m => m.stmts), ...entryAst.stmts] };
  Object.defineProperty(ast, 'modules', { value: [entryMod, ...order], enumerable: false });
  return { src: combined, ast, multi: true };
}

// Host for programs on disk (CLI, MCP with a path, compile-test). `base` is the folder that
// labels are relative to (default: the working directory).
export async function nodeHost(base) {
  const fs = await import('node:fs');
  const pathM = await import('node:path');
  const root = base ?? process.cwd();
  return {
    read: (abs) => fs.readFileSync(abs, 'utf8'),
    resolve: (from, rel) => pathM.resolve(pathM.dirname(from), rel),
    label: (abs) => {
      const r = pathM.relative(root, abs);
      return r && !r.startsWith('..') && !pathM.isAbsolute(r) ? r.split(pathM.sep).join('/') : abs;
    },
    siblings: (abs) => { try { return fs.readdirSync(pathM.dirname(abs)).filter(n => n.endsWith('.vow')); } catch { return []; } },
  };
}
