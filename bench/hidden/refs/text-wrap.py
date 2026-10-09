import sys
t,w=sys.argv[1],sys.argv[2]
if not w.isdigit() or int(w)<1: print("error: bad width"); sys.exit()
w=int(w); words=t.split()
lines=[];cur=""
for x in words:
    if cur=="": cur=x
    elif len(cur)+1+len(x)<=w: cur+=" "+x
    else: lines.append(cur); cur=x
if cur: lines.append(cur)
for i,l in enumerate(lines,1): print(f"{i}: {l}")
