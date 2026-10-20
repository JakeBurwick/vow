// Payroll: pay per employee rounded to the cent, totals and headcount per dept, top earner. Fails loudly on any row it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const hundredths = (s: string): bigint | null => {
  const m = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(s);
  return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0")) : null;
};
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
if (!lines.length) fail("empty input, no header");
if (lines[0] !== "employee,dept,hours,rate") fail(`bad header: ${JSON.stringify(lines[0])}`);
const rows: [string, string, bigint][] = [];
lines.slice(1).forEach((line, i) => {
  const n = i + 2;
  const f = line.split(",");
  if (f.length !== 4) fail(`line ${n}: expected 4 fields, got ${f.length}`);
  const [emp, dept, hours, rate] = f;
  if (emp === "") fail(`line ${n}: missing employee`);
  if (dept === "") fail(`line ${n}: missing dept`);
  const h = hundredths(hours);
  if (h === null) fail(`line ${n}: bad hours ${JSON.stringify(hours)}`);
  const r = hundredths(rate);
  if (r === null) fail(`line ${n}: bad rate ${JSON.stringify(rate)}`);
  rows.push([emp, dept, (h * r + 50n) / 100n]);
});
if (!rows.length) fail("no employees, there is no top earner");
const money = (c: bigint) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
const depts = new Map<string, [bigint, number]>();
for (const [, dept, pay] of rows) {
  const [t, k] = depts.get(dept) ?? [0n, 0];
  depts.set(dept, [t + pay, k + 1]);
}
for (const dept of [...depts.keys()].sort(cmp)) {
  const [t, k] = depts.get(dept)!;
  console.log(`${dept} ${money(t)} ${k}`);
}
console.log(`total ${money(rows.reduce((a, r) => a + r[2], 0n))}`);
const top = [...rows].sort((a, b) => (a[2] !== b[2] ? (b[2] > a[2] ? 1 : -1) : cmp(a[0], b[0])))[0];
console.log(`top ${top[0]}`);
