import sys,re
s=sys.argv[1]
if s.strip()=="": print(""); sys.exit()
iv=[]
for p in s.split(","):
    m=re.fullmatch(r"(\d+)-(\d+)",p)
    if not m or int(m.group(1))>int(m.group(2)): print("error: bad interval "+p); sys.exit()
    iv.append((int(m.group(1)),int(m.group(2))))
iv.sort()
out=[]
for a,b in iv:
    if out and a<=out[-1][1]+1: out[-1][1]=max(out[-1][1],b)
    else: out.append([a,b])
print(",".join(f"{a}-{b}" for a,b in out))
