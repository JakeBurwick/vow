import sys, json, re
def fail(m): print('error: ' + m); sys.exit(0)
try: doc = json.loads(sys.argv[1])
except Exception: fail('bad document')
if not isinstance(doc, dict): fail('bad document')
try: ops = json.loads(sys.argv[2])
except Exception: fail('bad patch')
if not isinstance(ops, list): fail('bad patch')
IDX = re.compile(r'^(0|[1-9][0-9]*)$')
def merge(a, b):
    for k, v in b.items():
        if k in a and isinstance(a[k], dict) and isinstance(v, dict): merge(a[k], v)
        else: a[k] = v
for n, op in enumerate(ops, 1):
    def f(m): fail(f'op {n}: {m}')
    if not isinstance(op, dict) or op.get('op') not in ('set', 'delete', 'merge', 'append') or not isinstance(op.get('path'), str): f('bad op')
    kind, path = op['op'], op['path']
    if kind != 'delete' and 'value' not in op: f('bad op')
    if kind == 'merge' and not isinstance(op['value'], dict): f('bad op')
    segs = path.split('.') if path != '' else []
    if (path == '' and kind != 'merge') or any(s == '' for s in segs): f('bad path ' + path)
    def step(cur, s):
        if isinstance(cur, dict) and s in cur: return cur[s]
        if isinstance(cur, list) and IDX.match(s) and int(s) < len(cur): return cur[int(s)]
        f('no such path ' + path)
    if kind in ('merge', 'append'):
        t = doc
        for s in segs: t = step(t, s)
        if kind == 'merge':
            if not isinstance(t, dict): f('not an object ' + path)
            merge(t, op['value'])
        else:
            if not isinstance(t, list): f('not a list ' + path)
            t.append(op['value'])
        continue
    par = doc
    for s in segs[:-1]: par = step(par, s)
    last = segs[-1]
    if kind == 'set':
        if isinstance(par, dict): par[last] = op['value']
        elif isinstance(par, list) and IDX.match(last) and int(last) < len(par): par[int(last)] = op['value']
        else: f('no such path ' + path)
    else:
        if isinstance(par, dict) and last in par: del par[last]
        elif isinstance(par, list) and IDX.match(last) and int(last) < len(par): del par[int(last)]
        else: f('no such path ' + path)
print(json.dumps(doc, indent=2, ensure_ascii=False))
