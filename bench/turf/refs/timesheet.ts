const TS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/;
function parse(s: string): number | null {
  const m = TS.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map((x) => Number(x ?? 0));
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || se > 59) return null;
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  let off = 0;
  const z = m[7];
  if (z && z !== 'Z') {
    const oh = Number(z.slice(1, 3)), om = Number(z.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    off = (z[0] === '-' ? -1 : 1) * (oh * 60 + om) * 60;
  }
  const t = Date.UTC(0, mo - 1, d, h, mi, se) / 1000;
  // Date.UTC maps years 0-99 to 1900+; set the year separately
  const dt = new Date(t * 1000); dt.setUTCFullYear(y);
  return dt.getTime() / 1000 - off;
}
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const rows = text.split('\n');
if (rows.length && rows[rows.length - 1] === '') rows.pop();
const shifts = new Map<string, [number, number][]>();
for (let i = 0; i < rows.length; i++) {
  let line = rows[i];
  if (line.endsWith('\r')) line = line.slice(0, -1);
  if (/^[ \t]*$/.test(line)) continue;
  const parts = line.split(',').map((p) => p.replace(/^[ \t]+|[ \t]+$/g, ''));
  let a: number | null = null, b: number | null = null;
  let ok = parts.length === 3 && parts[0] !== '';
  if (ok) { a = parse(parts[1]); b = parse(parts[2]); ok = a !== null && b !== null && b > a; }
  if (!ok) { console.log(`error: line ${i + 1}`); Deno.exit(0); }
  if (!shifts.has(parts[0])) shifts.set(parts[0], []);
  shifts.get(parts[0])!.push([a!, b!]);
}
function covered(iv: [number, number][]): number {
  iv.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let tot = 0, cs = -Infinity, ce = -Infinity, open = false;
  for (const [s, e] of iv) {
    if (!open || s > ce) { if (open) tot += ce - cs; cs = s; ce = e; open = true; }
    else ce = Math.max(ce, e);
  }
  return open ? tot + ce - cs : 0;
}
const hm = (sec: number) => { const m = Math.floor(sec / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
let grand = 0;
const out: string[] = [];
for (const name of [...shifts.keys()].sort(cmp)) { const s = covered(shifts.get(name)!); grand += s; out.push(`${name} ${hm(s)}`); }
out.push(`total ${hm(grand)}`);
console.log(out.join('\n'));
