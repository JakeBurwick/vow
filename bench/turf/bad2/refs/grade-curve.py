# Grade curve: percent and letter per student, class average. Fails loudly on any record it cannot read.
import json, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def whole(v):
    return not isinstance(v, bool) and (isinstance(v, int) or (isinstance(v, float) and v.is_integer()))

if len(sys.argv) < 2:
    fail("missing argument")
try:
    data = json.loads(sys.argv[1])
except ValueError as e:
    fail(f"invalid JSON: {e}")
if not isinstance(data, dict):
    fail("expected a JSON object")
mx = data.get("max")
if not whole(mx) or mx <= 0:
    fail(f"bad max {json.dumps(mx)}")
mx = int(mx)
students = data.get("students")
if not isinstance(students, list):
    fail("missing students list")
if not students:
    fail("no students, class avg is undefined")
rows = []
for i, s in enumerate(students, 1):
    if not isinstance(s, dict):
        fail(f"student {i}: expected an object")
    name, scores = s.get("name"), s.get("scores")
    if not isinstance(name, str):
        fail(f"student {i}: missing name")
    if not isinstance(scores, list):
        fail(f"student {i}: missing scores")
    if not scores:
        fail(f"student {i} ({name}): no scores, mean is undefined")
    for x in scores:
        if not whole(x) or x < 0:
            fail(f"student {i} ({name}): bad score {json.dumps(x)}")
    S, n = int(sum(scores)), len(scores)
    t = (2000 * S + n * mx) // (2 * n * mx)
    rows.append((name, t))

def letter(t):
    return "A" if t >= 900 else "B" if t >= 800 else "C" if t >= 700 else "D" if t >= 600 else "F"

rows.sort(key=lambda r: r[0])
rows.sort(key=lambda r: -r[1])
for name, t in rows:
    print(f"{name} {t // 10}.{t % 10} {letter(t)}")
k, T = len(rows), sum(r[1] for r in rows)
a = (2 * T + k) // (2 * k)
print(f"class avg {a // 10}.{a % 10}")
