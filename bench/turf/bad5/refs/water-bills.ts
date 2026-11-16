// Water bills: accounts, usage and billed amount per zone, total, highest usage. Fails loudly on any row it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const bill = (u: number) => 350 + 120 * Math.min(u, 10) + 205 * Math.max(u - 10, 0);
const money = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
if (!lines.length) fail("empty input, no header");
if (lines[0] !== "account,zone,previous,current") fail(`bad header: ${JSON.stringify(lines[0])}`);
type Row = { acct: string; zone: string; u: number; c: number };
const rows: Row[] = [];
const seen = new Set<string>();
lines.slice(1).forEach((line, i) => {
  const n = i + 2;
  const f = line.split(",");
  if (f.length !== 4) fail(`line ${n}: expected 4 fields, got ${f.length}`);
  const [acct, zone, prev, cur] = f;
  if (acct === "") fail(`line ${n}: missing account`);
  if (zone === "") fail(`line ${n}: missing zone`);
  for (const [name, v] of [["previous", prev], ["current", cur]]) {
    if (!/^[0-9]+$/.test(v)) fail(`line ${n}: bad ${name} reading ${JSON.stringify(v)}`);
  }
  const u = Number(cur) - Number(prev);
  if (u < 0) fail(`line ${n}: current reading ${cur} is below the previous reading ${prev}`);
  if (seen.has(acct)) fail(`line ${n}: account ${acct} appears twice`);
  seen.add(acct);
  rows.push({ acct, zone, u, c: bill(u) });
});
if (!rows.length) fail("no accounts, there is no highest usage");
const per = new Map<string, [number, number, number]>();
for (const r of rows) {
  const [k, t, b] = per.get(r.zone) ?? [0, 0, 0];
  per.set(r.zone, [k + 1, t + r.u, b + r.c]);
}
const out: string[] = [];
for (const z of [...per.keys()].sort(cmp)) {
  const [k, t, b] = per.get(z)!;
  out.push(`${z} ${k} ${t} ${money(b)}`);
}
out.push(`total ${money(rows.reduce((a, r) => a + r.c, 0))}`);
const top = [...rows].sort((a, b) => (b.u - a.u) || cmp(a.acct, b.acct))[0];
out.push(`highest ${top.acct} ${top.u}`);
console.log(out.join("\n"));
