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
function cmp(a: Dec, b: Dec): number {
  const s = Math.max(a.s, b.s);
  const x = a.m * 10n ** BigInt(s - a.s), y = b.m * 10n ** BigInt(s - b.s);
  return x < y ? -1 : x > y ? 1 : 0;
}
function fmt(d: Dec): string {
  if (d.m === 0n) return "0";
  const neg = d.m < 0n;
  let digits = (neg ? -d.m : d.m).toString();
  if (d.s > 0) {
    digits = digits.padStart(d.s + 1, "0");
    digits = digits.slice(0, digits.length - d.s) + "." + digits.slice(digits.length - d.s);
  }
  return (neg ? "-" : "") + digits;
}
// code point comparison (JS < compares UTF-16 units)
function cpCmp(a: string, b: string): number {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const c = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (c !== 0) return c;
  }
  return x.length - y.length;
}
const out = (s: string) => console.log(s);
function main() {
  const files: Record<string, unknown>[] = [];
  for (const a of Deno.args.slice(0, 2)) {
    let j: unknown;
    try {
      j = JSON.parse(a, (_k, v, ctx: any) => typeof v === "number" ? new JNum(ctx.source) : v);
    } catch { out("error: bad json"); return; }
    if (typeof j !== "object" || j === null || Array.isArray(j) || j instanceof JNum) { out("error: bad json"); return; }
    files.push(j as Record<string, unknown>);
  }
  const bad: string[] = [];
  for (const f of files) {
    for (const name of Object.keys(f)) {
      const v = f[name];
      if (v === null || v instanceof JNum) continue;
      if (typeof v === "string" && /^-?[0-9]+(\.[0-9]+)?$/.test(v)) continue;
      bad.push(name);
    }
  }
  if (bad.length) { out(`error: bad score ${bad.sort(cpCmp)[0]}`); return; }
  const best = new Map<string, Dec | null>();
  for (const f of files) {
    for (const name of Object.keys(f)) {
      const v = f[name];
      let sc: Dec | null;
      if (v === null) sc = null;
      else if (v instanceof JNum) sc = dec(v.raw);
      else if (typeof v === "string" && /^-?[0-9]+(\.[0-9]+)?$/.test(v)) sc = dec(v);
      else { out(`error: bad score ${name}`); return; }
      if (!best.has(name)) best.set(name, null);
      const cur = best.get(name)!;
      if (sc !== null && (cur === null || cmp(sc, cur) > 0)) best.set(name, sc);
    }
  }
  const nArg = Deno.args[2];
  if (!/^[0-9]+$/.test(nArg) || BigInt(nArg) < 1n) { out("error: bad n"); return; }
  const n = Number(BigInt(nArg) > 1000000n ? 1000000n : BigInt(nArg));
  const ranked = [...best].filter((e): e is [string, Dec] => e[1] !== null);
  ranked.sort((a, b) => cmp(b[1], a[1]) || cpCmp(a[0], b[0]));
  let rank = 0;
  for (let i = 0; i < ranked.length && i < n; i++) {
    if (i === 0 || cmp(ranked[i][1], ranked[i - 1][1]) !== 0) rank = i + 1;
    out(`${rank}. ${ranked[i][0]} ${fmt(ranked[i][1])}`);
  }
}
main();
