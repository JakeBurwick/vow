// Parking garage: stays, minutes and fees per plate, total, longest stay. Fails loudly on any line it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
// Days since 1970-01-01 for a YYYY-MM-DD date, or null if the day does not exist.
function dayNo(d: string): number | null {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(d);
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, da);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== da) return null;
  return t / 86400000;
}
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
const inside = new Map<string, number>();
const stays: { plate: string; start: number; mins: number }[] = [];
lines.forEach((line, i) => {
  const n = i + 1;
  const f = line.split(" ");
  if (f.length !== 4) fail(`line ${n}: expected 4 fields, got ${f.length}`);
  const [d, t, event, plate] = f;
  const day = dayNo(d);
  if (day === null) fail(`line ${n}: bad date ${JSON.stringify(d)}`);
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(t)) fail(`line ${n}: bad time ${JSON.stringify(t)}`);
  const m = day * 1440 + Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  if (plate === "") fail(`line ${n}: missing plate`);
  if (event === "IN") {
    if (inside.has(plate)) fail(`line ${n}: ${plate} drives in but is already inside`);
    inside.set(plate, m);
  } else if (event === "OUT") {
    if (!inside.has(plate)) fail(`line ${n}: ${plate} drives out but never drove in`);
    const start = inside.get(plate)!;
    inside.delete(plate);
    if (m < start) fail(`line ${n}: ${plate} drives out before it drove in`);
    stays.push({ plate, start, mins: m - start });
  } else fail(`line ${n}: bad event ${JSON.stringify(event)}`);
});
if (inside.size) fail(`stay never ended for ${[...inside.keys()].sort(cmp).join(", ")}`);
if (!stays.length) fail("no stays, there is no longest stay");
const money = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
const fee = (mins: number) => 250 * Math.ceil(mins / 60);
const per = new Map<string, [number, number, number]>();
for (const s of stays) {
  const [k, t, c] = per.get(s.plate) ?? [0, 0, 0];
  per.set(s.plate, [k + 1, t + s.mins, c + fee(s.mins)]);
}
for (const p of [...per.keys()].sort(cmp)) {
  const [k, t, c] = per.get(p)!;
  console.log(`${p} ${k} ${t} ${money(c)}`);
}
console.log(`total ${money(stays.reduce((a, s) => a + fee(s.mins), 0))}`);
const best = [...stays].sort((a, b) => (b.mins - a.mins) || (a.start - b.start) || cmp(a.plate, b.plate))[0];
console.log(`longest ${best.plate} ${best.mins}`);
