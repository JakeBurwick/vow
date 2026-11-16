// Clinic day: visits, wait and care minutes per doctor, longest wait, last patient out. Fails loudly on any record it cannot read.
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
// deno-lint-ignore no-explicit-any
const hm = (v: any, key: string, where: string) => {
  const t = v[key];
  if (typeof t !== "string") fail(`${where}: missing or bad ${key} time ${JSON.stringify(t)}`);
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(t);
  if (!m) fail(`${where}: bad ${key} time ${JSON.stringify(t)}`);
  return Number(m[1]) * 60 + Number(m[2]);
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
const doctors = data.doctors, visits = data.visits;
if (!Array.isArray(doctors) || !doctors.every((d: unknown) => typeof d === "string" && d !== "")) fail("missing or bad doctors list");
if (new Set(doctors).size !== doctors.length) fail("a doctor is listed twice");
if (!Array.isArray(visits)) fail("missing visits list");
type V = { p: string; d: string; a: number; s: number; l: number; i: number };
const per = new Map<string, V[]>(doctors.map((d: string) => [d, [] as V[]]));
const rows: V[] = [];
// deno-lint-ignore no-explicit-any
visits.forEach((v: any, vi: number) => {
  const i = vi + 1, w = `visit ${i}`;
  if (!isObj(v)) fail(`${w}: expected an object`);
  if (typeof v.patient !== "string" || v.patient === "") fail(`${w}: missing patient`);
  if (typeof v.doctor !== "string" || !per.has(v.doctor)) fail(`${w}: doctor ${JSON.stringify(v.doctor)} is not one of the doctors`);
  const a = hm(v, "arrived", w), s = hm(v, "seen", w), l = hm(v, "left", w);
  if (s < a) fail(`${w}: ${v.patient} is seen before arriving`);
  if (l <= s) fail(`${w}: ${v.patient} leaves before being seen`);
  const r = { p: v.patient, d: v.doctor, a, s, l, i };
  per.get(v.doctor)!.push(r);
  rows.push(r);
});
if (!rows.length) fail("no visits, there is no longest wait");
for (const [d, vs] of per) {
  vs.sort((x, y) => x.s - y.s);
  for (let k = 1; k < vs.length; k++) {
    if (vs[k].s < vs[k - 1].l) fail(`visit ${vs[k].i}: ${d} sees a patient before the patient of visit ${vs[k - 1].i} has left`);
  }
}
const out: string[] = [];
for (const d of doctors as string[]) {
  const rs = per.get(d)!;
  out.push(`${d} ${rs.length} ${rs.reduce((t, r) => t + r.s - r.a, 0)} ${rs.reduce((t, r) => t + r.l - r.s, 0)}`);
}
const top = [...rows].sort((x, y) => ((y.s - y.a) - (x.s - x.a)) || cmp(x.p, y.p))[0];
out.push(`longest-wait ${top.p} ${top.s - top.a}`);
const last = Math.max(...rows.map((r) => r.l));
out.push(`last-out ${String(Math.floor(last / 60)).padStart(2, "0")}:${String(last % 60).padStart(2, "0")}`);
console.log(out.join("\n"));
