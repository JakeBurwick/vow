# League table: played, won, drawn, lost, goals and points per team, leader, number of matchdays. Fails loudly on any line it cannot read.
import re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
stats, playing = {}, {}
for n, line in enumerate(lines, 1):
    f = line.split(" ")
    if len(f) != 4:
        fail(f"line {n}: expected 4 fields, got {len(f)}")
    md, home, score, away = f
    if not re.fullmatch(r"[0-9]+", md):
        fail(f"line {n}: bad matchday {md!r}")
    m = re.fullmatch(r"([0-9]+)-([0-9]+)", score)
    if not m:
        fail(f"line {n}: bad score {score!r}")
    if home == "" or away == "":
        fail(f"line {n}: missing team")
    if home == away:
        fail(f"line {n}: {home} plays itself")
    day = int(md)
    on = playing.setdefault(day, set())
    for t in (home, away):
        if t in on:
            fail(f"line {n}: {t} plays twice on matchday {day}")
        on.add(t)
    hg, ag = int(m[1]), int(m[2])
    for t, gf, ga in ((home, hg, ag), (away, ag, hg)):
        s = stats.setdefault(t, [0, 0, 0, 0, 0, 0, 0])
        s[0] += 1
        s[1 if gf > ga else 2 if gf == ga else 3] += 1
        s[4] += gf
        s[5] += ga
        s[6] += 3 if gf > ga else 1 if gf == ga else 0
if not stats:
    fail("no matches, there is no leader")
for t in sorted(stats):
    print(t, *stats[t])
lead = min(stats, key=lambda t: (-stats[t][6], -(stats[t][4] - stats[t][5]), t))
print("leader", lead, stats[lead][6])
print("matchdays", len(playing))
