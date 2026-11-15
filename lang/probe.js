// The bad-input probe, run by `vow test` after the test blocks pass.
//
// Agents write to the ticket's happy path; a ticket rarely says what to do with a row that
// reads `12a`, a missing JSON field, or an empty file, so the program prints a normal-looking
// answer built from a default and nobody finds out. The probe takes the inputs the program's
// own tests already pass to run(args, stdin), corrupts one thing at a time, reruns the program,
// and reports every corrupted copy that still got a normal answer.
//
// It is only possible because the checker proves which programs are pure: a program whose
// effect set is empty cannot touch the network, files or the environment, so running it on
// dozens of made-up inputs is safe with no setup. Programs with any effect are not probed.
//
// Two filters keep it from asking about things that do not matter:
//  - a corruption whose output equals the uncorrupted output is dropped (the program never
//    used that value, e.g. a bad price on a row it skips);
//  - an input that some test already runs is dropped (a test that expects a normal answer
//    for it is the program's author saying a normal answer is right).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const LOUD = /error|invalid|bad|malformed|missing|cannot|can't|failed|expected|unexpected|not a number/i;
const MAX_CORRUPTIONS = 40;
const CONCURRENCY = 6;
const TIMEOUT_MS = 8000;

// ---------- the inputs the tests already use ----------

// Only literal calls count: run(["a", "b"], "text"). Anything computed is skipped.
export function testInputs(ast) {
  const found = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n.t === 'Call' && n.callee === 'run' && n.args?.length === 2) {
      const [a, s] = n.args;
      if (a.t === 'ListLit' && a.items.every(i => i.t === 'Str') && s.t === 'Str') {
        found.push({ args: a.items.map(i => i.value), stdin: s.value });
      }
    }
    for (const k in n) if (k !== 'calleeNode' && k !== 'nameTok') visit(n[k]);
  };
  for (const st of ast.stmts) if (st.t === 'Test') visit(st.body);
  return found;
}

const key = (inp) => JSON.stringify([inp.args, inp.stdin]);

// ---------- corruptions ----------

const isNum = (s) => /^-?\d+(\.\d+)?$/.test(s.trim());
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
const isStamp = (s) => /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s.trim());
const UNIT = /^(-?\d+(?:\.\d+)?)([a-z%]+)$/i; // 120ms, 3kg, 45%

// JSON: walk the document, one representative per path shape (orders[*].items[*].qty once).
function jsonCorruptions(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { return null; }
  if (doc === null || typeof doc !== 'object') return null;
  const out = [];
  const seen = new Set();
  const add = (what, value) => out.push({ what, text: typeof value === 'string' ? value : JSON.stringify(value) });
  const clone = () => JSON.parse(text);
  // set the value at path (list of keys) inside a fresh copy; undefined deletes it
  const at = (path, v) => {
    const d = clone();
    let o = d;
    for (const k of path.slice(0, -1)) o = o[k];
    const last = path[path.length - 1];
    if (v === undefined) { if (Array.isArray(o)) o.splice(last, 1); else delete o[last]; }
    else o[last] = v;
    return d;
  };
  const show = (path) => path.map(k => typeof k === 'number' ? `[${k}]` : `.${k}`).join('').replace(/^\./, '');

  if (Array.isArray(doc)) add('the top level is an object, not a list', {});
  else add('the top level is a list, not an object', [doc]);
  add('the JSON is cut off halfway', text.slice(0, Math.max(1, Math.floor(text.length / 2))));

  const walk = (v, path) => {
    const shape = path.map(k => typeof k === 'number' ? '*' : k).join('.');
    if (path.length && !seen.has(shape)) {
      seen.add(shape);
      const name = show(path);
      const inObject = typeof path[path.length - 1] === 'string';
      if (inObject) add(`${name} is missing`, at(path, undefined));
      add(`${name} is null`, at(path, null));
      if (typeof v === 'number') {
        add(`${name} is the text "12a"`, at(path, '12a'));
        add(`${name} is true`, at(path, true));
      } else if (typeof v === 'string') {
        add(`${name} is a number`, at(path, 7));
        if (isNum(v)) add(`${name} is "12a"`, at(path, '12a'));
        if (isDate(v)) add(`${name} is the impossible date 2026-02-30`, at(path, '2026-02-30'));
      } else if (typeof v === 'boolean') {
        add(`${name} is the text "yes"`, at(path, 'yes'));
      } else if (Array.isArray(v)) {
        if (v.length) add(`${name} is an empty list`, at(path, []));
        add(`${name} is an object, not a list`, at(path, {}));
      } else if (v && typeof v === 'object') {
        add(`${name} is a list, not an object`, at(path, []));
      }
    }
    if (Array.isArray(v)) {
      if (v.length) {
        if (!seen.has(shape + '.*elem')) { seen.add(shape + '.*elem'); add(`an element of ${show(path) || 'the list'} is null`, at([...path, 0], null)); }
        walk(v[0], [...path, 0]);
      }
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) walk(v[k], [...path, k]);
    }
  };
  walk(doc, []);
  return out;
}

