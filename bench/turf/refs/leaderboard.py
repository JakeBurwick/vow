import sys, json, re
from decimal import Decimal
from functools import cmp_to_key

def bad_const(x):
    raise ValueError(x)

def out(s):
    sys.stdout.write(s + "\n")

def fmt(d):
    if d == 0:
        return "0"
    return format(d.normalize(), "f")

def main():
    files = []
    for a in sys.argv[1:3]:
        try:
            j = json.loads(a, parse_float=Decimal, parse_constant=bad_const)
        except Exception:
            out("error: bad json"); return
        if not isinstance(j, dict):
            out("error: bad json"); return
        files.append(j)
    best = {}
    order = []
    badnames = []
    for f in files:
        for name, v in f.items():
            if v is None or (isinstance(v, (int, Decimal)) and not isinstance(v, bool)):
                continue
            if isinstance(v, str) and re.fullmatch(r"-?[0-9]+(\.[0-9]+)?", v):
                continue
            badnames.append(name)
    if badnames:
        out("error: bad score %s" % min(badnames)); return
    for f in files:
        for name, v in f.items():
            if v is None:
                sc = None
            elif isinstance(v, bool):
                out("error: bad score %s" % name); return
            elif isinstance(v, (int, Decimal)):
                sc = Decimal(v)
            elif isinstance(v, str) and re.fullmatch(r"-?[0-9]+(\.[0-9]+)?", v):
                sc = Decimal(v)
            else:
                out("error: bad score %s" % name); return
            if name not in best:
                best[name] = None
                order.append(name)
            if sc is not None and (best[name] is None or sc > best[name]):
                best[name] = sc
    n = sys.argv[3]
    if not re.fullmatch(r"[0-9]+", n) or int(n) < 1:
        out("error: bad n"); return
    n = int(n)
    ranked = [(nm, best[nm]) for nm in order if best[nm] is not None]
    ranked.sort(key=lambda x: x[0])
    ranked.sort(key=lambda x: x[1], reverse=True)
    rank = 0
    for i, (nm, sc) in enumerate(ranked):
        if i == 0 or sc != ranked[i - 1][1]:
            rank = i + 1
        if i >= n:
            break
        out("%d. %s %s" % (rank, nm, fmt(sc)))

main()
