# Parking garage: stays, minutes and fees per plate, total, longest stay. Fails loudly on any line it cannot read.
import re, sys
from datetime import date

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
inside, stays = {}, []
for n, line in enumerate(lines, 1):
    f = line.split(" ")
    if len(f) != 4:
        fail(f"line {n}: expected 4 fields, got {len(f)}")
    d, t, event, plate = f
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", d):
        fail(f"line {n}: bad date {d!r}")
    try:
        day = date.fromisoformat(d).toordinal()
    except ValueError:
        fail(f"line {n}: invalid date {d!r}")
    if not re.fullmatch(r"([01][0-9]|2[0-3]):[0-5][0-9]", t):
        fail(f"line {n}: bad time {t!r}")
    m = day * 1440 + int(t[:2]) * 60 + int(t[3:])
    if plate == "":
        fail(f"line {n}: missing plate")
    if event == "IN":
        if plate in inside:
            fail(f"line {n}: {plate} drives in but is already inside")
        inside[plate] = m
    elif event == "OUT":
        if plate not in inside:
            fail(f"line {n}: {plate} drives out but never drove in")
        start = inside.pop(plate)
        if m < start:
            fail(f"line {n}: {plate} drives out before it drove in")
        stays.append((plate, start, m - start))
    else:
        fail(f"line {n}: bad event {event!r}")
if inside:
    fail(f"stay never ended for {', '.join(sorted(inside))}")
if not stays:
    fail("no stays, there is no longest stay")

money = lambda c: f"{c // 100}.{c % 100:02d}"
fee = lambda mins: 250 * ((mins + 59) // 60)
per = {}
for plate, start, mins in stays:
    k, t, c = per.get(plate, (0, 0, 0))
    per[plate] = (k + 1, t + mins, c + fee(mins))
for plate in sorted(per):
    k, t, c = per[plate]
    print(plate, k, t, money(c))
print("total", money(sum(fee(s[2]) for s in stays)))
best = min(stays, key=lambda s: (-s[2], s[1], s[0]))
print("longest", best[0], best[2])
