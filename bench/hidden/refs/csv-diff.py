import sys
def load(t):
    L=[l for l in t.split("\n") if l!=""]
    h=L[0].split(","); rows={}
    for l in L[1:]:
        f=l.split(","); rows[f[0]]=f
    return h,rows
h1,a=load(sys.argv[1]); h2,b=load(sys.argv[2])
if h1!=h2: print("error: headers differ"); sys.exit()
out=[]
for k in sorted(set(a)|set(b)):
    if k not in a: out.append("+ "+k)
    elif k not in b: out.append("- "+k)
    else:
        for i,c in enumerate(h1[1:],1):
            if a[k][i]!=b[k][i]: out.append(f"~ {k}: {c} {a[k][i]} -> {b[k][i]}")
print("\n".join(out) if out else "no changes")
