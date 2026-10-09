import sys
V=[(1000,"M"),(900,"CM"),(500,"D"),(400,"CD"),(100,"C"),(90,"XC"),(50,"L"),(40,"XL"),(10,"X"),(9,"IX"),(5,"V"),(4,"IV"),(1,"I")]
def to_r(n):
    o=""
    for v,r in V:
        while n>=v: o+=r;n-=v
    return o
s=sys.argv[1]
if s.isdigit():
    n=int(s)
    print(to_r(n) if 1<=n<=3999 and s==str(n) else "error")
else:
    m={"I":1,"V":5,"X":10,"L":50,"C":100,"D":500,"M":1000}
    if not s or any(c not in m for c in s): print("error"); sys.exit()
    t=0
    for i,c in enumerate(s):
        if i+1<len(s) and m[c]<m[s[i+1]]: t-=m[c]
        else: t+=m[c]
    print(t if 1<=t<=3999 and to_r(t)==s else "error")
