import sys, re
from urllib.parse import quote
def enc(s): return quote(s, safe="-_.!~*'()")
def dec(s):
    # strict percent-decoding: %XX must be hex and the bytes must be valid UTF-8
    if re.search(r'%(?![0-9A-Fa-f]{2})', s): raise ValueError
    b = bytearray(); i = 0; raw = s.encode('utf-8')
    out = re.sub(rb'%([0-9A-Fa-f]{2})', lambda m: bytes([int(m.group(1), 16)]), raw)
    return out.decode('utf-8')  # raises on invalid UTF-8
def norm(u):
    if re.search(r'\s', u) or '://' not in u: return 'error: bad url'
    scheme, rest = u.split('://', 1)
    scheme = scheme.lower()
    if scheme not in ('http', 'https'): return 'error: bad scheme'
    rest = rest.split('#', 1)[0]
    m = re.match(r'^([^/?]*)(/[^?]*)?(?:\?(.*))?$', rest, re.S)
    auth, path, query = m.group(1), m.group(2) or '/', m.group(3)
    host, port = auth, None
    if ':' in auth: host, port = auth.rsplit(':', 1)
    if not re.fullmatch(r'[A-Za-z0-9.-]+', host): return 'error: bad host'
    host = host.lower()
    ps = ''
    if port is not None:
        if not re.fullmatch(r'[0-9]+', port) or not (1 <= int(port) <= 65535): return 'error: bad port'
        if int(port) != (80 if scheme == 'http' else 443): ps = ':' + str(int(port))
    try:
        path = '/'.join(enc(dec(s)) for s in path.split('/'))
        groups = {}
        for piece in (query or '').split('&'):
            if piece == '': continue
            k, _, v = piece.partition('=')
            groups.setdefault(dec(k.replace('+', ' ')), []).append(dec(v.replace('+', ' ')))
    except ValueError:
        return 'error: bad escape'
    out = f'{scheme}://{host}{ps}{path}'
    if groups: out += '?' + '&'.join(f'{enc(k)}={enc(",".join(groups[k]))}' for k in sorted(groups))
    return out
for a in sys.argv[1:]: print(norm(a))
