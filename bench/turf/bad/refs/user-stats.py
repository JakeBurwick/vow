# User stats: per-plan count and mean age, oldest user, signups per month. Fails loudly on any record it cannot read.
import datetime, json, re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) < 2:
    fail("missing argument")
try:
    data = json.loads(sys.argv[1])
except ValueError as e:
    fail(f"invalid JSON: {e}")
if not isinstance(data, list):
    fail("expected a JSON array")
if not data:
    fail("no users, there is no oldest user")

def whole(v):
    return isinstance(v, int) and not isinstance(v, bool)

users = []
for i, u in enumerate(data, 1):
    if not isinstance(u, dict):
        fail(f"user {i}: expected an object")
    for k in ("id", "name", "age", "plan", "signup"):
        if k not in u or u[k] is None:
            fail(f"user {i}: missing {k}")
    if not whole(u["id"]):
        fail(f"user {i}: bad id")
    age = u["age"]
    if isinstance(age, float) and age.is_integer():
        age = int(age)
    if not whole(age) or age < 0:
        fail(f"user {i}: bad age {u['age']!r}")
    if not isinstance(u["name"], str) or not isinstance(u["plan"], str):
        fail(f"user {i}: name and plan must be strings")
    s = u["signup"]
    if not isinstance(s, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", s):
        fail(f"user {i}: bad signup {s!r}")
    try:
        datetime.date(int(s[:4]), int(s[5:7]), int(s[8:]))
    except ValueError:
        fail(f"user {i}: invalid signup date {s!r}")
    users.append((u["id"], u["name"], age, u["plan"], s[:7]))

plans, months = {}, {}
for uid, name, age, plan, month in users:
    c, a = plans.get(plan, (0, 0))
    plans[plan] = (c + 1, a + age)
    months[month] = months.get(month, 0) + 1
for plan in sorted(plans):
    c, a = plans[plan]
    t = (20 * a + c) // (2 * c)
    print(f"{plan} {c} {t // 10}.{t % 10}")
oldest = min(users, key=lambda u: (-u[2], u[0]))
print(f"oldest {oldest[0]} {oldest[1]}")
for m in sorted(months):
    print(m, months[m])
