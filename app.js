import { parse } from './lang/parser.js';
import { check, BUILTIN_NAMES } from './lang/checker.js';
import { createRun } from './lang/interp.js';
import { formatDiag, VowError } from './lang/diagnostics.js';
import { KEYWORDS } from './lang/lexer.js';
import { EXAMPLES } from './examples.js';

const $ = (id) => document.getElementById(id);
const ta = $('code'), hl = $('highlight'), gutter = $('gutter-inner');
const outputEl = $('output'), varsEl = $('vars'), statusEl = $('status');

// ---------------- syntax highlighting ----------------

const BUILTINS = new Set(BUILTIN_NAMES);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlightCode(code) {
  let html = '';
  let i = 0;
  const push = (cls, text) => { html += `<span class="tok-${cls}">${esc(text)}</span>`; };
  while (i < code.length) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      let j = code.indexOf('\n', i);
      if (j === -1) j = code.length;
      push('comment', code.slice(i, j)); i = j; continue;
    }
    if (c === '`') { // raw string: no escapes, no interpolation, may span lines
      let j = code.indexOf('`', i + 1);
      j = j === -1 ? code.length : j + 1;
      // one span per line: the editor renders line by line, so a span must not cross a newline
      code.slice(i, j).split('\n').forEach((part, k) => { if (k) html += '\n'; if (part) push('str', part); });
      i = j; continue;
    }
    if (c === '"') {
      let j = i + 1, seg = i;
      const flush = (endIdx, cls) => { if (endIdx > seg) push(cls, code.slice(seg, endIdx)); seg = endIdx; };
      while (j < code.length && code[j] !== '"' && code[j] !== '\n') {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === '$' && code[j + 1] === '{') { // only ${ interpolates; a plain { is text
          flush(j, 'str');
          let depth = 0, k = j + 2;
          while (k < code.length && code[k] !== '\n') {
            const d = code[k];
            if (d === '"') { // a nested string inside the interpolation
              k++;
              while (k < code.length && code[k] !== '"' && code[k] !== '\n') { if (code[k] === '\\') k++; k++; }
            } else if (d === '{') depth++;
            else if (d === '}') { if (depth === 0) break; depth--; }
            k++;
          }
          if (k < code.length && code[k] === '}') k++;
          flush(k, 'interp');
          j = k;
          continue;
        }
        j++;
      }
      if (j < code.length && code[j] === '"') j++;
      flush(j, 'str');
      i = j; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < code.length && /[0-9.]/.test(code[j])) j++;
      push('num', code.slice(i, j)); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < code.length && /[A-Za-z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < code.length && code[k] === ' ') k++;
      if (word === 'true' || word === 'false') push('bool', word);
      else if (KEYWORDS.has(word)) push('kw', word);
      // `as` is only a keyword inside an import line
      else if (word === 'as' && /^\s*import\b/.test(code.slice(code.lastIndexOf('\n', i) + 1, i))) push('kw', word);
      else if (BUILTINS.has(word)) push('builtin', word);
      else if (code[k] === '(') push('call', word);
      else push('plain', word);
      i = j; continue;
    }
    if ('+-*/%<>=!,:(){}[]'.includes(c)) {
      let j = i;
      while (j < code.length && '+-*/%<>=!,:(){}[]'.includes(code[j])) j++;
      push('op', code.slice(i, j)); i = j; continue;
    }
    html += esc(c); i++;
  }
  return html;
}

let activeLine = null;
const breakpoints = new Set();
function renderEditor() {
  const lines = highlightCode(ta.value).split('\n');
  hl.innerHTML = lines.map((l, i) =>
    `<div class="cl${activeLine === i + 1 ? ' active' : ''}">${l || '&nbsp;'}</div>`).join('');
  gutter.innerHTML = lines.map((_, i) => {
    const cls = [activeLine === i + 1 ? 'active' : '', breakpoints.has(i + 1) ? 'bp' : ''].join(' ').trim();
    return `<div class="${cls}" title="click to toggle breakpoint">${i + 1}</div>`;
  }).join('');
  syncScroll();
}

gutter.addEventListener('click', (e) => {
  const div = e.target.closest('#gutter-inner > div');
  if (!div) return;
  const line = Array.prototype.indexOf.call(gutter.children, div) + 1;
  if (breakpoints.has(line)) breakpoints.delete(line);
  else breakpoints.add(line);
  renderEditor();
});
function syncScroll() {
  hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft;
  gutter.parentElement.scrollTop = ta.scrollTop;
}
ta.addEventListener('input', () => { activeLine = null; renderEditor(); });
ta.addEventListener('scroll', syncScroll);
ta.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const { selectionStart: s, selectionEnd: en } = ta;
    ta.setRangeText('  ', s, en, 'end');
    renderEditor();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doRun(); }
});

