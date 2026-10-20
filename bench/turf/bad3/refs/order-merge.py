# Order merge: orders, items and spend per customer, best-selling sku. Fails loudly on any record it cannot read.
import json, sys
from decimal import Decimal

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def not_json(c):
    raise ValueError(f"{c} is not a JSON value")

whole = lambda v: isinstance(v, int) and not isinstance(v, bool)
if len(sys.argv) < 2:
    fail("missing argument")
try:
    data = json.loads(sys.argv[1], parse_float=Decimal, parse_constant=not_json)
except ValueError as e:
    fail(f"invalid JSON: {e}")
if not isinstance(data, dict):
    fail("expected a JSON object")
orders = data.get("orders")
if not isinstance(orders, list):
    fail("missing orders list")
if not orders:
    fail("no orders, there is no best sku")
cust, skus = {}, {}
for i, o in enumerate(orders, 1):
    if not isinstance(o, dict):
        fail(f"order {i}: expected an object")
    c = o.get("customer")
    if not isinstance(c, str) or c == "":
        fail(f"order {i}: missing customer")
    items = o.get("items")
    if not isinstance(items, list):
        fail(f"order {i}: missing items list")
    k, q, s = cust.get(c, (0, 0, 0))
    k += 1
    for j, it in enumerate(items, 1):
        if not isinstance(it, dict):
            fail(f"order {i} item {j}: expected an object")
        sku, qty, price = it.get("sku"), it.get("qty"), it.get("price")
        if not isinstance(sku, str) or sku == "":
            fail(f"order {i} item {j}: missing sku")
        if not whole(qty) or qty < 0:
            fail(f"order {i} item {j}: bad qty {qty!r}")
        if not (whole(price) or isinstance(price, Decimal)) or price < 0 or float(price) == float("inf"):
            fail(f"order {i} item {j}: bad price {price!r}")
        cents = Decimal(price) * 100
        if cents != cents.to_integral_value():
            fail(f"order {i} item {j}: price {price} is not in whole cents")
        q += qty
        s += qty * int(cents)
        skus[sku] = skus.get(sku, 0) + qty
    cust[c] = (k, q, s)

money = lambda c: f"{c // 100}.{c % 100:02d}"
for c in sorted(cust):
    k, q, s = cust[c]
    print(c, k, q, money(s))
best = min(skus, key=lambda x: (-skus[x], x))
print("best", best, skus[best])
