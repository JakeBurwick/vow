import sys,re
prog=sys.argv[1]
env={}
class E(Exception): pass
def fmt(x):
    return str(int(x)) if x==int(x) else ('%.10g'%x)
def tok(s):
    toks=[];i=0
    while i<len(s):
        c=s[i]
        if c==' ': i+=1; continue
        if c.isdigit():
            j=i
            while j<len(s) and (s[j].isdigit() or s[j]=='.'): j+=1
            t=s[i:j]
            if t.count('.')>1 or t.endswith('.'): raise E('syntax')
            toks.append(('n',float(t))); i=j; continue
        if c.isalpha() or c=='_':
            j=i
            while j<len(s) and (s[j].isalnum() or s[j]=='_'): j+=1
            toks.append(('v',s[i:j])); i=j; continue
        if c in '+-*/()': toks.append(('o',c)); i+=1; continue
        raise E('syntax')
    return toks
def parse(toks):
    pos=[0]
    def peek(): return toks[pos[0]] if pos[0]<len(toks) else None
    def nxt(): t=peek(); pos[0]+=1; return t
    def expr():
        v=term()
        while peek() in (('o','+'),('o','-')):
            o=nxt()[1]; r=term(); v=v+r if o=='+' else v-r
        return v
    def term():
        v=unary()
        while peek() in (('o','*'),('o','/')):
            o=nxt()[1]; r=unary()
            if o=='/':
                if r==0: raise E('div')
                v=v/r
            else: v=v*r
        return v
    def unary():
        if peek()==('o','-'): nxt(); return -unary()
        return atom()
    def atom():
        t=nxt()
        if t is None: raise E('syntax')
        if t[0]=='n': return t[1]
        if t[0]=='v':
            if t[1] not in env: raise E('undef:'+t[1])
            return env[t[1]]
        if t==('o','('):
            v=expr()
            if nxt()!=('o',')'): raise E('syntax')
            return v
        raise E('syntax')
    v=expr()
    if pos[0]!=len(toks): raise E('syntax')
    return v
lines=prog.split("\n")
for n,l in enumerate(lines,1):
    if l.strip()=="": continue
    m=re.fullmatch(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)",l)
    try:
        if not m: raise E('syntax')
        env[m.group(1)]=parse(tok(m.group(2)))
    except E as e:
        k=str(e)
        if k=='div': print(f"error line {n}: division by zero")
        elif k.startswith('undef:'): print(f"error line {n}: unknown variable {k[6:]}")
        else: print(f"error line {n}: syntax")
        sys.exit()
for k in sorted(env): print(f"{k} = {fmt(env[k])}")
