// Temperature readings: min, max and mean per station, coldest reading. Fails loudly on any line it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const deg = (t: number) => `${t < 0 ? "-" : ""}${Math.floor(Math.abs(t) / 10)}.${Math.abs(t) % 10}`;
const validDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, day));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === day;
};
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const st = new Map<string, [number, number, number, number]>();
let cold: [number, string, string] | null = null;
text.split("\n").forEach((line, i) => {
  const n = i + 1;
  if (line === "") return;
  const f = line.split(" ");
  if (f.length !== 4) fail(`line ${n}: expected 4 fields, got ${f.length}`);
  const [station, date, time, temp] = f;
  if (station === "") fail(`line ${n}: missing station`);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) fail(`line ${n}: bad date ${JSON.stringify(date)}`);
  if (!validDate(date)) fail(`line ${n}: invalid date ${JSON.stringify(date)}`);
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) fail(`line ${n}: bad time ${JSON.stringify(time)}`);
  const m = /^(-?)([0-9]+)(?:\.([0-9]))?$/.exec(temp);
  if (!m) fail(`line ${n}: bad temp ${JSON.stringify(temp)}`);
  let t = Number(m[2]) * 10 + Number(m[3] ?? "0");
  if (m[1] && t !== 0) t = -t;
  const [lo, hi, s, k] = st.get(station) ?? [t, t, 0, 0];
  st.set(station, [Math.min(lo, t), Math.max(hi, t), s + t, k + 1]);
  if (cold === null || t < cold[0] || (t === cold[0] && (date < cold[1] || (date === cold[1] && cmp(station, cold[2]) < 0)))) cold = [t, date, station];
});
if (cold === null) fail("no readings, there is no coldest reading");
for (const station of [...st.keys()].sort(cmp)) {
  const [lo, hi, s, k] = st.get(station)!;
  console.log(`${station} ${deg(lo)} ${deg(hi)} ${deg(Math.floor((2 * s + k) / (2 * k)))}`);
}
const c = cold as [number, string, string];
console.log(`coldest ${c[2]} ${c[1]}`);
