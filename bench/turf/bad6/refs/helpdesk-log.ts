// Help desk log: tickets closed and minutes per agent, open tickets, slowest ticket. Fails loudly on any line it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const stamp = (s: string, n: number) => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})$/.exec(s);
  if (!m) fail(`line ${n}: bad time ${JSON.stringify(s)}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (h > 23 || mi > 59 || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) fail(`line ${n}: impossible time ${JSON.stringify(s)}`);
  return t.getTime() / 60000;
};
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
type T = { opened: number; agent: string | null; closed: number | null };
const tickets = new Map<string, T>();
const agents = new Set<string>();
let prev: number | null = null;
lines.forEach((line, i) => {
  const n = i + 1;
  const f = line.split(" ");
  if (f.length < 3) fail(`line ${n}: expected at least 3 fields, got ${f.length}`);
  const [ts, tid, ev] = f;
  if (!["opened", "assigned", "closed"].includes(ev)) fail(`line ${n}: unknown event ${JSON.stringify(ev)}`);
  const want = ev === "assigned" ? 4 : 3;
  if (f.length !== want) fail(`line ${n}: expected ${want} fields for ${ev}, got ${f.length}`);
  if (tid === "") fail(`line ${n}: missing ticket id`);
  const t = stamp(ts, n);
  if (prev !== null && t < prev) fail(`line ${n}: time ${ts} is earlier than the line before it`);
  prev = t;
  if (ev === "opened") {
    if (tickets.has(tid)) fail(`line ${n}: ${tid} is opened twice`);
    tickets.set(tid, { opened: t, agent: null, closed: null });
    return;
  }
  const tk = tickets.get(tid);
  if (!tk) fail(`line ${n}: ${tid} was never opened`);
  if (tk.closed !== null) fail(`line ${n}: ${tid} has an event after it was closed`);
  if (ev === "assigned") {
    if (f[3] === "") fail(`line ${n}: missing agent`);
    tk.agent = f[3];
    agents.add(f[3]);
  } else {
    if (tk.agent === null) fail(`line ${n}: ${tid} is closed without being assigned`);
    tk.closed = t;
  }
});
const closed = [...tickets].filter(([, tk]) => tk.closed !== null);
if (!closed.length) fail("no closed tickets, there is no slowest ticket");
const dur = (tk: T) => tk.closed! - tk.opened;
const out: string[] = [];
for (const a of [...agents].sort(cmp)) {
  const mine = closed.filter(([, tk]) => tk.agent === a);
  out.push(`${a} ${mine.length} ${mine.reduce((s, [, tk]) => s + dur(tk), 0)}`);
}
out.push(`open ${tickets.size - closed.length}`);
const top = [...closed].sort((x, y) => (dur(y[1]) - dur(x[1])) || cmp(x[0], y[0]))[0];
out.push(`slowest ${top[0]} ${dur(top[1])}`);
console.log(out.join("\n"));
