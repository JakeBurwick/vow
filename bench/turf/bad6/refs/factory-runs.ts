// Production runs: runs, minutes and good parts per machine, scrap rate, busiest machine. Fails loudly on any row it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const minutes = (s: string, what: string, n: number) => {
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(s);
  if (!m) fail(`line ${n}: bad ${what} time ${JSON.stringify(s)}`);
  return Number(m[1]) * 60 + Number(m[2]);
};
const realDay = (d: string) => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(d);
  if (!m) return false;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return t.getUTCFullYear() === Number(m[1]) && t.getUTCMonth() === Number(m[2]) - 1 && t.getUTCDate() === Number(m[3]);
};

const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
if (!lines.length) fail("empty input, no header");
if (lines[0] !== "machine,day,start,end,made,scrapped") fail(`bad header: ${JSON.stringify(lines[0])}`);
type Run = { mach: string; day: string; start: number; end: number; made: number; scr: number; n: number };
const runs: Run[] = [];
lines.slice(1).forEach((line, i) => {
  const n = i + 2;
  const f = line.split(",");
  if (f.length !== 6) fail(`line ${n}: expected 6 fields, got ${f.length}`);
  const [mach, day, s, e, made, scr] = f;
  if (mach === "") fail(`line ${n}: missing machine`);
  if (!realDay(day)) fail(`line ${n}: bad day ${JSON.stringify(day)}`);
  const start = minutes(s, "start", n), end = minutes(e, "end", n);
  for (const [name, v] of [["made", made], ["scrapped", scr]]) {
    if (!/^[0-9]+$/.test(v)) fail(`line ${n}: bad ${name} count ${JSON.stringify(v)}`);
  }
  const mk = Number(made), sc = Number(scr);
  if (end <= start) fail(`line ${n}: run ends at ${e}, not after it starts at ${s}`);
  if (sc > mk) fail(`line ${n}: ${sc} parts scrapped but only ${mk} made`);
  runs.push({ mach, day, start, end, made: mk, scr: sc, n });
});
if (!runs.length) fail("no runs, there is no busiest machine");
const slots = new Map<string, Run[]>();
for (const r of runs) {
  const k = `${r.mach}\u0000${r.day}`;
  if (!slots.has(k)) slots.set(k, []);
  slots.get(k)!.push(r);
}
for (const rs of slots.values()) {
  rs.sort((a, b) => a.start - b.start);
  for (let i = 1; i < rs.length; i++) {
    if (rs[i].start < rs[i - 1].end) fail(`line ${rs[i].n}: ${rs[i].mach} starts a run on ${rs[i].day} before its run on line ${rs[i - 1].n} ends`);
  }
}
const per = new Map<string, { k: number; m: number; g: number }>();
let tmade = 0, tscr = 0;
for (const r of runs) {
  const p = per.get(r.mach) ?? { k: 0, m: 0, g: 0 };
  p.k++;
  p.m += r.end - r.start;
  p.g += r.made - r.scr;
  per.set(r.mach, p);
  tmade += r.made;
  tscr += r.scr;
}
if (tmade === 0) fail("no parts made, the scrap rate is undefined");
const names = [...per.keys()].sort(cmp);
const out = names.map((k) => `${k} ${per.get(k)!.k} ${per.get(k)!.m} ${per.get(k)!.g}`);
const h = Math.floor((2 * tscr * 10000 + tmade) / (2 * tmade));
out.push(`scrap ${Math.floor(h / 100)}.${String(h % 100).padStart(2, "0")}%`);
const top = [...names].sort((a, b) => (per.get(b)!.m - per.get(a)!.m) || cmp(a, b))[0];
out.push(`busiest ${top} ${per.get(top)!.m}`);
console.log(out.join("\n"));
