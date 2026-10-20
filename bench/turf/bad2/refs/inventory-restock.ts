// Inventory restock: skus at or below their reorder point, restock qty and cost. Fails loudly on any row it cannot read.
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
if (lines[0] !== "sku,name,on_hand,reorder_at,unit_cost") fail(`bad header: ${JSON.stringify(lines[0])}`);
const out: [string, bigint, bigint][] = [];
lines.slice(1).forEach((line, i) => {
  const n = i + 2;
  const f = line.split(",");
  if (f.length !== 5) fail(`line ${n}: expected 5 fields, got ${f.length}`);
  const [sku, , onHand, reorderAt, cost] = f;
  if (sku === "") fail(`line ${n}: missing sku`);
  if (!/^[0-9]+$/.test(onHand)) fail(`line ${n}: bad on_hand ${JSON.stringify(onHand)}`);
  if (!/^[0-9]+$/.test(reorderAt)) fail(`line ${n}: bad reorder_at ${JSON.stringify(reorderAt)}`);
  const m = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(cost);
  if (!m) fail(`line ${n}: bad unit_cost ${JSON.stringify(cost)}`);
  const cents = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
  const oh = BigInt(onHand), ra = BigInt(reorderAt);
  if (oh <= ra) {
    const qty = 2n * ra - oh;
    out.push([sku, qty, qty * cents]);
  }
});
const money = (c: bigint) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
out.sort((a, b) => cmp(a[0], b[0]));
for (const [sku, qty, c] of out) console.log(`${sku} ${qty} ${money(c)}`);
console.log(`total ${money(out.reduce((a, r) => a + r[2], 0n))}`);
console.log(`items ${out.length}`);
