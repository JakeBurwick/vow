# Payroll: pay per employee rounded to the cent, totals and headcount per dept, top earner. Fails loudly on any row it cannot read.
import re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def hundredths(s):
    m = re.fullmatch(r"([0-9]+)(?:\.([0-9]{1,2}))?", s)
    if not m:
        return None
    return int(m[1]) * 100 + int((m[2] or "").ljust(2, "0"))

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
if not lines:
    fail("empty input, no header")
if lines[0] != "employee,dept,hours,rate":
    fail(f"bad header: {lines[0]!r}")
rows = []
for n, line in enumerate(lines[1:], 2):
    f = line.split(",")
    if len(f) != 4:
        fail(f"line {n}: expected 4 fields, got {len(f)}")
    emp, dept, hours, rate = f
    if emp == "":
        fail(f"line {n}: missing employee")
    if dept == "":
        fail(f"line {n}: missing dept")
    h = hundredths(hours)
    if h is None:
        fail(f"line {n}: bad hours {hours!r}")
    r = hundredths(rate)
    if r is None:
        fail(f"line {n}: bad rate {rate!r}")
    rows.append((emp, dept, (h * r + 50) // 100))  # hundredths of an hour x cents, half up to the cent
if not rows:
    fail("no employees, there is no top earner")

money = lambda c: f"{c // 100}.{c % 100:02d}"
depts = {}
for emp, dept, pay in rows:
    t, k = depts.get(dept, (0, 0))
    depts[dept] = (t + pay, k + 1)
for dept in sorted(depts):
    t, k = depts[dept]
    print(dept, money(t), k)
print("total", money(sum(r[2] for r in rows)))
print("top", min(rows, key=lambda r: (-r[2], r[0]))[0])
