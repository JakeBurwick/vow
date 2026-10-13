import sys, re
NAME = re.compile(r'^[a-z][a-z0-9_]*$')
acc = {}
def amount(t):
    if not re.fullmatch(r'[0-9]{1,12}', t) or int(t) == 0: return None
    return int(t)
for raw in sys.stdin.read().split('\n'):
    line = raw.strip()
    if line == '': continue
    p = line.split()
    v = p[0]
    shape = {'deposit': 3, 'withdraw': 3, 'transfer': 4, 'balance': 2}
    if v not in shape or len(p) != shape[v] or not all(NAME.match(x) for x in (p[1:3] if v == 'transfer' else p[1:2])):
        print('error: bad command ' + ' '.join(p)); continue
    if v != 'balance':
        a = amount(p[-1])
        if a is None: print('error: bad amount ' + p[-1]); continue
    if v == 'deposit':
        acc[p[1]] = acc.get(p[1], 0) + a; print('ok')
    elif v == 'balance':
        if p[1] not in acc: print('error: unknown account ' + p[1])
        else: print(f'{p[1]}: {acc[p[1]]}')
    elif v == 'withdraw':
        if p[1] not in acc: print('error: unknown account ' + p[1])
        elif acc[p[1]] < a: print('error: insufficient funds ' + p[1])
        else: acc[p[1]] -= a; print('ok')
    else:
        f, t = p[1], p[2]
        if f not in acc: print('error: unknown account ' + f)
        elif t not in acc: print('error: unknown account ' + t)
        elif f == t: print('error: same account')
        elif acc[f] < a: print('error: insufficient funds ' + f)
        else: acc[f] -= a; acc[t] += a; print('ok')
print('== summary ==')
if not acc: print('(no accounts)')
for k in sorted(acc): print(f'{k} {acc[k]}')
