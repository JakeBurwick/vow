// League table: played, won, drawn, lost, goals and points per team, leader, number of matchdays. Fails loudly on any line it cannot read.
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
const lines = text.split("\n");
if (lines.length && lines[lines.length - 1] === "") lines.pop();
type S = { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
const stats = new Map<string, S>();
const playing = new Map<number, Set<string>>();
lines.forEach((line, i) => {
  const n = i + 1;
  const f = line.split(" ");
  if (f.length !== 4) fail(`line ${n}: expected 4 fields, got ${f.length}`);
  const [md, home, score, away] = f;
  if (!/^[0-9]+$/.test(md)) fail(`line ${n}: bad matchday ${JSON.stringify(md)}`);
  const m = /^([0-9]+)-([0-9]+)$/.exec(score);
  if (!m) fail(`line ${n}: bad score ${JSON.stringify(score)}`);
  if (home === "" || away === "") fail(`line ${n}: missing team`);
  if (home === away) fail(`line ${n}: ${home} plays itself`);
  const day = Number(md);
  if (!playing.has(day)) playing.set(day, new Set());
  const on = playing.get(day)!;
  for (const t of [home, away]) {
    if (on.has(t)) fail(`line ${n}: ${t} plays twice on matchday ${day}`);
    on.add(t);
  }
  const hg = Number(m[1]), ag = Number(m[2]);
  for (const [t, gf, ga] of [[home, hg, ag], [away, ag, hg]] as [string, number, number][]) {
    const s = stats.get(t) ?? { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    s.p++;
    if (gf > ga) { s.w++; s.pts += 3; } else if (gf === ga) { s.d++; s.pts += 1; } else s.l++;
    s.gf += gf;
    s.ga += ga;
    stats.set(t, s);
  }
});
if (!stats.size) fail("no matches, there is no leader");
const names = [...stats.keys()].sort(cmp);
const out = names.map((t) => {
  const s = stats.get(t)!;
  return `${t} ${s.p} ${s.w} ${s.d} ${s.l} ${s.gf} ${s.ga} ${s.pts}`;
});
const g = (t: string) => stats.get(t)!;
const lead = [...names].sort((a, b) => (g(b).pts - g(a).pts) || ((g(b).gf - g(b).ga) - (g(a).gf - g(a).ga)) || cmp(a, b))[0];
out.push(`leader ${lead} ${g(lead).pts}`);
out.push(`matchdays ${playing.size}`);
console.log(out.join("\n"));