// Text: lines split into fields on commas (when most lines have one) or whitespace.
function textCorruptions(text) {
  const out = [];
  const add = (what, t) => out.push({ what, text: t });
  const nl = text.endsWith('\n');
  const lines = text.split('\n');
  if (nl) lines.pop();
  const join = (ls) => ls.join('\n') + (nl ? '\n' : '');
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) return out;

  add('the input is empty', '');
  const comma = nonEmpty.filter(l => l.includes(',')).length * 2 >= nonEmpty.length;
  const fieldsOf = (l) => comma ? l.split(',') : l.trim().split(/\s+/);
  const rebuild = (l, fs) => comma ? fs.join(',') : fs.join(' ');

  // a header is a first line with no number in it, above lines that have numbers
  const first = lines.findIndex(l => l.trim());
  const hasHeader = nonEmpty.length > 1 && !fieldsOf(lines[first]).some(isNum) && nonEmpty.slice(1).some(l => fieldsOf(l).some(isNum));
  if (hasHeader) add('only the header line, no data', join([lines[first]]));
  const dataIdx = lines.findIndex((l, i) => l.trim() && !(hasHeader && i === first));
  if (dataIdx < 0) return out;
  const row = fieldsOf(lines[dataIdx]);
  const lineNo = dataIdx + 1;
  const withRow = (fs) => { const ls = [...lines]; ls[dataIdx] = rebuild(lines[dataIdx], fs); return join(ls); };

  row.forEach((f, i) => {
    const where = `line ${lineNo}, field ${i + 1} ("${f.trim()}")`;
    const set = (v) => withRow(row.map((x, j) => j === i ? v : x));
    if (isNum(f)) {
      add(`${where} is "12a"`, set('12a'));
      add(`${where} is empty`, set(''));
      add(`${where} is "NaN"`, set('NaN'));
      add(`${where} is "Infinity"`, set('Infinity'));
      if (comma && /\./.test(f)) add(`${where} uses a decimal comma`, set(f.replace('.', ',')));
    } else if (isDate(f)) {
      add(`${where} is the impossible date 2026-02-30`, set('2026-02-30'));
      add(`${where} is written 04/01/2026`, set('04/01/2026'));
    } else if (isStamp(f)) {
      add(`${where} has the impossible date 2026-02-30`, set('2026-02-30' + f.trim().slice(10)));
    } else if (UNIT.test(f.trim())) {
      const u = f.trim().match(UNIT)[2];
      add(`${where} is "12a${u}"`, set('12a' + u));
      add(`${where} has no number, just "${u}"`, set(u));
    } else if (f.trim()) {
      add(`${where} is empty`, set(''));
    }
  });
  if (row.length > 1) add(`line ${lineNo} is missing its last field`, withRow(row.slice(0, -1)));
  add(`line ${lineNo} has an extra field`, withRow([...row, row[row.length - 1]]));
  return out;
}

// Every corruption of every slot of one input: each arg, then stdin.
function corruptionsOf(inp) {
  const out = [];
  const slots = [...inp.args.map((v, i) => ({ v, label: `argument ${i + 1}`, set: (t) => ({ args: inp.args.map((x, j) => j === i ? t : x), stdin: inp.stdin }) })),
    { v: inp.stdin, label: 'standard input', set: (t) => ({ args: inp.args, stdin: t }) }];
  for (const s of slots) {
    if (!s.v.trim()) continue;
    const cs = jsonCorruptions(s.v) ?? (s.v.includes('\n') || s.v.includes(',') ? textCorruptions(s.v) : []);
    // a single plain value in an arg (a number, a date, a word)
    if (!cs.length && !s.v.includes('\n')) {
      if (isNum(s.v)) cs.push({ what: `is "12a"`, text: '12a' }, { what: 'is empty', text: '' });
      else if (isDate(s.v)) cs.push({ what: 'is the impossible date 2026-02-30', text: '2026-02-30' });
    }
    for (const c of cs) out.push({ what: `${s.label}: ${c.what}`, input: s.set(c.text), slot: s.label });
  }
  return out;
}

// ---------- running ----------

