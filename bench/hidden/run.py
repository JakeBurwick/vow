# Hidden-test robustness check: run every passing Vow and TypeScript solution for the 8
# held-out tasks against fresh generated inputs, compared to the Python reference.
import random, subprocess, sys, json, glob, os
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import gen
gen.REFS = os.path.join(HERE, "refs") + "/"
N = int(os.environ.get("HIDDEN_N", "150"))

def run(cmd, timeout=10):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=ROOT)
        return r.stdout.rstrip("\n")
    except subprocess.TimeoutExpired:
        return "<timeout>"

results = {}
for task, g in gen.GENS.items():
    r = random.Random("hidden-" + task)
    seen, inputs = set(), []
    while len(inputs) < N:
        a = g(r); k = json.dumps(a)
        if k in seen: continue
        seen.add(k); inputs.append(a)
    ref = os.path.join(HERE, "refs", task + ".py")
    with ThreadPoolExecutor(8) as ex:
        expected = list(ex.map(lambda a: run([sys.executable, ref, *a]), inputs))
    # HIDDEN_VOW_SINCE=<epoch ms>: only score Vow solutions saved after that time (corpus files are named by timestamp)
    since = int(os.environ.get("HIDDEN_VOW_SINCE", "0"))
    vows = [s for s in sorted(glob.glob(f"{ROOT}/bench/corpus/{task}/*.vow")) if int(os.path.basename(s).split(".")[0]) > since]
    sols = vows + sorted(glob.glob(f"{ROOT}/bench/corpus/{task}/*.ts"))
    results[task] = []
    for s in sols:
        lang = "vow" if s.endswith(".vow") else "ts"
        cmd = ["node", "cli.js", s] if lang == "vow" else ["deno", "run", "--no-prompt", "--allow-env", "-q", s]
        with ThreadPoolExecutor(8) as ex:
            got = list(ex.map(lambda a: run(cmd + a), inputs))
        fails = [i for i in range(N) if got[i] != expected[i]]
        ex1 = None
        if fails:
            i = fails[0]; ex1 = {"args": inputs[i], "expected": expected[i][:200], "got": got[i][:200]}
        results[task].append({"file": os.path.relpath(s, ROOT), "lang": lang, "passed": N - len(fails), "n": N, "example": ex1})
        print(f"{task:15} {lang:3} {N-len(fails):4}/{N}  {os.path.basename(s)}", flush=True)
json.dump(results, open(os.path.join(HERE, "results.json"), "w"), indent=1)
print("\nSUMMARY (mean hidden-test pass rate, fully-correct solutions)")
tot = {"vow": [0, 0, 0], "ts": [0, 0, 0]}
for task, rs in results.items():
    line = f"{task:15}"
    for lang in ("vow", "ts"):
        x = [q for q in rs if q["lang"] == lang]
        if not x: continue
        rate = sum(q["passed"] for q in x) / sum(q["n"] for q in x)
        perfect = sum(q["passed"] == q["n"] for q in x)
        line += f"  {lang}: {rate*100:5.1f}% ({perfect}/{len(x)} perfect)"
        tot[lang][0] += sum(q["passed"] for q in x); tot[lang][1] += sum(q["n"] for q in x); tot[lang][2] += 0
    print(line)
for lang in ("vow", "ts"):
    p, n, _ = tot[lang]; print(f"OVERALL {lang}: {p/n*100:.1f}% of hidden tests")
