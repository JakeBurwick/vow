// Playlist stats: tracks and length per playlist, top artist, longest track. Fails loudly on any record it cannot read.
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
if (Deno.args.length < 1) fail("missing argument");
// deno-lint-ignore no-explicit-any
let data: any;
try {
  data = JSON.parse(Deno.args[0]);
} catch (e) {
  fail(`invalid JSON: ${(e as Error).message}`);
}
if (!isObj(data)) fail("expected a JSON object");
const pls = data.playlists;
if (!Array.isArray(pls)) fail("missing playlists list");
if (pls.length === 0) fail("no playlists, there is no top artist");
const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const out: string[] = [];
const artists = new Map<string, number>();
let longest: [number, string] | null = null;
// deno-lint-ignore no-explicit-any
pls.forEach((p: any, pi: number) => {
  const i = pi + 1;
  if (!isObj(p)) fail(`playlist ${i}: expected an object`);
  if (typeof p.name !== "string") fail(`playlist ${i}: missing name`);
  if (!Array.isArray(p.tracks)) fail(`playlist ${i}: missing tracks list`);
  let total = 0;
  // deno-lint-ignore no-explicit-any
  p.tracks.forEach((t: any, ti: number) => {
    const j = ti + 1;
    if (!isObj(t)) fail(`playlist ${i} track ${j}: expected an object`);
    const { title, artist, seconds } = t;
    if (typeof title !== "string") fail(`playlist ${i} track ${j}: missing title`);
    if (typeof artist !== "string" || artist === "") fail(`playlist ${i} track ${j}: missing artist`);
    if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 0) fail(`playlist ${i} track ${j}: bad seconds ${JSON.stringify(seconds)}`);
    total += seconds;
    artists.set(artist, (artists.get(artist) ?? 0) + 1);
    if (longest === null || seconds > longest[0]) longest = [seconds, title];
  });
  out.push(`${p.name} ${p.tracks.length} ${hms(total)}`);
});
if (longest === null) fail("no tracks, there is no top artist or longest track");
const top = [...artists.keys()].sort((a, b) => (artists.get(b)! - artists.get(a)!) || cmp(a, b))[0];
out.push(`artist ${top} ${artists.get(top)}`);
out.push(`longest ${(longest as [number, string])[1]}`);
console.log(out.join("\n"));
