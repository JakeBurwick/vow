import sys, json, re
from decimal import Decimal, ROUND_HALF_UP
from datetime import date

def bad_const(x):
    raise ValueError(x)

def out(s):
    sys.stdout.write(s + "\n")

def main():
    try:
        data = json.loads(sys.argv[1], parse_float=Decimal, parse_constant=bad_const)
    except Exception:
        out("error: bad json"); return
    if not isinstance(data, list):
        out("error: bad json"); return

    def isnum(v):
        return isinstance(v, (int, Decimal)) and not isinstance(v, bool)

    def check(o):
        if not isinstance(o, dict):
            return None
        # id
        if "id" not in o:
            return None
        i = o["id"]
        if isinstance(i, bool):
            return None
        if isinstance(i, int):
            if i < 0:
                return None
            key = str(i)
        elif isinstance(i, str) and re.fullmatch(r"[0-9]+", i):
            key = str(int(i))
        else:
            return None
        # date
        d = o.get("date")
        if not isinstance(d, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", d):
            return None
        try:
            date(int(d[0:4]), int(d[5:7]), int(d[8:10]))
        except ValueError:
            return None
        # price
        if "price" not in o:
            return None
        p = o["price"]
        if isinstance(p, str):
            if not re.fullmatch(r"[0-9]+(\.[0-9]{1,3})?", p):
                return None
            p = Decimal(p)
        elif isnum(p):
            p = Decimal(p)
        else:
            return None
        if p < 0 or p >= 100000 or p != p.quantize(Decimal("0.001")):
            return None
        # qty
        if "qty" not in o:
            return None
        q = o["qty"]
        if not isnum(q):
            return None
        q = Decimal(q)
        if q != q.to_integral_value() or q < 1 or q > 1000:
            return None
        # discount
        disc = o.get("discount")
        if disc is None:
            disc = Decimal(0)
        elif isnum(disc):
            disc = Decimal(disc)
            if disc < 0 or disc > 1 or disc != disc.quantize(Decimal("0.01")):
                return None
        else:
            return None
        total = (p * q * (1 - disc)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return key, d, total

    parsed = []
    for n, o in enumerate(data, 1):
        r = check(o)
        if r is None:
            out("error: bad order %d" % n); return
        parsed.append(r)
    seen = set()
    days = {}
    for key, d, total in parsed:
        if key in seen:
            continue
        seen.add(key)
        days[d] = days.get(d, Decimal(0)) + total
    grand = Decimal(0)
    for d in sorted(days):
        out("%s %s" % (d, format(days[d].quantize(Decimal("0.01")), "f")))
        grand += days[d]
    out("orders %d" % len(seen))
    out("total %s" % format(grand.quantize(Decimal("0.01")), "f"))

main()
