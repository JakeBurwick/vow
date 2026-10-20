// Sales report: revenue per region, total, mean units. Fails loudly on any row it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
if (!lines.length) fail("empty input, no header");
if (lines[0] !== "region,rep,units,unit_price") fail(`bad header: ${JSON.stringify(lines[0])}`);
const rows = lines.slice(1);
if (!rows.length) fail("no sales rows, mean units is undefined");
const byRegion = new Map<string, bigint>();
let unitsSum = 0n;
rows.forEach((line, i) => {
  const n = i + 2, f = line.split(",");
  if (f.length !== 4) fail(`line ${n}: expected 4 fields, got ${f.length}`);
  const [region, rep, units, price] = f;
  if (region === "" || rep === "") fail(`line ${n}: missing region or rep`);
  if (!/^[0-9]+$/.test(units)) fail(`line ${n}: bad units ${JSON.stringify(units)}`);
  const m = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(price);
  if (!m) fail(`line ${n}: bad unit_price ${JSON.stringify(price)}`);
  const cents = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
  byRegion.set(region, (byRegion.get(region) ?? 0n) + BigInt(units) * cents);
  unitsSum += BigInt(units);
});
const money = (c: bigint) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
let total = 0n;
for (const r of [...byRegion.keys()].sort(cmp)) {
  console.log(`${r} ${money(byRegion.get(r)!)}`);
  total += byRegion.get(r)!;
}
console.log(`total ${money(total)}`);
const k = BigInt(rows.length), t = (20n * unitsSum + k) / (2n * k);
console.log(`avg units ${t / 10n}.${t % 10n}`);