function setActiveLine(line) {
  activeLine = line;
  renderEditor();
  const lh = parseFloat(getComputedStyle(ta).lineHeight);
  const top = (line - 1) * lh;
  if (top < ta.scrollTop + 20) ta.scrollTop = Math.max(0, top - 60);
  else if (top > ta.scrollTop + ta.clientHeight - 40) ta.scrollTop = top - ta.clientHeight + 80;
  syncScroll();
}

// ---------------- output panel ----------------

let shownLines = 0;
const MAX_LINES = 1500;
function clearOutput() {
  outputEl.innerHTML = ''; shownLines = 0;
  varsEl.innerHTML = ''; $('vars-hint').hidden = false;
  setStatus('', '');
}
function appendLine(text) {
  shownLines++;
  if (shownLines === MAX_LINES + 1) {
    const d = document.createElement('div');
    d.className = 'out-line out-note';
    d.textContent = `(output truncated after ${MAX_LINES} lines)`;
    outputEl.appendChild(d);
  }
  if (shownLines > MAX_LINES) return;
  const d = document.createElement('div');
  d.className = 'out-line';
  d.textContent = text;
  outputEl.appendChild(d);
  outputEl.scrollTop = outputEl.scrollHeight;
}
function appendError(text, diag) {
  const d = document.createElement('div');
  d.className = 'out-error';
  const [first, ...rest] = text.split('\n');
  const b = document.createElement('span');
  b.className = 'first';
  b.textContent = first;
  d.appendChild(b);
  d.appendChild(document.createTextNode('\n' + rest.join('\n') + '\n'));
  if (diag) {
    const btn = document.createElement('button');
    btn.className = 'copy-ai';
    btn.textContent = 'Copy for AI (JSON)';
    btn.addEventListener('click', () => {
      const payload = JSON.stringify({ language: 'vow', diagnostic: diag, code: ta.value }, null, 2);
      navigator.clipboard.writeText(payload).then(() => {
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy for AI (JSON)'; }, 1500);
      });
    });
    d.appendChild(btn);
  }
  outputEl.appendChild(d);
  outputEl.scrollTop = outputEl.scrollHeight;
}
function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls;
}

// ---------------- compile / run ----------------

function compile() {
  const src = ta.value;
  try {
    const ast = parse(src, { noImports: {
      title: 'imports work in the Vow CLI; the playground runs one file',
      detail: 'The playground has no files around your program, so there is nothing to import from.',
      fix: 'paste the fns you need into this program, or save the files and run them with the CLI: vow main.vow',
    } });
    const { proved } = check(src, ast);
    return { src, ast, proved };
  } catch (e) {
    if (e instanceof VowError) {
      appendError(formatDiag(src, e.diag), e.diag);
      setStatus(`✗ ${e.diag.kind}${e.diag.line ? ' at line ' + e.diag.line : ''}`, 'bad');
      return null;
    }
    throw e;
  }
}

function doRun() {
  stopDebug(true);
  clearOutput();
  const c = compile();
  if (!c) return;
  if (breakpoints.size > 0) {
    session = createRun(c.src, c.ast, { out: appendLine });
    setDebugUI(true);
    doContinue();
    return;
  }
  const t0 = performance.now();
  const { gen, state } = createRun(c.src, c.ast, { out: appendLine });
  try {
    let r = gen.next();
    while (!r.done) r = gen.next();
    const ms = (performance.now() - t0).toFixed(1);
    const provedNote = c.proved > 0 ? `, ${c.proved} contract${c.proved === 1 ? '' : 's'} proven safe` : '';
    setStatus(`✓ finished in ${ms} ms, ${state.steps.toLocaleString()} steps${provedNote}`, 'ok');
    if (shownLines === 0) appendLine('(program produced no output)');
  } catch (e) {
    if (e?.vowExit) { if (e.exitMessage) appendError(e.exitMessage); setStatus(`${e.exitCode === 0 ? '✓' : '✗'} exited with code ${e.exitCode}`, e.exitCode === 0 ? 'ok' : 'bad'); return; }
    if (!(e instanceof VowError)) throw e;
    appendError(formatDiag(c.src, e.diag), e.diag);
    setStatus(`✗ ${e.diag.kind} at line ${e.diag.line}`, 'bad');
  }
}

// ---------------- debugger ----------------

let session = null;

function setDebugUI(on) {
  $('debug-controls').hidden = !on;
  $('btn-debug').hidden = on;
  ta.readOnly = on;
  $('vars-hint').hidden = on;
}

function startDebug() {
  clearOutput();
  const c = compile();
  if (!c) return;
  session = createRun(c.src, c.ast, { out: appendLine });
  setDebugUI(true);
  setStatus('debugging: press Step to advance', '');
  doStep();
}

