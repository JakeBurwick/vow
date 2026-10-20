# Sales report: revenue per region, total, mean units. Fails loudly on any row it cannot read.
import re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
if not lines:
    fail("empty input, no header")
if lines[0] != "region,rep,units,unit_price":
    fail(f"bad header: {lines[0]!r}")
rows = lines[1:]
if not rows:
    fail("no sales rows, mean units is undefined")
by_region, units_sum = {}, 0
for n, line in enumerate(rows, 2):
    f = line.split(",")
    if len(f) != 4:
        fail(f"line {n}: expected 4 fields, got {len(f)}")
    region, rep, units, price = f
    if region == "" or rep == "":
        fail(f"line {n}: missing region or rep")
    if not re.fullmatch(r"[0-9]+", units):
        fail(f"line {n}: bad units {units!r}")
    m = re.fullmatch(r"([0-9]+)(?:\.([0-9]{1,2}))?", price)
    if not m:
        fail(f"line {n}: bad unit_price {price!r}")
    cents = int(m[1]) * 100 + int((m[2] or "").ljust(2, "0"))
    by_region[region] = by_region.get(region, 0) + int(units) * cents
    units_sum += int(units)

money = lambda c: f"{c // 100}.{c % 100:02d}"
for region in sorted(by_region):
    print(region, money(by_region[region]))
print("total", money(sum(by_region.values())))
k = len(rows)
tenths = (20 * units_sum + k) // (2 * k)
print(f"avg units {tenths // 10}.{tenths % 10}")
