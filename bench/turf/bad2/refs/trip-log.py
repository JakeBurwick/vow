# Trip log: km per day from odometer start/end pairs, total, longest day. Fails loudly on any line it cannot read.
import datetime, re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

days, open_trip = {}, None
for n, line in enumerate(sys.stdin.read().split("\n"), 1):
    if line == "":
        continue
    f = line.split(" ")
    if len(f) != 4:
        fail(f"line {n}: expected 4 fields, got {len(f)}")
    date, time, event, odo = f
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", date):
        fail(f"line {n}: bad date {date!r}")
    try:
        datetime.date(int(date[:4]), int(date[5:7]), int(date[8:]))
    except ValueError:
        fail(f"line {n}: invalid date {date}")
    m = re.fullmatch(r"([01][0-9]|2[0-3]):[0-5][0-9]", time)
    if not m:
        fail(f"line {n}: bad time {time!r}")
    m = re.fullmatch(r"([0-9]+)(?:\.([0-9]))?", odo)
    if not m:
        fail(f"line {n}: bad odometer {odo!r}")
    tenths = int(m[1]) * 10 + int(m[2] or "0")
    if event == "start":
        if open_trip is not None:
            fail(f"line {n}: start while the trip from line {open_trip[2]} has no end")
        open_trip = (date, tenths, n)
    elif event == "end":
        if open_trip is None:
            fail(f"line {n}: end without a start")
        if open_trip[0] != date:
            fail(f"line {n}: end on {date} for a start on {open_trip[0]}")
        if tenths < open_trip[1]:
            fail(f"line {n}: end odometer {odo} is below the start")
        days[date] = days.get(date, 0) + tenths - open_trip[1]
        open_trip = None
    else:
        fail(f"line {n}: bad event {event!r}")
if open_trip is not None:
    fail(f"line {open_trip[2]}: start has no end")
if not days:
    fail("no trips, there is no longest day")
km = lambda t: f"{t // 10}.{t % 10}"
for d in sorted(days):
    print(d, km(days[d]))
print("total", km(sum(days.values())))
best = min(sorted(days), key=lambda d: -days[d])
print("longest", best)
