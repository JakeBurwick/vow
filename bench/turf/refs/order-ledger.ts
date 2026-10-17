class JNum { constructor(public raw: string) {} }
type Dec = { m: bigint; s: number };
function dec(raw: string): Dec {
  const g = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw)!;
  const frac = g[3] ?? "";
  let m = BigInt(g[2] + frac);
  let s = frac.length - Number(g[4] ?? "0");
  if (s < 0) { m *= 10n ** BigInt(-s); s = 0; }
  if (g[1] === "-") m = -m;
  while (s > 0 && m % 10n === 0n) { m /= 10n; s--; }
  return { m, s };
}
const at = (d: Dec, s: number) => d.m * 10n ** BigInt(s - d.s); // requires s >= d.s
const out = (s: string) => console.log(s);
function realDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const y = +d.slice(0, 4), mo = +d.slice(5, 7), da = +d.slice(8, 10);
  if (mo < 1 || mo > 12 || da < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return da <= dim && y >= 1;
}
function main() {
  let data: unknown;
  try {
    data = JSON.parse(Deno.args[0], (_k, v, ctx: any) => typeof v === "number" ? new JNum(ctx.source) : v);
  } catch { out("error: bad json"); return; }
  if (!Array.isArray(data)) { out("error: bad json"); return; }
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  function check(o: unknown): [string, string, bigint] | null {
    if (typeof o !== "object" || o === null || Array.isArray(o) || o instanceof JNum) return null;
    const r = o as Record<string, unknown>;
    if (!own(r, "id")) return null;
    const id = r.id;
    let key: string;
    if (id instanceof JNum) {
      if (!/^-?\d+$/.test(id.raw)) return null;
      const b = BigInt(id.raw);
      if (b < 0n) return null;
      key = b.toString();
    } else if (typeof id === "string" && /^[0-9]+$/.test(id)) key = BigInt(id).toString();
    else return null;
    const date = own(r, "date") ? r.date : undefined;
    if (typeof date !== "string" || !realDate(date)) return null;
    if (!own(r, "price")) return null;
    let p: Dec;
    if (typeof r.price === "string") {
      if (!/^[0-9]+(\.[0-9]{1,3})?$/.test(r.price)) return null;
      p = dec(r.price);
    } else if (r.price instanceof JNum) p = dec(r.price.raw);
    else return null;
    if (p.m < 0n || p.s > 3 || at(p, 3) >= 100000000n) return null;
    if (!own(r, "qty") || !(r.qty instanceof JNum)) return null;
    const q = dec(r.qty.raw);
    if (q.s !== 0 || q.m < 1n || q.m > 1000n) return null;
    let d100 = 0n;
    const dv = own(r, "discount") ? r.discount : null;
    if (dv !== null) {
      if (!(dv instanceof JNum)) return null;
      const d = dec(dv.raw);
      if (d.s > 2) return null;
      d100 = at(d, 2);
      if (d100 < 0n || d100 > 100n) return null;
    }
    const exact = at(p, 3) * q.m * (100n - d100); // scale 1e5
    const cents = (exact + 500n) / 1000n;
    return [key, date, cents];
  }
  const rows: [string, string, bigint][] = [];
  for (let i = 0; i < data.length; i++) {
    const r = check(data[i]);
    if (!r) { out(`error: bad order ${i + 1}`); return; }
    rows.push(r);
  }
  const seen = new Set<string>();
  const days = new Map<string, bigint>();
  for (const [k, d, c] of rows) {
    if (seen.has(k)) continue;
    seen.add(k);
    days.set(d, (days.get(d) ?? 0n) + c);
  }
  const fmt = (c: bigint) => `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;
  let total = 0n;
  for (const d of [...days.keys()].sort()) { out(`${d} ${fmt(days.get(d)!)}`); total += days.get(d)!; }
  out(`orders ${seen.size}`);
  out(`total ${fmt(total)}`);
}
main();
