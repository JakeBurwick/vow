// Vow diagnostics — every error is written so a reader (human or LLM)
// can fix the bug from the message alone: what's wrong, where, likely fix.

export class VowError extends Error {
  constructor(diag) {
    super(diag.title);
    this.diag = diag; // {kind, title, line, col, length, detail, fix, notes}
  }
}

function offsetToLineCol(src, offset) {
  let line = 1, lineStart = 0;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') { line++; lineStart = i + 1; }
  }
  return { line, col: offset - lineStart + 1 };
}

// for "did you mean ...?" suggestions
export function editDistance(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

// Multi-file programs (lang/modules.js): every module's text sits in one combined source
// string at its own offset range, so node offsets stay plain numbers everywhere. A program
// registers its files here; nodeLoc then reports the file and the line within that file.
// Single-file programs never register, so their diagnostics are unchanged.
const PROGRAMS = new Map(); // combined src -> [{ start, end, label, text }] sorted by start
export function registerSources(src, files) {
  if (PROGRAMS.size > 50) PROGRAMS.delete(PROGRAMS.keys().next().value);
  PROGRAMS.set(src, files);
}
function fileAt(src, offset) {
  const files = PROGRAMS.get(src);
  if (!files) return null;
  let f = files[0];
  for (const x of files) if (x.start <= offset) f = x;
  return f;
}

// Build location fields (line/col/length, plus file/fileSrc in a multi-file program) from a
// node's start/end offsets.
export function nodeLoc(src, node) {
  const f = fileAt(src, node.start);
  if (f) {
    const loc = nodeLoc(f.text, { start: node.start - f.start, end: node.end - f.start });
    return { ...loc, file: f.label, fileSrc: f.text };
  }
  const { line, col } = offsetToLineCol(src, node.start);
  const lineEnd = src.indexOf('\n', node.start);
  const end = Math.min(node.end, lineEnd === -1 ? src.length : lineEnd);
  return { line, col, length: Math.max(1, end - node.start) };
}

// d.file / d.fileSrc: the error is in that file (a module, or the main file of a
// multi-file program); its line is shown from that file's text.
export function formatDiag(src, d) {
  const lines = (d.fileSrc ?? src).split('\n');
  const out = [];
  out.push(`✗ ${d.kind}: ${d.title}`);
  if (d.line != null) {
    out.push(`  → ${d.file ? `${d.file}, ` : ''}line ${d.line}${d.col != null ? `, col ${d.col}` : ''}`);
  } else if (d.file) {
    out.push(`  → ${d.file}`);
  }
  if (d.line != null) {
    const text = lines[d.line - 1];
    if (text != null) {
      const num = String(d.line);
      out.push(`  ${num} | ${text}`);
      const pad = ' '.repeat(num.length + 3 + Math.max(0, (d.col ?? 1) - 1));
      out.push(`  ${pad}${'^'.repeat(Math.max(1, Math.min(d.length ?? 1, text.length - (d.col ?? 1) + 1)))}`);
    }
  }
  if (d.detail) out.push('  ' + d.detail.split('\n').join('\n  '));
  if (d.fix) out.push(`  Likely fix: ${d.fix}`);
  if (d.notes) for (const n of d.notes) out.push('  ' + n);
  return out.join('\n');
}
