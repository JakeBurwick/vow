# Playlist stats: tracks and length per playlist, top artist, longest track. Fails loudly on any record it cannot read.
import json, math, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def no_constant(c):
    raise ValueError(f"{c} is not JSON")

if len(sys.argv) < 2:
    fail("missing argument")
try:
    data = json.loads(sys.argv[1], parse_constant=no_constant)
except ValueError as e:
    fail(f"invalid JSON: {e}")
if not isinstance(data, dict):
    fail("expected a JSON object")
pls = data.get("playlists")
if not isinstance(pls, list):
    fail("missing playlists list")
if not pls:
    fail("no playlists, there is no top artist")

def hms(s):
    return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}"

out, artists, longest = [], {}, None
for i, p in enumerate(pls, 1):
    if not isinstance(p, dict):
        fail(f"playlist {i}: expected an object")
    name = p.get("name")
    if not isinstance(name, str):
        fail(f"playlist {i}: missing name")
    tracks = p.get("tracks")
    if not isinstance(tracks, list):
        fail(f"playlist {i}: missing tracks list")
    total = 0
    for j, t in enumerate(tracks, 1):
        if not isinstance(t, dict):
            fail(f"playlist {i} track {j}: expected an object")
        title, artist, sec = t.get("title"), t.get("artist"), t.get("seconds")
        if not isinstance(title, str):
            fail(f"playlist {i} track {j}: missing title")
        if not isinstance(artist, str) or artist == "":
            fail(f"playlist {i} track {j}: missing artist")
        if isinstance(sec, bool) or not isinstance(sec, (int, float)) or not math.isfinite(sec) or sec != int(sec) or sec < 0:
            fail(f"playlist {i} track {j}: bad seconds {sec!r}")
        sec = int(sec)
        total += sec
        artists[artist] = artists.get(artist, 0) + 1
        if longest is None or sec > longest[0]:
            longest = (sec, title)
    out.append(f"{name} {len(tracks)} {hms(total)}")
if longest is None:
    fail("no tracks, there is no top artist or longest track")
top = min(artists, key=lambda a: (-artists[a], a))
out.append(f"artist {top} {artists[top]}")
out.append(f"longest {longest[1]}")
print("\n".join(out))
