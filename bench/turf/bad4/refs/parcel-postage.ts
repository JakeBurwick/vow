// Parcel postage: parcels, weight and postage per destination, total, heaviest parcel. Fails loudly on any row it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
function grams(s: string): number | null {
  const m = /^([0-9]+)(?:\.([0-9]{1,3}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
}
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
if (!lines.length) fail("empty input, no header");
if (lines[0] !== "parcel,dest,weight") fail(`bad header: ${JSON.stringify(lines[0])}`);
const rows: { parcel: string; dest: string; g: number; cost: number }[] = [];
lines.slice(1).forEach((line, i) => {
  const n = i + 2;
  const f = line.split(",");
  if (f.length !== 3) fail(`line ${n}: expected 3 fields, got ${f.length}`);
  const [parcel, dest, weight] = f;
  if (parcel === "") fail(`line ${n}: missing parcel id`);
  if (dest === "") fail(`line ${n}: missing dest`);
  const g = grams(weight);
  if (g === null) fail(`line ${n}: bad weight ${JSON.stringify(weight)}`);
  rows.push({ parcel, dest, g, cost: 400 + 150 * Math.ceil(g / 1000) });
});
if (!rows.length) fail("no parcels, there is no heaviest parcel");
const money = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const kilos = (g: number) => `${Math.floor(g / 1000)}.${String(g % 1000).padStart(3, "0")}`;
const dests = new Map<string, [number, number, number]>();
for (const r of rows) {
  const [k, w, c] = dests.get(r.dest) ?? [0, 0, 0];
  dests.set(r.dest, [k + 1, w + r.g, c + r.cost]);
}
for (const d of [...dests.keys()].sort(cmp)) {
  const [k, w, c] = dests.get(d)!;
  console.log(`${d} ${k} ${kilos(w)} ${money(c)}`);
}
console.log(`total ${money(rows.reduce((a, r) => a + r.cost, 0))}`);
console.log(`heaviest ${[...rows].sort((a, b) => (b.g - a.g) || cmp(a.parcel, b.parcel))[0].parcel}`);
