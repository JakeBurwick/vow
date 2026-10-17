import sys, io, csv, re
from fractions import Fraction

def rows_of(text):
    if text.startswith('﻿'):
        text = text[1:]
    return [r for r in csv.reader(io.StringIO(text, newline='')) if r != []]

def tenths(t):
    return f'{t // 10}.{t % 10}'

def main():
    rows = rows_of(sys.stdin.buffer.read().decode('utf-8'))
    if not rows:
        print('no data'); return
    hdr = [h.strip(' \t') for h in rows[0]]
    need = ['student', 'assignment', 'score']
    if any(k not in hdr for k in need):
        print('error: header'); return
    ix = {k: hdr.index(k) for k in need}
    data = rows[1:]
    if not data:
        print('no data'); return
    scores = {}
    for n, r in enumerate(data, 1):
        if len(r) != len(hdr):
            print(f'error: row {n}'); return
        st = r[ix['student']].strip(' \t')
        s = r[ix['score']].strip(' \t')
        if st == '':
            print(f'error: row {n}'); return
        lst = scores.setdefault(st, [])
        if s.lower() in ('', 'n/a', 'nan', 'abs'):
            continue
        m = re.fullmatch(r'([0-9]+)(?:\.([0-9]{1,2}))?', s)
        if not m:
            print(f'error: row {n}'); return
        h = int(m.group(1)) * 100 + int((m.group(2) or '').ljust(2, '0'))
        if h > 10000:
            print(f'error: row {n}'); return
        lst.append(h)
    allv = []
    for st in sorted(scores):
        l = scores[st]
        if not l:
            print(f'{st} -')
        else:
            S, c = sum(l), len(l)
            print(f'{st} {tenths((2 * S + 10 * c) // (20 * c))}')
        allv += l
    allv.sort()
    m = len(allv)
    if m == 0:
        print('median -')
    elif m % 2 == 1:
        print(f'median {tenths((allv[m // 2] + 5) // 10)}')
    else:
        print(f'median {tenths((allv[m // 2 - 1] + allv[m // 2] + 10) // 20)}')
    ranked = sorted((st for st in scores if scores[st]), key=lambda st: (-Fraction(sum(scores[st]), len(scores[st])), st))
    print('top ' + (', '.join(ranked[:3]) if ranked else '-'))

main()
