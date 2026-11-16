# Help desk log: tickets closed and minutes per agent, open tickets, slowest ticket. Fails loudly on any line it cannot read.
import calendar, datetime, re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def stamp(s, n):
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}", s):
        fail(f"line {n}: bad time {s!r}")
    try:
        dt = datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M")
    except ValueError:
        fail(f"line {n}: impossible time {s!r}")
    return calendar.timegm(dt.timetuple()) // 60

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
tickets, agents, prev = {}, set(), None
for n, line in enumerate(lines, 1):
    f = line.split(" ")
    if len(f) < 3:
        fail(f"line {n}: expected at least 3 fields, got {len(f)}")
    ts, tid, ev = f[0], f[1], f[2]
    want = 4 if ev == "assigned" else 3
    if ev not in ("opened", "assigned", "closed"):
        fail(f"line {n}: unknown event {ev!r}")
    if len(f) != want:
        fail(f"line {n}: expected {want} fields for {ev}, got {len(f)}")
    if tid == "":
        fail(f"line {n}: missing ticket id")
    t = stamp(ts, n)
    if prev is not None and t < prev:
        fail(f"line {n}: time {ts} is earlier than the line before it")
    prev = t
    if ev == "opened":
        if tid in tickets:
            fail(f"line {n}: {tid} is opened twice")
        tickets[tid] = {"opened": t, "agent": None, "closed": None}
        continue
    if tid not in tickets:
        fail(f"line {n}: {tid} was never opened")
    tk = tickets[tid]
    if tk["closed"] is not None:
        fail(f"line {n}: {tid} has an event after it was closed")
    if ev == "assigned":
        if f[3] == "":
            fail(f"line {n}: missing agent")
        tk["agent"] = f[3]
        agents.add(f[3])
    else:
        if tk["agent"] is None:
            fail(f"line {n}: {tid} is closed without being assigned")
        tk["closed"] = t
closed = [(tid, tk) for tid, tk in tickets.items() if tk["closed"] is not None]
if not closed:
    fail("no closed tickets, there is no slowest ticket")
for a in sorted(agents):
    mine = [tk["closed"] - tk["opened"] for _, tk in closed if tk["agent"] == a]
    print(a, len(mine), sum(mine))
print("open", len(tickets) - len(closed))
top = min(closed, key=lambda c: (-(c[1]["closed"] - c[1]["opened"]), c[0]))
print("slowest", top[0], top[1]["closed"] - top[1]["opened"])
