# Clinic day: visits, wait and care minutes per doctor, longest wait, last patient out. Fails loudly on any record it cannot read.
import json, re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def hm(v, key, where):
    t = v.get(key)
    if not isinstance(t, str):
        fail(f"{where}: missing or bad {key} time {json.dumps(t)}")
    m = re.fullmatch(r"([01][0-9]|2[0-3]):([0-5][0-9])", t)
    if not m:
        fail(f"{where}: bad {key} time {t!r}")
    return int(m.group(1)) * 60 + int(m.group(2))

if len(sys.argv) < 2:
    fail("missing argument")
try:
    data = json.loads(sys.argv[1])
except ValueError as e:
    fail(f"invalid JSON: {e}")
if not isinstance(data, dict):
    fail("expected a JSON object")
doctors, visits = data.get("doctors"), data.get("visits")
if not isinstance(doctors, list) or not all(isinstance(d, str) and d != "" for d in doctors):
    fail("missing or bad doctors list")
if len(set(doctors)) != len(doctors):
    fail("a doctor is listed twice")
if not isinstance(visits, list):
    fail("missing visits list")
per = {d: [] for d in doctors}
rows = []
for i, v in enumerate(visits, 1):
    w = f"visit {i}"
    if not isinstance(v, dict):
        fail(f"{w}: expected an object")
    p, d = v.get("patient"), v.get("doctor")
    if not isinstance(p, str) or p == "":
        fail(f"{w}: missing patient")
    if not isinstance(d, str) or d not in per:
        fail(f"{w}: doctor {json.dumps(d)} is not one of the doctors")
    a, s, l = hm(v, "arrived", w), hm(v, "seen", w), hm(v, "left", w)
    if s < a:
        fail(f"{w}: {p} is seen before arriving")
    if l <= s:
        fail(f"{w}: {p} leaves before being seen")
    per[d].append((s, l, i))
    rows.append((p, d, a, s, l))
if not rows:
    fail("no visits, there is no longest wait")
for d, vs in per.items():
    vs.sort()
    for x, y in zip(vs, vs[1:]):
        if y[0] < x[1]:
            fail(f"visit {y[2]}: {d} sees a patient before the patient of visit {x[2]} has left")
for d in doctors:
    rs = [r for r in rows if r[1] == d]
    print(d, len(rs), sum(r[3] - r[2] for r in rs), sum(r[4] - r[3] for r in rs))
top = min(rows, key=lambda r: (-(r[3] - r[2]), r[0]))
print("longest-wait", top[0], top[3] - top[2])
last = max(r[4] for r in rows)
print(f"last-out {last // 60:02d}:{last % 60:02d}")
