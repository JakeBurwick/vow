// Trip log: km per day from odometer start/end pairs, total, longest day. Fails loudly on any line it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const days = new Map<string, number>();
let open: { date: string; tenths: number; n: number } | null = null;
text.split("\n").forEach((line, i) => {
  const n = i + 1;
  if (line === "") return;
  const f = line.split(" ");
  if (f.length !== 4) fail(`line ${n}: expected 4 fields, got ${f.length}`);
  const [date, time, event, odo] = f;
  const dm = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(date);
  if (!dm) fail(`line ${n}: bad date ${JSON.stringify(date)}`);
  const [y, mo, d] = [+dm[1], +dm[2], +dm[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) fail(`line ${n}: invalid date ${date}`);
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) fail(`line ${n}: bad time ${JSON.stringify(time)}`);
  const om = /^([0-9]+)(?:\.([0-9]))?$/.exec(odo);
  if (!om) fail(`line ${n}: bad odometer ${JSON.stringify(odo)}`);
  const tenths = Number(om[1]) * 10 + Number(om[2] ?? "0");
  if (event === "start") {
    if (open) fail(`line ${n}: start while the trip from line ${open.n} has no end`);
    open = { date, tenths, n };
  } else if (event === "end") {
    const o = open as { date: string; tenths: number; n: number } | null;
    if (!o) fail(`line ${n}: end without a start`);
    if (o.date !== date) fail(`line ${n}: end on ${date} for a start on ${o.date}`);
    if (tenths < o.tenths) fail(`line ${n}: end odometer ${odo} is below the start`);
    days.set(date, (days.get(date) ?? 0) + tenths - o.tenths);
    open = null;
  } else fail(`line ${n}: bad event ${JSON.stringify(event)}`);
});
if (open) fail(`line ${(open as { n: number }).n}: start has no end`);
if (days.size === 0) fail("no trips, there is no longest day");
const km = (t: number) => `${Math.floor(t / 10)}.${t % 10}`;
const dates = [...days.keys()].sort();
let best = dates[0], total = 0;
for (const d of dates) {
  console.log(`${d} ${km(days.get(d)!)}`);
  total += days.get(d)!;
  if (days.get(d)! > days.get(best)!) best = d;
}
console.log(`total ${km(total)}`);
console.log(`longest ${best}`);
