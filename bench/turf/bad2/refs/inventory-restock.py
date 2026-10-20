# Inventory restock: skus at or below their reorder point, restock qty and cost. Fails loudly on any row it cannot read.
import re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

lines = sys.stdin.read().split("\n")
if lines and lines[-1] == "":
    lines.pop()
if not lines:
    fail("empty input, no header")
if lines[0] != "sku,name,on_hand,reorder_at,unit_cost":
    fail(f"bad header: {lines[0]!r}")
out = []
for n, line in enumerate(lines[1:], 2):
    f = line.split(",")
    if len(f) != 5:
        fail(f"line {n}: expected 5 fields, got {len(f)}")
    sku, name, on_hand, reorder_at, cost = f
    if sku == "":
        fail(f"line {n}: missing sku")
    if not re.fullmatch(r"[0-9]+", on_hand):
        fail(f"line {n}: bad on_hand {on_hand!r}")
    if not re.fullmatch(r"[0-9]+", reorder_at):
        fail(f"line {n}: bad reorder_at {reorder_at!r}")
    m = re.fullmatch(r"([0-9]+)(?:\.([0-9]{1,2}))?", cost)
    if not m:
        fail(f"line {n}: bad unit_cost {cost!r}")
    cents = int(m[1]) * 100 + int((m[2] or "").ljust(2, "0"))
    oh, ra = int(on_hand), int(reorder_at)
    if oh <= ra:
        qty = 2 * ra - oh
        out.append((sku, qty, qty * cents))

money = lambda c: f"{c // 100}.{c % 100:02d}"
out.sort(key=lambda r: r[0])
for sku, qty, c in out:
    print(sku, qty, money(c))
print("total", money(sum(r[2] for r in out)))
print("items", len(out))
