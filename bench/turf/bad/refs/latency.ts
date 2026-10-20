// Latency report: per-path count/mean/max, p95 (nearest rank), 5xx count. Fails loudly on any line it cannot read.
function fail(msg: string): never {
  console.error(`error: ${msg}`);
  Deno.exit(1);
}
const cmp = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!), y = Array.from(b, (c) => c.codePointAt(0)!);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};
const text = new TextDecoder().decode(await new Response(Deno.stdin.readable).arrayBuffer());
const paths = new Map<string, number[]>(), all: number[] = [];
let errors = 0;
text.split("\n").forEach((line, i) => {
  const n = i + 1;
  if (line === "") return;
  const f = line.split(" ");
  if (f.length !== 5) fail(`line ${n}: expected 5 fields, got ${f.length}`);
  const [, , path, status, dur] = f;
  if (!path.startsWith("/")) fail(`line ${n}: bad path ${JSON.stringify(path)}`);
  if (!/^[0-9]{3}$/.test(status)) fail(`line ${n}: bad status ${JSON.stringify(status)}`);
  const m = /^([0-9]+)ms$/.exec(dur);
  if (!m) fail(`line ${n}: bad duration ${JSON.stringify(dur)}`);
  const ms = Number(m[1]);
  if (!paths.has(path)) paths.set(path, []);
  paths.get(path)!.push(ms);
  all.push(ms);
  if (Number(status) >= 500) errors++;
});
if (!all.length) fail("no requests, p95 is undefined");
for (const p of [...paths.keys()].sort(cmp)) {
  const d = paths.get(p)!, s = d.reduce((a, b) => a + b, 0);
  const t = Math.floor((20 * s + d.length) / (2 * d.length));
  console.log(`${p} ${d.length} ${Math.floor(t / 10)}.${t % 10} ${Math.max(...d)}`);
}
all.sort((a, b) => a - b);
console.log(`p95 ${all[Math.floor((95 * all.length + 99) / 100) - 1]}`);
console.log(`errors ${errors}`);
