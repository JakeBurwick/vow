import sys, io, csv, re, unicodedata

def rows_of(text):
    if text.startswith('﻿'):
        text = text[1:]
    return [r for r in csv.reader(io.StringIO(text, newline='')) if r != []]

def key(s):
    return unicodedata.normalize('NFC', unicodedata.normalize('NFC', s).casefold())

def main():
    rows = rows_of(sys.stdin.buffer.read().decode('utf-8'))
    if not rows:
        print('no contacts'); return
    hdr = [h.strip(' \t') for h in rows[0]]
    need = ['name', 'email', 'phone']
    if any(k not in hdr for k in need):
        print('error: header'); return
    ix = {k: hdr.index(k) for k in need}
    data = rows[1:]
    if not data:
        print('no contacts'); return
    groups = {}
    for n, r in enumerate(data, 1):
        if len(r) != len(hdr):
            print(f'error: row {n}'); return
        name = unicodedata.normalize('NFC', re.sub(r'[ \t]+', ' ', r[ix['name']].strip(' \t')))
        if name == '':
            print(f'error: row {n}'); return
        ek = key(r[ix['email']].strip(' \t'))
        g = ('e', ek) if ek != '' else ('n', key(name))
        if g not in groups:
            groups[g] = {'name': name, 'email': ek, 'phones': []}
        ph = ''.join(ch for ch in r[ix['phone']] if '0' <= ch <= '9')
        if ph and ph not in groups[g]['phones']:
            groups[g]['phones'].append(ph)
    out = sorted(groups.values(), key=lambda g: (key(g['name']), g['email']))
    for g in out:
        print(f"{g['name']} | {g['email'] or '-'} | {','.join(g['phones']) or '-'}")

main()
