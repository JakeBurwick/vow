// User stats: per-plan count and mean age, oldest user, signups per month. Fails loudly on any record it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
if (Deno.args.length < 1) fail("missing argument");
let data: unknown;
try {
  // keep each "id" number exactly as written (ids can be past 2^53)
  // deno-lint-ignore no-explicit-any
  data = JSON.parse(Deno.args[0], function (k: string, v: unknown, ctx?: any) {
    return k === "id" && typeof v === "number" ? { exact: ctx.source as string } : v;
  });
} catch (e) {
  fail(`invalid JSON: ${(e as Error).message}`);
}
if (!Array.isArray(data)) fail("expected a JSON array");
if (data.length === 0) fail("no users, there is no oldest user");
type U = { id: bigint; name: string; age: number; plan: string; month: string };
const users: U[] = [];
data.forEach((u: any, i: number) => {
  const n = i + 1;
  if (u === null || typeof u !== "object" || Array.isArray(u)) fail(`user ${n}: expected an object`);
  for (const k of ["id", "name", "age", "plan", "signup"]) if (!(k in u) || u[k] === null) fail(`user ${n}: missing ${k}`);
  if (typeof u.id !== "object" || !/^-?[0-9]+$/.test(u.id.exact)) fail(`user ${n}: bad id`);
  if (typeof u.age !== "number" || !Number.isInteger(u.age) || u.age < 0) fail(`user ${n}: bad age ${JSON.stringify(u.age)}`);
  if (typeof u.name !== "string" || typeof u.plan !== "string") fail(`user ${n}: name and plan must be strings`);
  const s = u.signup;
  const m = typeof s === "string" ? /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s) : null;
  if (!m) fail(`user ${n}: bad signup ${JSON.stringify(s)}`);
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) fail(`user ${n}: invalid signup date ${s}`);
  users.push({ id: BigInt(u.id.exact), name: u.name, age: u.age, plan: u.plan, month: s.slice(0, 7) });
});
const plans = new Map<string, [number, number]>(), months = new Map<string, number>();
for (const u of users) {
  const [c, a] = plans.get(u.plan) ?? [0, 0];
  plans.set(u.plan, [c + 1, a + u.age]);
  months.set(u.month, (months.get(u.month) ?? 0) + 1);
}
for (const p of [...plans.keys()].sort(cmp)) {
  const [c, a] = plans.get(p)!;
  const t = Math.floor((20 * a + c) / (2 * c));
  console.log(`${p} ${c} ${Math.floor(t / 10)}.${t % 10}`);
}
let best = users[0];
for (const u of users) if (u.age > best.age || (u.age === best.age && u.id < best.id)) best = u;
console.log(`oldest ${best.id} ${best.name}`);
for (const m of [...months.keys()].sort(cmp)) console.log(`${m} ${months.get(m)}`);
