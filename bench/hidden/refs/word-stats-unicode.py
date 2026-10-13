import sys, unicodedata, re
text, n = sys.argv[1], sys.argv[2]
if not re.fullmatch(r'[0-9]+', n) or int(n) < 1: print('error: bad count'); sys.exit(0)
n = int(n)
words, cur = [], ''
for ch in text:
    c = unicodedata.category(ch)
    if c[0] == 'L' or (c[0] == 'M' and cur): cur += ch
    else:
        if cur: words.append(cur)
        cur = ''
if cur: words.append(cur)
cnt = {}
for w in words: cnt[w.lower()] = cnt.get(w.lower(), 0) + 1
if not cnt: print('no words'); sys.exit(0)
for w, c in sorted(cnt.items(), key=lambda kv: (-kv[1], [ord(x) for x in kv[0]]))[:n]: print(f'{w} {c}')
