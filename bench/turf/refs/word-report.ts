const arg = Deno.args[0] ?? '';
if (!/^[0-9]+$/.test(arg) || Number(arg) < 1 || Number(arg) > 1000) { console.log('error: bad n'); Deno.exit(0); }
const n = Number(arg);
const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await new Response(Deno.stdin.readable).arrayBuffer());
const chars = Array.from(text);
const isW = (c: string | undefined) => c !== undefined && /^[\p{L}\p{Nd}]$/u.test(c);
const isM = (c: string) => /^\p{M}$/u.test(c);
const counts = new Map<string, number>();
let i = 0;
while (i < chars.length) {
  if (!isW(chars[i])) { i++; continue; }
  let buf = '';
  while (i < chars.length) {
    const c = chars[i];
    if (isW(c) || isM(c)) { buf += c; i++; }
    else if ((c === "'" || c === '’') && isW(chars[i + 1])) { buf += "'"; i++; }
    else break;
  }
  const w = buf.normalize('NFC').toLowerCase();
  counts.set(w, (counts.get(w) ?? 0) + 1);
}
if (counts.size === 0) { console.log('no words'); Deno.exit(0); }
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) return x[k] - y[k];
  return x.length - y.length;
};
const top = [...counts].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, n);
const len = (s: string) => Array.from(s).length;
const width = Math.max(...top.map(([w]) => len(w)));
console.log(top.map(([w, c]) => w + ' '.repeat(width - len(w)) + ' ' + c).join('\n'));
