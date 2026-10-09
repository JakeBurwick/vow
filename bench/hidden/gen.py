# Hidden-test input generators for the 8 held-out tasks. Deterministic (seeded).
# Every input stays inside the task spec so a correct solution must match the reference.
import random, json, string

def interval_merge(r):
    if r.random() < 0.05: return [""]
    parts = []
    for _ in range(r.randint(1, 6)):
        a = r.randint(0, 30); b = a + r.randint(0, 6)
        parts.append(f"{a}-{b}")
    if r.random() < 0.2:
        bad = r.choice(["x", f"{r.randint(5,9)}-{r.randint(0,4)}", "3", "1-2-3", "", " 1-2", "a-b", "-1-2"])
        parts.insert(r.randint(0, len(parts)), bad)
    return [",".join(parts)]

ROMAN = [(1000,"M"),(900,"CM"),(500,"D"),(400,"CD"),(100,"C"),(90,"XC"),(50,"L"),(40,"XL"),(10,"X"),(9,"IX"),(5,"V"),(4,"IV"),(1,"I")]
def to_roman(n):
    o = ""
    for v, s in ROMAN:
        while n >= v: o += s; n -= v
    return o
def roman(r):
    k = r.random()
    if k < 0.35: return [str(r.randint(1, 3999))]
    if k < 0.65: return [to_roman(r.randint(1, 3999))]
    if k < 0.85: return ["".join(r.choice("IVXLCDM") for _ in range(r.randint(1, 7)))]
    return [r.choice(["0", "4000", "9999", "007", "012", "mmx", "iv", "", "X1", "12a", "IIII", "VV", "IC", "XM", "LL", "DD", "MMMM"])]

def csv_diff(r):
    header = ["id", "a", "b"]
    keys = r.sample(["1", "2", "10", "3", "a", "b", "z9", "k"], r.randint(0, 5))
    old = {k: [r.choice("pqrs"), r.choice("tuv")] for k in keys}
    new = {}
    for k in keys:
        if r.random() < 0.2: continue
        v = list(old[k])
        if r.random() < 0.4: v[r.randint(0, 1)] = r.choice("pqrstuvw")
        new[k] = v
    for k in r.sample(["4", "20", "c", "y"], r.randint(0, 2)): new[k] = [r.choice("pq"), r.choice("tu")]
    def table(h, rows):
        lines = [",".join(h)] + [",".join([k] + v) for k, v in rows.items()]
        if r.random() < 0.2: lines.insert(r.randint(1, len(lines)), "")
        return "\n".join(lines)
    h2 = header if r.random() < 0.9 else ["id", "a", "c"]
    return [table(header, old), table(h2, new)]

def text_wrap(r):
    words = ["".join(r.choice(string.ascii_lowercase) for _ in range(r.randint(1, 12))) for _ in range(r.randint(0, 12))]
    seps = [" ", " ", " ", "  ", "\t", "\n", "   "]
    t = "".join(w + r.choice(seps) for w in words)
    if r.random() < 0.3: t = r.choice(["", " ", "  "]) + t
    w = str(r.randint(1, 20)) if r.random() < 0.85 else r.choice(["0", "-3", "abc", "", "3.5", " 5", "07"])
    return [t, w]

def dep_order(r):
    names = r.sample("abcdefgh", r.randint(1, 6))
    entries = []
    for n in names:
        deps = [d for d in names if d != n and r.random() < 0.3]
        entries.append(n + ":" + ",".join(deps))
    if r.random() < 0.2: entries.append(r.choice(names) + ":" + r.choice(names))
    if r.random() < 0.1: entries.insert(r.randint(0, len(entries)), "")
    if r.random() < 0.15: entries.insert(r.randint(0, len(entries)), r.choice(["Ab:c", "x", "a:b:c", "q1:r", "z:Y"]))
    return [";".join(entries)]

