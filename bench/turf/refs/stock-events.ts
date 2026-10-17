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
const out = (s: string) => console.log(s);
function main() {
  let data: unknown;
  try {
    data = JSON.parse(Deno.args[0], (_k, v, ctx: any) => typeof v === "number" ? new JNum(ctx.source) : v);
  } catch { out("error: bad json"); return; }
  if (!Array.isArray(data)) { out("error: bad json"); return; }
  const order: string[] = [];
  const state = new Map<string, { qty: bigint; cents: bigint | null }>();
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  for (let i = 0; i < data.length; i++) {
    const n = i + 1;
    const e = data[i];
    const bad = () => out(`error: bad event ${n}`);
    const rej = () => out(`error: rejected event ${n}`);
    if (typeof e !== "object" || e === null || Array.isArray(e) || e instanceof JNum) return bad();
    const r = e as Record<string, unknown>;
    const t = own(r, "type") ? r.type : undefined;
    if (typeof t !== "string") return bad();
    if (!["add", "remove", "rename", "price"].includes(t)) return out(`error: unknown event ${n}`);
    const str = (k: string) => { const v = own(r, k) ? r[k] : undefined; return typeof v === "string" && v !== "" ? v : null; };
    const sku = str("sku");
    if (sku === null) return bad();
    if (t === "add" || t === "remove") {
      const qv = own(r, "qty") ? r.qty : undefined;
      if (!(qv instanceof JNum)) return bad();
      const q = dec(qv.raw);
      if (q.s !== 0 || q.m < 1n) return bad();
      const cur = state.get(sku);
      if (t === "add") {
        if (!cur) { state.set(sku, { qty: q.m, cents: null }); order.push(sku); }
        else cur.qty += q.m;
      } else {
        if (!cur || cur.qty < q.m) return rej();
        cur.qty -= q.m;
      }
    } else if (t === "rename") {
      const to = str("to");
      if (to === null) return bad();
      if (!state.has(sku) || state.has(to)) return rej();
      order[order.indexOf(sku)] = to;
      state.set(to, state.get(sku)!);
      state.delete(sku);
    } else {
      if (!own(r, "price")) return bad();
      const pv = r.price;
      let cents: bigint | null = null;
      if (pv !== null) {
        if (!(pv instanceof JNum)) return bad();
        const p = dec(pv.raw);
        if (p.s > 2 || p.m < 0n) return bad();
        cents = p.m * 10n ** BigInt(2 - p.s);
        if (cents > 100000000n) return bad();
      }
      const cur = state.get(sku);
      if (!cur) return rej();
      cur.cents = cents;
    }
  }
  const fmtPrice = (c: bigint) => {
    const w = c / 100n, f = c % 100n;
    if (f === 0n) return w.toString();
    return `${w}.${f.toString().padStart(2, "0").replace(/0$/, "")}`;
  };
  const parts = order.map((s) => {
    const v = state.get(s)!;
    return `${JSON.stringify(s)}:{"qty":${v.qty},"price":${v.cents === null ? "null" : fmtPrice(v.cents)}}`;
  });
  out(`{${parts.join(",")}}`);
  const ps = order.map((s) => state.get(s)!.cents).filter((c): c is bigint => c !== null);
  if (ps.length === 0) { out("avg price none"); return; }
  const sum = ps.reduce((a, b) => a + b, 0n);
  const cnt = BigInt(ps.length);
  const avg = (2n * sum + cnt) / (2n * cnt); // half-up, non-negative
  out(`avg price ${avg / 100n}.${(avg % 100n).toString().padStart(2, "0")}`);
}
main();
