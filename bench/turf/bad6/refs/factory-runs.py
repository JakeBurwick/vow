# Production runs: runs, minutes and good parts per machine, scrap rate, busiest machine. Fails loudly on any row it cannot read.
import datetime, re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def minutes(s, what, n):
    m = re.fullmatch(r"([01][0-9]|2[0-3]):([0-5][0-9])", s)
    if not m:
        fail(f"line {n}: bad {what} time {s!r}")
    return int(m.group(1)) * 60 + int(m.group(2))

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
if not lines:
    fail("empty input, no header")
if lines[0] != "machine,day,start,end,made,scrapped":
    fail(f"bad header: {lines[0]!r}")
runs = []
for n, line in enumerate(lines[1:], 2):
    f = line.split(",")
    if len(f) != 6:
        fail(f"line {n}: expected 6 fields, got {len(f)}")
    mach, day, s, e, made, scr = f
    if mach == "":
        fail(f"line {n}: missing machine")
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day):
        fail(f"line {n}: bad day {day!r}")
    try:
        datetime.date.fromisoformat(day)
    except ValueError:
        fail(f"line {n}: impossible day {day!r}")
    start, end = minutes(s, "start", n), minutes(e, "end", n)
    for name, v in (("made", made), ("scrapped", scr)):
        if not re.fullmatch(r"[0-9]+", v):
            fail(f"line {n}: bad {name} count {v!r}")
    made, scr = int(made), int(scr)
    if end <= start:
        fail(f"line {n}: run ends at {e}, not after it starts at {s}")
    if scr > made:
        fail(f"line {n}: {scr} parts scrapped but only {made} made")
    runs.append((mach, day, start, end, made, scr, n))
if not runs:
    fail("no runs, there is no busiest machine")

slots = {}
for r in runs:
    slots.setdefault((r[0], r[1]), []).append(r)
for (mach, day), rs in slots.items():
    rs.sort(key=lambda r: r[2])
    for a, b in zip(rs, rs[1:]):
        if b[2] < a[3]:
            fail(f"line {b[6]}: {mach} starts a run on {day} before its run on line {a[6]} ends")

per = {}
tmade = tscr = 0
for mach, day, start, end, made, scr, n in runs:
    k, m, g = per.get(mach, (0, 0, 0))
    per[mach] = (k + 1, m + end - start, g + made - scr)
    tmade += made
    tscr += scr
if tmade == 0:
    fail("no parts made, the scrap rate is undefined")
for mach in sorted(per):
    k, m, g = per[mach]
    print(mach, k, m, g)
h = (2 * tscr * 10000 + tmade) // (2 * tmade)
print(f"scrap {h // 100}.{h % 100:02d}%")
top = min(per, key=lambda k: (-per[k][1], k))
print("busiest", top, per[top][1])
