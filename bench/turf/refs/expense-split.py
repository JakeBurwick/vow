import sys, io, csv, re

def rows_of(text):
    if text.startswith('﻿'):
        text = text[1:]
    return [r for r in csv.reader(io.StringIO(text, newline='')) if r != []]

def main():
    rows = rows_of(sys.stdin.buffer.read().decode('utf-8'))
    if not rows:
        print('no expenses'); return
    hdr = [h.strip(' \t') for h in rows[0]]
    need = ['payer', 'amount', 'participants']
    if any(k not in hdr for k in need):
        print('error: header'); return
    ix = {k: hdr.index(k) for k in need}
    data = rows[1:]
    if not data:
        print('no expenses'); return
    net = {}
    for n, r in enumerate(data, 1):
        bad = False
        if len(r) != len(hdr):
            bad = True
        else:
            payer = r[ix['payer']].strip(' \t')
            amt = r[ix['amount']].strip(' \t')
            parts = [p.strip(' \t') for p in r[ix['participants']].split(';')]
            m = re.fullmatch(r'([0-9]+)(?:\.([0-9]{1,2}))?', amt)
            if payer == '' or not m or any(p == '' for p in parts) or len(set(parts)) != len(parts):
                bad = True
            else:
                cents = int(m.group(1)) * 100 + int((m.group(2) or '').ljust(2, '0'))
                if cents <= 0:
                    bad = True
        if bad:
            print(f'error: row {n}'); return
        net[payer] = net.get(payer, 0) + cents
        k = len(parts)
        base, rem = divmod(cents, k)
        for i, p in enumerate(sorted(parts)):
            net[p] = net.get(p, 0) - (base + (1 if i < rem else 0))
    for name in sorted(net):
        v = net[name]
        sign = '+' if v > 0 else ('-' if v < 0 else '')
        a = abs(v)
        print(f'{name} {sign}{a // 100}.{a % 100:02d}')

main()
