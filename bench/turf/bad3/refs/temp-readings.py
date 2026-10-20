# Temperature readings: min, max and mean per station, coldest reading. Fails loudly on any line it cannot read.
import datetime, re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def deg(t):
    return f"{'-' if t < 0 else ''}{abs(t) // 10}.{abs(t) % 10}"

st, cold = {}, None
for n, line in enumerate(sys.stdin.read().split("\n"), 1):
    if line == "":
        continue
    f = line.split(" ")
    if len(f) != 4:
        fail(f"line {n}: expected 4 fields, got {len(f)}")
    station, date, time, temp = f
    if station == "":
        fail(f"line {n}: missing station")
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", date):
        fail(f"line {n}: bad date {date!r}")
    try:
        datetime.date.fromisoformat(date)
    except ValueError:
        fail(f"line {n}: invalid date {date!r}")
    if not re.fullmatch(r"([01][0-9]|2[0-3]):[0-5][0-9]", time):
        fail(f"line {n}: bad time {time!r}")
    m = re.fullmatch(r"(-?)([0-9]+)(?:\.([0-9]))?", temp)
    if not m:
        fail(f"line {n}: bad temp {temp!r}")
    t = int(m[2]) * 10 + int(m[3] or "0")
    if m[1]:
        t = -t
    lo, hi, s, k = st.get(station, (t, t, 0, 0))
    st[station] = (min(lo, t), max(hi, t), s + t, k + 1)
    if cold is None or (t, date, station) < cold:
        cold = (t, date, station)
if cold is None:
    fail("no readings, there is no coldest reading")
for station in sorted(st):
    lo, hi, s, k = st[station]
    print(station, deg(lo), deg(hi), deg((2 * s + k) // (2 * k)))
print("coldest", cold[2], cold[1])