function renderVars() {
  const frames = session.state.snapshot().reverse();
  varsEl.innerHTML = '';
  for (const f of frames) {
    const fd = document.createElement('div');
    fd.className = 'frame';
    const t = document.createElement('div');
    t.className = 'frame-title';
    t.textContent = `${f.name === '(top level)' ? f.name : 'fn ' + f.name + '()'}, line ${f.line}`;
    fd.appendChild(t);
    if (f.vars.length === 0) {
      const n = document.createElement('div');
      n.className = 'no-vars';
      n.textContent = 'no variables yet';
      fd.appendChild(n);
    }
    for (const v of f.vars) {
      const row = document.createElement('div');
      row.className = 'var-row';
      const name = document.createElement('span');
      name.className = 'var-name';
      name.textContent = v.name;
      const val = document.createElement('span');
      val.className = 'var-val';
      val.textContent = v.value;
      row.append(name, val);
      fd.appendChild(row);
    }
    varsEl.appendChild(fd);
  }
}

function finishDebug(msg, cls) {
  session = null;
  activeLine = null;
  renderEditor();
  setDebugUI(false);
  if (msg) setStatus(msg, cls);
}

function doStep() {
  if (!session) return;
  try {
    const r = session.gen.next();
    if (r.done) {
      finishDebug(`✓ finished, ${shownLines} line${shownLines === 1 ? '' : 's'} of output`, 'ok');
      return;
    }
    setActiveLine(r.value.line);
    renderVars();
    setStatus(`paused at line ${r.value.line}`, '');
  } catch (e) {
    if (!(e instanceof VowError)) throw e;
    appendError(formatDiag(ta.value, e.diag), e.diag);
    finishDebug(`✗ ${e.diag.kind} at line ${e.diag.line}`, 'bad');
  }
}

function doContinue() {
  if (!session) return;
  try {
    let r = session.gen.next();
    while (!r.done && !breakpoints.has(r.value.line)) r = session.gen.next();
    if (r.done) {
      finishDebug('✓ finished', 'ok');
      return;
    }
    setActiveLine(r.value.line);
    renderVars();
    setStatus(`paused at breakpoint, line ${r.value.line}`, '');
  } catch (e) {
    if (!(e instanceof VowError)) throw e;
    appendError(formatDiag(ta.value, e.diag), e.diag);
    finishDebug(`✗ ${e.diag.kind} at line ${e.diag.line}`, 'bad');
  }
}

function stopDebug(silent) {
  if (!session) return;
  session = null;
  activeLine = null;
  renderEditor();
  setDebugUI(false);
  if (!silent) setStatus('debugging stopped', '');
}

$('btn-run').addEventListener('click', doRun);
$('btn-share').addEventListener('click', () => {
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(ta.value)));
  const url = location.origin + location.pathname + '#code=' + encodeURIComponent(encoded);
  navigator.clipboard.writeText(url).then(
    () => setStatus('share link copied', 'ok'),
    () => setStatus('could not copy: the browser blocked clipboard access', 'bad'),
  );
});
$('btn-debug').addEventListener('click', startDebug);
$('btn-step').addEventListener('click', doStep);
$('btn-continue').addEventListener('click', doContinue);
$('btn-stop').addEventListener('click', () => stopDebug(false));

// ---------------- examples + tabs ----------------

const sel = $('examples');
const customOpt = document.createElement('option');
customOpt.value = '';
customOpt.hidden = true;
sel.appendChild(customOpt);
for (const ex of EXAMPLES) {
  const o = document.createElement('option');
  o.value = ex.id;
  o.textContent = ex.name;
  sel.appendChild(o);
}
function loadCode(code) {
  stopDebug(true);
  ta.value = code;
  activeLine = null;
  clearOutput();
  renderEditor();
  ta.scrollTop = 0;
}
sel.addEventListener('change', () => {
  const ex = EXAMPLES.find(x => x.id === sel.value);
  if (ex) loadCode(ex.code);
});

// Other tabs (Learn, Home) load code here through this small API.
window.vowPlayground = {
  load(code, { run = false, label = 'Your code' } = {}) {
    customOpt.textContent = label;
    sel.value = '';
    loadCode(code);
    if (run) doRun();
  },
};

// Highlight the static code samples on Home and Docs, and the lessons.
window.vowHighlight = highlightCode;
document.querySelectorAll('pre.codeblock.vow').forEach((pre) => { pre.innerHTML = highlightCode(pre.textContent); });
if (window.vowLearn) window.vowLearn.rerender();
$('btn-run-sample').addEventListener('click', () => {
  window.vowPlayground.load($('home-sample').textContent, { run: true, label: 'prices.vow' });
  showView('play');
});

// Tab switching lives in an inline script in index.html, so it works even if this module fails to load.

// boot
function codeFromHash() {
  if (!location.hash.startsWith('#code=')) return null;
  try {
    const bin = atob(decodeURIComponent(location.hash.slice(6)));
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  } catch {
    return null;
  }
}
const shared = codeFromHash();
if (shared !== null) {
  customOpt.textContent = 'Shared code';
  sel.value = '';
  ta.value = shared;
  setStatus('loaded code from a share link', '');
} else {
  ta.value = EXAMPLES[0].code;
  sel.value = EXAMPLES[0].id;
}
renderEditor();
window.__vowReady = true;
