import json, sys

def bad(msg):
    print(msg)
    sys.exit(0)

def load(text):
    try:
        return json.loads(text, parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
    except ValueError:
        bad('error: bad json')

base, over = load(sys.argv[1]), load(sys.argv[2])
if not isinstance(base, dict) or not isinstance(over, dict):
    bad('error: not an object')

def merge(b, o):
    out = dict(b)
    for k, v in o.items():
        if v is None:
            out.pop(k, None)
        elif isinstance(v, dict):
            out[k] = merge(out[k] if isinstance(out.get(k), dict) else {}, v)
        else:
            out[k] = v
    return out

def num(x):
    if isinstance(x, int):
        return str(x)
    if x == int(x):
        return str(int(x))
    return repr(x)

def esc(s):
    out = []
    for ch in s:
        c = ord(ch)
        if ch == '"': out.append('\\"')
        elif ch == '\\': out.append('\\\\')
        elif ch == '\b': out.append('\\b')
        elif ch == '\f': out.append('\\f')
        elif ch == '\n': out.append('\\n')
        elif ch == '\r': out.append('\\r')
        elif ch == '\t': out.append('\\t')
        elif c < 0x20: out.append('\\u%04x' % c)
        else: out.append(ch)
    return '"' + ''.join(out) + '"'

def dump(v):
    if v is None: return 'null'
    if v is True: return 'true'
    if v is False: return 'false'
    if isinstance(v, (int, float)): return num(v)
    if isinstance(v, str): return esc(v)
    if isinstance(v, list): return '[' + ','.join(dump(x) for x in v) + ']'
    return '{' + ','.join(esc(k) + ':' + dump(v[k]) for k in sorted(v)) + '}'

print(dump(merge(base, over)))
