import sys,json,re
tpl=sys.argv[1]
try: data=json.loads(sys.argv[2])
except Exception: print("error: bad data"); sys.exit()
if not isinstance(data,dict): print("error: bad data"); sys.exit()
class E(Exception): pass
TOK=re.compile(r"\{\{(.*?)\}\}")
def show(v):
    if v is None: return ""
    if isinstance(v,bool): return "true" if v else "false"
    if isinstance(v,(int,float)): return str(int(v)) if float(v).is_integer() else repr(v)
    if isinstance(v,str): return v
    raise E("not printable")
def parse(i,end_tag):
    nodes=[]
    while True:
        m=TOK.search(tpl,i)
        if not m:
            if end_tag: raise E("unclosed "+end_tag)
            nodes.append(('t',tpl[i:])); return nodes,len(tpl)
        nodes.append(('t',tpl[i:m.start()])); tag=m.group(1).strip(); i=m.end()
        if tag.startswith('#if ') or tag.startswith('#each '):
            kind,name=tag[1:].split(' ',1); name=name.strip()
            body,i=parse(i,kind); nodes.append((kind,name,body))
        elif tag in ('/if','/each'):
            if end_tag!=tag[1:]: raise E("unexpected "+tag)
            return nodes,i
        else: nodes.append(('v',tag))
def lookup(name,ctx):
    if name=='.': return ctx[-1]
    for c in reversed(ctx):
        if isinstance(c,dict) and name in c: return c[name]
    return None
def truthy(v): return not (v is None or v is False or v==0 or v=="" or v==[] or v=={})
def render(nodes,ctx):
    out=""
    for n in nodes:
        if n[0]=='t': out+=n[1]
        elif n[0]=='v': out+=show(lookup(n[1],ctx))
        elif n[0]=='if':
            if truthy(lookup(n[1],ctx)): out+=render(n[2],ctx)
        else:
            v=lookup(n[1],ctx)
            if v is None: continue
            if not isinstance(v,list): raise E("not a list: "+n[1])
            for item in v: out+=render(n[2],ctx+[item])
    return out
try:
    nodes,_=parse(0,None); print(render(nodes,[data]))
except E as e: print("error: "+str(e))
