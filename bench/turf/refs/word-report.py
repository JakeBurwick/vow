import re, sys, unicodedata

arg = sys.argv[1] if len(sys.argv) > 1 else ''
if not re.fullmatch(r'[0-9]+', arg, re.ASCII) or not 1 <= int(arg) <= 1000:
    print('error: bad n')
    sys.exit(0)
n = int(arg)

def cat(ch):
    return unicodedata.category(ch)

def wordch(ch):
    c = cat(ch)
    return c[0] == 'L' or c == 'Nd'

text = sys.stdin.read()
counts = {}
i, L = 0, len(text)
while i < L:
    if not wordch(text[i]):
        i += 1
        continue
    buf = []
    while i < L:
        ch = text[i]
        if wordch(ch) or (cat(ch)[0] == 'M'):
            buf.append(ch)
            i += 1
        elif ch in "'’" and i + 1 < L and wordch(text[i + 1]):
            buf.append("'")
            i += 1
        else:
            break
    w = unicodedata.normalize('NFC', ''.join(buf)).lower()
    counts[w] = counts.get(w, 0) + 1

if not counts:
    print('no words')
    sys.exit(0)
top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
width = max(len(w) for w, _ in top)
for w, c in top:
    print(w + ' ' * (width - len(w)) + ' ' + str(c))
