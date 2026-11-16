# Water bills: accounts, usage and billed amount per zone, total, highest usage. Fails loudly on any row it cannot read.
import re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def bill(u):
    return 350 + 120 * min(u, 10) + 205 * max(u - 10, 0)

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
if not lines:
    fail("empty input, no header")
if lines[0] != "account,zone,previous,current":
    fail(f"bad header: {lines[0]!r}")
rows, seen = [], set()
for n, line in enumerate(lines[1:], 2):
    f = line.split(",")
    if len(f) != 4:
        fail(f"line {n}: expected 4 fields, got {len(f)}")
    acct, zone, prev, cur = f
    if acct == "":
        fail(f"line {n}: missing account")
    if zone == "":
        fail(f"line {n}: missing zone")
    for name, v in (("previous", prev), ("current", cur)):
        if not re.fullmatch(r"[0-9]+", v):
            fail(f"line {n}: bad {name} reading {v!r}")
    u = int(cur) - int(prev)
    if u < 0:
        fail(f"line {n}: current reading {cur} is below the previous reading {prev}")
    if acct in seen:
        fail(f"line {n}: account {acct} appears twice")
    seen.add(acct)
    rows.append((acct, zone, u, bill(u)))
if not rows:
    fail("no accounts, there is no highest usage")

money = lambda c: f"{c // 100}.{c % 100:02d}"
per = {}
for acct, zone, u, c in rows:
    k, t, b = per.get(zone, (0, 0, 0))
    per[zone] = (k + 1, t + u, b + c)
for zone in sorted(per):
    k, t, b = per[zone]
    print(zone, k, t, money(b))
print("total", money(sum(r[3] for r in rows)))
top = min(rows, key=lambda r: (-r[2], r[0]))
print("highest", top[0], top[2])
