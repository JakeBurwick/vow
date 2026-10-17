const input = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const out: string[] = [];
const done = () => { if (out.length) console.log(out.join('\n')); };

function parseCsv(t: string): string[][] {
  if (t.startsWith('﻿')) t = t.slice(1);
  const recs: string[][] = [];
  let i = 0;
  const n = t.length;
  const eol = (k: number) => t[k] === '\n' || (t[k] === '\r' && t[k + 1] === '\n');
  while (i < n) {
    if (t[i] === '\n') { i++; continue; }
    if (t[i] === '\r' && t[i + 1] === '\n') { i += 2; continue; }
    const rec: string[] = [];
    while (true) {
      let f = '';
      if (t[i] === '"') {
        i++;
        while (i < n) {
          if (t[i] === '"') {
            if (t[i + 1] === '"') { f += '"'; i += 2; } else { i++; break; }
          } else f += t[i++];
        }
      } else {
        while (i < n && t[i] !== ',' && !eol(i)) f += t[i++];
      }
      rec.push(f);
      if (i < n && t[i] === ',') { i++; continue; }
      if (t[i] === '\r') i += 2; else if (t[i] === '\n') i++;
      break;
    }
    recs.push(rec);
  }
  return recs;
}
const trim = (s: string) => s.replace(/^[ \t]+|[ \t]+$/g, '');
function cmp(a: string, b: string): number {
  const A = Array.from(a, c => c.codePointAt(0)!), B = Array.from(b, c => c.codePointAt(0)!);
  for (let k = 0; k < Math.min(A.length, B.length); k++) if (A[k] !== B[k]) return A[k] - B[k];
  return A.length - B.length;
}
function header(rows: string[][], need: string[], empty: string): Record<string, number> | null {
  if (rows.length === 0) { out.push(empty); return null; }
  const h = rows[0].map(trim);
  if (need.some(k => !h.includes(k))) { out.push('error: header'); return null; }
  if (rows.length === 1) { out.push(empty); return null; }
  return Object.fromEntries(need.map(k => [k, h.indexOf(k)]));
}

function main() {
  const rows = parseCsv(input);
  const ix = header(rows, ['student', 'assignment', 'score'], 'no data');
  if (!ix) return;
  const width = rows[0].length;
  const scores = new Map<string, number[]>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const fail = () => { out.length = 0; out.push(`error: row ${r}`); };
    if (row.length !== width) return fail();
    const st = trim(row[ix.student]);
    if (st === '') return fail();
    if (!scores.has(st)) scores.set(st, []);
    const s = trim(row[ix.score]);
    if (['', 'n/a', 'nan', 'abs'].includes(s.replace(/[A-Z]/g, c => c.toLowerCase()))) continue;
    const m = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(s);
    if (!m) return fail();
    const h = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
    if (h > 10000) return fail();
    scores.get(st)!.push(h);
  }
  const tenths = (t: number) => `${Math.floor(t / 10)}.${t % 10}`;
  const all: number[] = [];
  const names = [...scores.keys()].sort(cmp);
  for (const st of names) {
    const l = scores.get(st)!;
    if (l.length === 0) { out.push(`${st} -`); continue; }
    const S = l.reduce((a, b) => a + b, 0), c = l.length;
    out.push(`${st} ${tenths(Math.floor((2 * S + 10 * c) / (20 * c)))}`);
    all.push(...l);
  }
  all.sort((a, b) => a - b);
  const m = all.length;
  if (m === 0) out.push('median -');
  else if (m % 2) out.push(`median ${tenths(Math.floor((all[(m - 1) / 2] + 5) / 10))}`);
  else out.push(`median ${tenths(Math.floor((all[m / 2 - 1] + all[m / 2] + 10) / 20))}`);
  // exact comparison of means: S1/c1 vs S2/c2 via cross-multiplication (integers)
  const ranked = names.filter(n => scores.get(n)!.length > 0).sort((a, b) => {
    const la = scores.get(a)!, lb = scores.get(b)!;
    const sa = la.reduce((x, y) => x + y, 0), sb = lb.reduce((x, y) => x + y, 0);
    const d = sb * la.length - sa * lb.length;
    return d !== 0 ? d : cmp(a, b);
  });
  out.push('top ' + (ranked.length ? ranked.slice(0, 3).join(', ') : '-'));
}
main();
done();
