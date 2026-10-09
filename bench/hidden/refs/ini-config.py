import sys,re
text,queries=sys.argv[1],sys.argv[2:]
sec=None;vals={}
for n,l in enumerate(text.split("\n"),1):
    s=l.strip()
    if s=="" or s[0] in ";#": continue
    m=re.fullmatch(r"\[([a-z0-9_]+)\]",s)
    if m: sec=m.group(1); continue
    m=re.fullmatch(r"([a-z0-9_]+)\s*=\s*(.*)",s)
    if m and sec is not None: vals[sec+"."+m.group(1)]=m.group(2).strip(); continue
    print(f"error line {n}: {'key outside section' if m else 'bad line'}"); sys.exit()
for q in queries: print(f"{q} = {vals[q]}" if q in vals else f"{q} missing")
