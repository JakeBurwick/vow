class Num { constructor(public src: string) {} }
type V = null | boolean | string | Num | V[] | Map<string, V>;

function load(text: string): V {
  // the reviver's context.source keeps every number exactly as written
  const raw = JSON.parse(text, function (_k, v, ctx?: { source?: string }) {
    return typeof v === 'number' ? new Num(ctx!.source!) : v;
  });
  const conv = (x: unknown): V => {
    if (x === null || typeof x === 'boolean' || typeof x === 'string' || x instanceof Num) return x as V;
    if (Array.isArray(x)) return x.map(conv);
    const m = new Map<string, V>();
    for (const k of Object.keys(x as object)) m.set(k, conv((x as Record<string, unknown>)[k]));
    return m;
  };
  return conv(raw);
}

function merge(b: Map<string, V>, o: Map<string, V>): Map<string, V> {
  const out = new Map(b);
  for (const [k, v] of o) {
    if (v === null) out.delete(k);
    else if (v instanceof Map) { const bv = out.get(k); out.set(k, merge(bv instanceof Map ? bv : new Map(), v)); }
    else out.set(k, v);
  }
  return out;
}

function num(src: string): string {
  if (!/[.eE]/.test(src)) return BigInt(src).toString();
  const n = Number(src);
  return Number.isInteger(n) ? BigInt(n).toString() : String(n);
}
function esc(s: string): string {
  return JSON.stringify(s);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
function dump(v: V): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return esc(v);
  if (v instanceof Num) return num(v.src);
  if (Array.isArray(v)) return '[' + v.map(dump).join(',') + ']';
  return '{' + [...v.keys()].sort(cmp).map((k) => esc(k) + ':' + dump(v.get(k)!)).join(',') + '}';
}

let base: V, over: V;
try { base = load(Deno.args[0]); over = load(Deno.args[1]); } catch { console.log('error: bad json'); Deno.exit(0); }
if (!(base instanceof Map) || !(over instanceof Map)) { console.log('error: not an object'); Deno.exit(0); }
console.log(dump(merge(base, over)));
