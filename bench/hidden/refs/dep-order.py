import sys,re,heapq
s=sys.argv[1]
deps={}
for part in [p for p in s.split(";") if p.strip()!=""]:
    if part.count(":")!=1: print("error: bad entry "+part); sys.exit()
    name,rest=part.split(":")
    ds=[d for d in rest.split(",") if d!=""]
    if not re.fullmatch(r"[a-z]+",name) or any(not re.fullmatch(r"[a-z]+",d) for d in ds): print("error: bad entry "+part); sys.exit()
    deps.setdefault(name,set()).update(ds)
    for d in ds: deps.setdefault(d,set())
indeg={n:len(v) for n,v in deps.items()}
users={n:[] for n in deps}
for n,v in deps.items():
    for d in v: users[d].append(n)
q=[n for n in deps if indeg[n]==0]; heapq.heapify(q); out=[]
while q:
    n=heapq.heappop(q); out.append(n)
    for u in users[n]:
        indeg[u]-=1
        if indeg[u]==0: heapq.heappush(q,u)
if len(out)<len(deps): print("error: cycle")
else: print(" ".join(out))
