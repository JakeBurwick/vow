// Auction results: bids and outcome per lot, revenue, busiest bidder. Fails loudly on any record it cannot read.
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
const money = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const cents = (v: unknown, where: string) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) fail(`${where}: bad amount ${JSON.stringify(v)}`);
  const c = Math.round(v * 100);
  if (Math.abs(v * 100 - c) > 1e-6) fail(`${where}: amount ${v} has more than 2 decimals`);
  return c;
};
if (Deno.args.length < 1) fail("missing argument");
// deno-lint-ignore no-explicit-any
let data: any;
try {
  data = JSON.parse(Deno.args[0]);
} catch (e) {
  fail(`invalid JSON: ${(e as Error).message}`);
}
if (!isObj(data)) fail("expected a JSON object");
const lots = data.lots;
if (!Array.isArray(lots)) fail("missing lots list");
const out: string[] = [];
const counts = new Map<string, number>();
let revenue = 0;
// deno-lint-ignore no-explicit-any
lots.forEach((lot: any, li: number) => {
  const i = li + 1;
  if (!isObj(lot)) fail(`lot ${i}: expected an object`);
  if (typeof lot.lot !== "string") fail(`lot ${i}: missing lot id`);
  if (!("reserve" in lot)) fail(`lot ${i}: missing reserve`);
  const reserve = cents(lot.reserve, `lot ${i} reserve`);
  if (!Array.isArray(lot.bids)) fail(`lot ${i}: missing bids list`);
  let last: [string, number] | null = null;
  // deno-lint-ignore no-explicit-any
  lot.bids.forEach((b: any, bi: number) => {
    const j = bi + 1;
    if (!isObj(b)) fail(`lot ${i} bid ${j}: expected an object`);
    if (typeof b.bidder !== "string" || b.bidder === "") fail(`lot ${i} bid ${j}: missing bidder`);
    if (!("amount" in b)) fail(`lot ${i} bid ${j}: missing amount`);
    const a = cents(b.amount, `lot ${i} bid ${j}`);
    if (last !== null && a <= last[1]) fail(`lot ${i} bid ${j}: bid is not higher than the bid before it`);
    last = [b.bidder, a];
    counts.set(b.bidder, (counts.get(b.bidder) ?? 0) + 1);
  });
  const w = last as [string, number] | null;
  if (w !== null && w[1] >= reserve) {
    revenue += w[1];
    out.push(`${lot.lot} ${lot.bids.length} sold ${w[0]} ${money(w[1])}`);
  } else {
    out.push(`${lot.lot} ${lot.bids.length} unsold`);
  }
});
if (!counts.size) fail("no bids, there is no busiest bidder");
out.push(`revenue ${money(revenue)}`);
const top = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || cmp(a, b))[0];
out.push(`busiest ${top} ${counts.get(top)}`);
console.log(out.join("\n"));
