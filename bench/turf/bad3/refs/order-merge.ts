// Order merge: orders, items and spend per customer, best-selling sku. Fails loudly on any record it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);
if (Deno.args.length < 1) fail("missing argument");
// deno-lint-ignore no-explicit-any
let data: any;
try {
  data = JSON.parse(Deno.args[0]);
} catch (e) {
  fail(`invalid JSON: ${(e as Error).message}`);
}
if (!isObj(data)) fail("expected a JSON object");
const orders = data.orders;
if (!Array.isArray(orders)) fail("missing orders list");
if (orders.length === 0) fail("no orders, there is no best sku");
const cust = new Map<string, [number, number, number]>();
const skus = new Map<string, number>();
// deno-lint-ignore no-explicit-any
orders.forEach((o: any, oi: number) => {
  const i = oi + 1;
  if (!isObj(o)) fail(`order ${i}: expected an object`);
  const c = o.customer;
  if (typeof c !== "string" || c === "") fail(`order ${i}: missing customer`);
  if (!Array.isArray(o.items)) fail(`order ${i}: missing items list`);
  let [k, q, s] = cust.get(c) ?? [0, 0, 0];
  k += 1;
  // deno-lint-ignore no-explicit-any
  o.items.forEach((it: any, ji: number) => {
    const j = ji + 1;
    if (!isObj(it)) fail(`order ${i} item ${j}: expected an object`);
    const { sku, qty, price } = it;
    if (typeof sku !== "string" || sku === "") fail(`order ${i} item ${j}: missing sku`);
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 0) fail(`order ${i} item ${j}: bad qty ${JSON.stringify(qty)}`);
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) fail(`order ${i} item ${j}: bad price ${JSON.stringify(price)}`);
    const cents = Math.round(price * 100);
    if (cents / 100 !== price) fail(`order ${i} item ${j}: price ${price} is not in whole cents`);
    q += qty;
    s += qty * cents;
    skus.set(sku, (skus.get(sku) ?? 0) + qty);
  });
  cust.set(c, [k, q, s]);
});
const money = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
for (const c of [...cust.keys()].sort(cmp)) {
  const [k, q, s] = cust.get(c)!;
  console.log(`${c} ${k} ${q} ${money(s)}`);
}
const best = [...skus.keys()].sort((a, b) => (skus.get(b)! - skus.get(a)!) || cmp(a, b))[0];
console.log(`best ${best} ${skus.get(best)}`);
