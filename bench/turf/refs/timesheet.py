import re, sys
from datetime import datetime, timedelta, timezone

TS = re.compile(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?', re.ASCII)

def parse(s):
    m = TS.fullmatch(s)
    if not m:
        return None
    y, mo, d, h, mi, se, z = m.groups()
    tz = timezone.utc
    if z and z != 'Z':
        oh, om = int(z[1:3]), int(z[4:6])
        if oh > 23 or om > 59:
            return None
        off = timedelta(hours=oh, minutes=om)
        tz = timezone(-off if z[0] == '-' else off)
    try:
        t = datetime(int(y), int(mo), int(d), int(h), int(mi), int(se or 0), tzinfo=tz)
    except ValueError:
        return None
    return int(t.timestamp())

shifts = {}
text = sys.stdin.read()
rows = text.split('\n')
if rows and rows[-1] == '':
    rows.pop()
for i, line in enumerate(rows, 1):
    if line.endswith('\r'):
        line = line[:-1]
    if line.strip(' \t') == '':
        continue
    parts = [p.strip(' \t') for p in line.split(',')]
    ok = len(parts) == 3 and parts[0] != ''
    if ok:
        a, b = parse(parts[1]), parse(parts[2])
        ok = a is not None and b is not None and b > a
    if not ok:
        print(f'error: line {i}')
        sys.exit(0)
    shifts.setdefault(parts[0], []).append((a, b))

def covered(iv):
    iv.sort()
    tot, cs, ce = 0, None, None
    for s, e in iv:
        if ce is None or s > ce:
            if ce is not None:
                tot += ce - cs
            cs, ce = s, e
        else:
            ce = max(ce, e)
    if ce is not None:
        tot += ce - cs
    return tot

def hm(sec):
    m = sec // 60
    return f'{m // 60}:{m % 60:02d}'

grand = 0
for name in sorted(shifts):
    s = covered(shifts[name])
    grand += s
    print(f'{name} {hm(s)}')
print(f'total {hm(grand)}')
