import sys, json, re
from decimal import Decimal, ROUND_HALF_UP

def bad_const(x):
    raise ValueError(x)

def out(s):
    sys.stdout.write(s + "\n")

def isnum(v):
    return isinstance(v, (int, Decimal)) and not isinstance(v, bool)

def fmt(d):
    d = Decimal(d)
    if d == 0:
        return "0"
    s = format(d.normalize(), "f")
    return s

def main():
    try:
        data = json.loads(sys.argv[1], parse_float=Decimal, parse_constant=bad_const)
    except Exception:
        out("error: bad json"); return
    if not isinstance(data, list):
        out("error: bad json"); return
    order = []          # skus in position order
    state = {}          # sku -> [qty, price or None]

    def sku_field(e, k):
        v = e.get(k)
        if isinstance(v, str) and v != "":
            return v
        return None

    def qty_field(e):
        v = e.get("qty")
        if not isnum(v):
            return None
        v = Decimal(v)
        if v != v.to_integral_value() or v < 1:
            return None
        return int(v)

    for n, e in enumerate(data, 1):
        if not isinstance(e, dict) or not isinstance(e.get("type"), str):
            out("error: bad event %d" % n); return
        t = e["type"]
        if t not in ("add", "remove", "rename", "price"):
            out("error: unknown event %d" % n); return
        sku = sku_field(e, "sku")
        if sku is None:
            out("error: bad event %d" % n); return
        if t in ("add", "remove"):
            q = qty_field(e)
            if q is None:
                out("error: bad event %d" % n); return
            if t == "add":
                if sku not in state:
                    state[sku] = [0, None]
                    order.append(sku)
                state[sku][0] += q
            else:
                if sku not in state or state[sku][0] < q:
                    out("error: rejected event %d" % n); return
                state[sku][0] -= q
        elif t == "rename":
            to = sku_field(e, "to")
            if to is None:
                out("error: bad event %d" % n); return
            if sku not in state or to in state:
                out("error: rejected event %d" % n); return
            order[order.index(sku)] = to
            state[to] = state.pop(sku)
        else:
            if "price" not in e:
                out("error: bad event %d" % n); return
            p = e["price"]
            if p is not None:
                if not isnum(p):
                    out("error: bad event %d" % n); return
                p = Decimal(p)
                if p < 0 or p > 1000000 or p != p.quantize(Decimal("0.01")):
                    out("error: bad event %d" % n); return
            if sku not in state:
                out("error: rejected event %d" % n); return
            state[sku][1] = p
    parts = []
    for s in order:
        q, p = state[s]
        parts.append(json.dumps(s, ensure_ascii=False) + ':{"qty":%d,"price":%s}' % (q, "null" if p is None else fmt(p)))
    out("{" + ",".join(parts) + "}")
    prices = [state[s][1] for s in order if state[s][1] is not None]
    if not prices:
        out("avg price none")
    else:
        avg = (sum(prices) / len(prices)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        out("avg price %s" % format(avg, "f"))

main()
