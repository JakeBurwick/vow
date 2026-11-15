# Parcel postage: parcels, weight and postage per destination, total, heaviest parcel. Fails loudly on any row it cannot read.
import re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def grams(s):
    m = re.fullmatch(r"([0-9]+)(?:\.([0-9]{1,3}))?", s)
    if not m:
        return None
    return int(m[1]) * 1000 + int((m[2] or "").ljust(3, "0"))

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
if not lines:
    fail("empty input, no header")
if lines[0] != "parcel,dest,weight":
    fail(f"bad header: {lines[0]!r}")
rows = []
for n, line in enumerate(lines[1:], 2):
    f = line.split(",")
    if len(f) != 3:
        fail(f"line {n}: expected 3 fields, got {len(f)}")
    parcel, dest, weight = f
    if parcel == "":
        fail(f"line {n}: missing parcel id")
    if dest == "":
        fail(f"line {n}: missing dest")
    g = grams(weight)
    if g is None:
        fail(f"line {n}: bad weight {weight!r}")
    rows.append((parcel, dest, g, 400 + 150 * ((g + 999) // 1000)))
if not rows:
    fail("no parcels, there is no heaviest parcel")

money = lambda c: f"{c // 100}.{c % 100:02d}"
kilos = lambda g: f"{g // 1000}.{g % 1000:03d}"
dests = {}
for parcel, dest, g, cost in rows:
    k, w, c = dests.get(dest, (0, 0, 0))
    dests[dest] = (k + 1, w + g, c + cost)
for dest in sorted(dests):
    k, w, c = dests[dest]
    print(dest, k, kilos(w), money(c))
print("total", money(sum(r[3] for r in rows)))
print("heaviest", min(rows, key=lambda r: (-r[2], r[0]))[0])