function runOnce(file, inp) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, '--sandbox', file, ...inp.args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const t = setTimeout(() => { if (!done) { p.kill('SIGKILL'); } }, TIMEOUT_MS);
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', (code, signal) => { done = true; clearTimeout(t); resolve({ code: signal ? 124 : code, stdout, stderr }); });
    p.stdin.on('error', () => {});
    p.stdin.end(inp.stdin);
  });
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// A run is loud when it fails, writes to stderr, or prints an error-sounding line the
// uncorrupted run did not print (so a normal output line like "errors 1" does not count).
const failed = (r) => r.code !== 0 || r.stderr.trim() !== '';
const loud = (r, base) => {
  if (failed(r)) return true;
  const normal = new Set(base ? base.stdout.split('\n') : []);
  return r.stdout.split('\n').some(l => !normal.has(l) && LOUD.test(l));
};

// Returns { skipped: reason } or { tried, silent: [{ what, input, output }] }.
export async function probe(file, ast, effects) {
  if (effects.size) return { skipped: `this program uses ${[...effects.keys()].join(', ')}; the probe only runs programs that cannot reach the outside world` };
  const inputs = testInputs(ast);
  if (!inputs.length) return { noRun: true };
  const covered = new Set(inputs.map(key));

  // the base for corruption, per arg/stdin shape: the longest test input the program accepts
  // (an input it already rejects says nothing about bad input it lets through)
  const distinct = [...new Map(inputs.map(i => [key(i), i])).values()].slice(0, 12);
  const firstRuns = await pool(distinct, CONCURRENCY, (i) => runOnce(file, i));
  const size = (i) => i.args.join('').length + i.stdin.length;
  const byShape = new Map();
  distinct.forEach((inp, i) => {
    if (failed(firstRuns[i])) return;
    const shape = `${inp.args.length}:${inp.stdin ? 1 : 0}`;
    if (!byShape.has(shape) || size(inp) > size(byShape.get(shape).inp)) byShape.set(shape, { inp, run: firstRuns[i] });
  });
  const bases = [...byShape.values()];

  const jobs = [];
  const seenInputs = new Set();
  for (const b of bases) {
    for (const c of corruptionsOf(b.inp)) {
      const k = key(c.input);
      if (covered.has(k) || seenInputs.has(k)) continue;
      seenInputs.add(k);
      jobs.push({ ...c, base: b.run });
    }
  }
  const chosen = jobs.slice(0, MAX_CORRUPTIONS);
  const runs = await pool(chosen, CONCURRENCY, (j) => runOnce(file, j.input));
  const silent = [];
  chosen.forEach((j, i) => {
    const r = runs[i];
    if (loud(r, j.base)) return;
    if (r.stdout === j.base.stdout) return; // the corrupted value never mattered
    silent.push({ what: j.what, input: j.input, output: r.stdout });
  });
  return { tried: chosen.length, silent };
}

// ---------- the report ----------

const clip = (s, n = 70) => {
  const one = s.replace(/\n/g, '\\n');
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
};
const vowStr = (s) => JSON.stringify(s);

export function formatProbe(res) {
  if (res.skipped) return { text: `probe: skipped (${res.skipped})`, code: 0 };
  if (res.noRun) return { text: 'probe: no test runs the whole program, so bad input was not tried. Add a test per ticket example: expectEq(run(["arg"], "stdin text"), "expected output\\n")', code: 0 };
  if (!res.tried) return { text: '', code: 0 }; // the test inputs are empty: nothing to corrupt
  if (!res.silent.length) return { text: `probe: ${res.tried} corrupted ${res.tried === 1 ? 'copy' : 'copies'} of the test input, every one rejected ✓`, code: 0 };
  const n = res.silent.length;
  const lines = [`✗ probe: ${n} of ${res.tried} corrupted copies of the test input still printed a normal answer (exit 0, no error):`];
  for (const s of res.silent.slice(0, 12)) lines.push(`    • ${s.what}\n        printed: ${clip(s.output) || '(nothing)'}`);
  if (n > 12) lines.push(`    … and ${n - 12} more`);
  const size = (i) => i.args.join('').length + i.stdin.length;
  const ex = res.silent.map(x => x.input).sort((a, b) => size(a) - size(b))[0];
  lines.push(
    '  A normal-looking answer built from bad data hides the problem from whoever reads the output.',
    '  Likely fix: unless the ticket says what to print for input like this, stop with an error. Parse with a',
    '  function that returns a Result and use ? at the top level (it ends the program with "error: ..." and',
    '  exit 1), or eprint the reason and exit(1). For an empty list, there is no max, min, best or average.',
    '  If a normal answer really is right for one of these, add a test that expects it, e.g.',
    `    test "accepts this" { expectEq(run([${ex.args.map(vowStr).join(', ')}], ${vowStr(ex.stdin)}), "...") }`,
    '  and the probe stops asking about that input. Turn the probe off with: vow test --no-probe FILE',
  );
  return { text: lines.join('\n'), code: 1 };
}