def calc_vars(r):
    for _ in range(100):
        vars_ = []; lines = []
        def expr(d):
            k = r.random()
            if d > 2 or k < 0.35:
                if vars_ and r.random() < 0.4: return r.choice(vars_)
                return str(r.randint(0, 20)) if r.random() < 0.8 else f"{r.randint(0,9)}.{r.choice(['5','25','75'])}"
            if k < 0.45: return "-" + expr(d + 1)
            if k < 0.55: return "(" + expr(d + 1) + ")"
            return expr(d + 1) + " " + r.choice("+-*/") + " " + expr(d + 1)
        for i in range(r.randint(1, 4)):
            name = r.choice("abcd")
            e = expr(0)
            if r.random() < 0.06: e = r.choice(["(1 + 2", "3 +", "q + 1", "2 * * 3", "1 / 0", "4 $ 2"])
            lines.append(f"{name} = {e}")
            vars_.append(name)
            if r.random() < 0.1: lines.append("")
        prog = "\n".join(lines)
        import subprocess, sys
        out = subprocess.run([sys.executable, REFS + "calc-vars.py", prog], capture_output=True, text=True).stdout
        if "e+" in out or "e-" in out or len(out) > 400: continue  # keep numbers in plain notation
        return [prog]
    return ["x = 1"]

def template(r):
    data = {"name": r.choice(["Ada", "Bo", ""]), "vip": r.choice([True, False, 0, 1, "", "yes", None]),
            "xs": r.sample([1, 2, 3.5, "two", True], r.randint(0, 4)),
            "users": [{"name": r.choice("abc"), "admin": r.choice([True, False])} for _ in range(r.randint(0, 3))],
            "n": r.choice([5, 0, 2.5]), "obj": {"a": 1}}
    for k in list(data):
        if r.random() < 0.15: del data[k]
    pieces = ["Hi {{name}}! ", "{{#if vip}}VIP {{/if}}", "{{#each xs}}[{{.}}]{{/each}}", "{{#each users}}{{name}}:{{#if admin}}A{{/if}} {{/each}}",
              "{{ name }}", "{{missing}}", "{{#if xs}}has{{/if}}", "{{#each users}}{{#if admin}}<{{name}}>{{/if}}{{/each}}", "plain {text} ", "{{n}}"]
    tpl = "".join(r.choice(pieces) for _ in range(r.randint(1, 4)))
    if r.random() < 0.15: tpl += r.choice(["{{#if vip}}open", "{{/each}}", "{{#each n}}x{{/each}}", "{{obj}}", "{{#each vip}}y{{/each}}", "{{/if}}"])
    js = json.dumps(data) if r.random() < 0.93 else r.choice(["[1,2]", "nope", "3", "\"s\""])
    return [tpl, js]

def ini_config(r):
    lines = []
    secs = []
    for _ in range(r.randint(0, 8)):
        k = r.random()
        if k < 0.2 or not secs:
            s = r.choice(["db", "app", "x_1", "s"]); secs.append(s); lines.append(f"[{s}]")
        elif k < 0.7: lines.append(f"{r.choice(['host','port','k','name_2'])}{r.choice(['=',' = ','  =  '])}{r.choice(['localhost','5432','','a b',' v '])}")
        elif k < 0.8: lines.append(r.choice(["; c", "# note", "", "   "]))
        elif k < 0.9: lines.append("  " + r.choice(["[app]", "k = v"]) + " ")
        else: lines.append(r.choice(["garbage", "[Bad]", "Key = 1", "[a b]", "=x"]))
    if r.random() < 0.1: lines.insert(0, "k = 1")
    qs = [f"{r.choice(['db','app','x_1','s','nope'])}.{r.choice(['host','port','k','name_2','zz'])}" for _ in range(r.randint(1, 4))]
    return ["\n".join(lines)] + qs

GENS = {"interval-merge": interval_merge, "roman": roman, "csv-diff": csv_diff, "text-wrap": text_wrap,
        "dep-order": dep_order, "calc-vars": calc_vars, "template": template, "ini-config": ini_config}
REFS = ""
