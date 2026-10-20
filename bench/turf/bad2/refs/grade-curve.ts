// Grade curve: percent and letter per student, class average. Fails loudly on any record it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
if (Deno.args.length < 1) fail("missing argument");
// deno-lint-ignore no-explicit-any
let data: any;
try {
  data = JSON.parse(Deno.args[0]);
} catch (e) {
  fail(`invalid JSON: ${(e as Error).message}`);
}
if (data === null || typeof data !== "object" || Array.isArray(data)) fail("expected a JSON object");
const mx = data.max;
if (!whole(mx) || mx <= 0) fail(`bad max ${JSON.stringify(mx)}`);
const students = data.students;
if (!Array.isArray(students)) fail("missing students list");
if (students.length === 0) fail("no students, class avg is undefined");
const rows: { name: string; t: number }[] = [];
students.forEach((s: any, i: number) => {
  const n = i + 1;
  if (s === null || typeof s !== "object" || Array.isArray(s)) fail(`student ${n}: expected an object`);
  if (typeof s.name !== "string") fail(`student ${n}: missing name`);
  if (!Array.isArray(s.scores)) fail(`student ${n}: missing scores`);
  if (s.scores.length === 0) fail(`student ${n} (${s.name}): no scores, mean is undefined`);
  for (const x of s.scores) if (!whole(x) || x < 0) fail(`student ${n} (${s.name}): bad score ${JSON.stringify(x)}`);
  const S = s.scores.reduce((a: number, x: number) => a + x, 0), c = s.scores.length;
  rows.push({ name: s.name, t: Math.floor((2000 * S + c * mx) / (2 * c * mx)) });
});
const letter = (t: number) => (t >= 900 ? "A" : t >= 800 ? "B" : t >= 700 ? "C" : t >= 600 ? "D" : "F");
rows.sort((a, b) => b.t - a.t || cmp(a.name, b.name));
for (const r of rows) console.log(`${r.name} ${Math.floor(r.t / 10)}.${r.t % 10} ${letter(r.t)}`);
const k = rows.length, T = rows.reduce((a, r) => a + r.t, 0);
const avg = Math.floor((2 * T + k) / (2 * k));
console.log(`class avg ${Math.floor(avg / 10)}.${avg % 10}`);
