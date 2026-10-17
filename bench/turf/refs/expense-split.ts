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
  const ix = header(rows, ['payer', 'amount', 'participants'], 'no expenses');
  if (!ix) return;
  const width = rows[0].length;
  const net = new Map<string, number>();
  const add = (k: string, v: number) => net.set(k, (net.get(k) ?? 0) + v);
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const fail = () => { out.length = 0; out.push(`error: row ${r}`); };
    if (row.length !== width) return fail();
    const payer = trim(row[ix.payer]);
    const m = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(trim(row[ix.amount]));
    const parts = row[ix.participants].split(';').map(trim);
    if (payer === '' || !m || parts.some(p => p === '') || new Set(parts).size !== parts.length) return fail();
    const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
    if (cents <= 0) return fail();
    add(payer, cents);
    const k = parts.length, base = Math.floor(cents / k), rem = cents % k;
    [...parts].sort(cmp).forEach((p, i) => add(p, -(base + (i < rem ? 1 : 0))));
  }
  for (const name of [...net.keys()].sort(cmp)) {
    const v = net.get(name)!, a = Math.abs(v);
    out.push(`${name} ${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`);
  }
}
main();
done();
