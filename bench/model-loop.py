# Cross-model benchmark: drive any chat model through the same write -> judge -> fix
# loop the Claude agents used, for Vow (guide + examples) and TypeScript (spec only).
#
#   python3 bench/model-loop.py ollama:llama3.2:3b
#   python3 bench/model-loop.py gemini:gemini-flash-latest [task ...]
#
# Results append to bench/log/model-loop.jsonl; judge attempts are logged as usual
# with tag model-<name>-<lang>.
import json, os, re, subprocess, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
TASKS = ["interval-merge", "roman", "csv-diff", "text-wrap", "dep-order", "calc-vars", "template", "ini-config"]
MAX_TRIES = 5

def read(p): return open(os.path.join(ROOT, p)).read()

def ollama_chat(model, messages):
    body = json.dumps({"model": model, "messages": messages, "stream": False,
                       "options": {"num_ctx": 32768, "temperature": 0.2}}).encode()
    req = urllib.request.Request("http://localhost:11434/api/chat", body, {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=900))["message"]["content"]

def gemini_chat(model, messages):
    key = os.environ.get("GEMINI_API_KEY") or dict(
        l.strip().split("=", 1) for l in open(os.path.expanduser("~/.gemini/.env")) if "=" in l)["GEMINI_API_KEY"]
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                for m in messages if m["role"] != "system"]
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    body = {"contents": contents, "generationConfig": {"temperature": 0.2}}
    if system: body["systemInstruction"] = {"parts": [{"text": system}]}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    for wait in [0, 20, 60, 120]:
        if wait: time.sleep(wait)
        try:
            req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": key})
            d = json.load(urllib.request.urlopen(req, timeout=180))
            return d["candidates"][0]["content"]["parts"][0]["text"]
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, KeyError) as e:
            last = e
    raise RuntimeError(f"gemini unavailable: {last}")

def extract_code(text, lang):
    blocks = re.findall(r"```[a-zA-Z]*\n(.*?)```", text, re.S)
    return (blocks[-1] if blocks else text).strip() + "\n"

def judge(task, path, tag):
    env = dict(os.environ, VOW_BENCH_TAG=tag)
    r = subprocess.run(["node", "bench/run.js", task, path], cwd=ROOT, capture_output=True, text=True, timeout=180, env=env)
    out = (r.stdout + r.stderr).strip()
    return out.startswith("PASS"), out

def run(provider, model, task, lang):
    chat = ollama_chat if provider == "ollama" else gemini_chat
    spec = subprocess.run(["node", "bench/run.js", task, "--spec"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if lang == "vow":
        system = ("You write programs in Vow, a new programming language. Everything you know about Vow is in this guide "
                  "and these verified example programs. Follow them exactly.\n\n" + read("bench/VOW_GUIDE.md") +
                  "\n\n" + read("bench/EXAMPLES.md"))
        ask = (f"Write a Vow program for this task. Command-line arguments come from args().\n\nTask:\n{spec}\n\n"
               "Reply with only the complete program in one ```vow code block.")
        ext = "vow"
    else:
        system = "You write TypeScript programs that run under Deno."
        ask = (f"Write a TypeScript program for Deno for this task. Command-line arguments are in Deno.args; print with console.log.\n\n"
               f"Task:\n{spec}\n\nReply with only the complete program in one ```ts code block.")
        ext = "ts"
    safe = re.sub(r"[^a-z0-9]+", "-", model.lower())
    tag = f"model-{safe}-{lang}"
    path = f"bench/scratch/ml-{safe}-{task}.{ext}"
    messages = [{"role": "system", "content": system}, {"role": "user", "content": ask}]
    for attempt in range(1, MAX_TRIES + 1):
        reply = chat(model, messages)
        open(os.path.join(ROOT, path), "w").write(extract_code(reply, lang))
        ok, out = judge(task, path, tag)
        if ok: return attempt, True
        messages += [{"role": "assistant", "content": reply},
                     {"role": "user", "content": "The judge says:\n" + out[:3000] +
                      "\n\nFix the program. Reply with the complete corrected program in one code block."}]
    return MAX_TRIES, False

if __name__ == "__main__":
    provider, model = sys.argv[1].split(":", 1)
    tasks = sys.argv[2:] or TASKS
    for task in tasks:
        for lang in ["vow", "ts"]:
            t0 = time.time()
            try:
                tries, ok = run(provider, model, task, lang)
            except Exception as e:
                tries, ok = None, None
                print(f"{task:15} {lang:3} ERROR {e}", flush=True)
            rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "model": f"{provider}:{model}", "task": task,
                   "lang": lang, "tries": tries, "pass": ok, "seconds": round(time.time() - t0)}
            open(os.path.join(HERE, "log", "model-loop.jsonl"), "a").write(json.dumps(rec) + "\n")
            if tries is not None:
                print(f"{task:15} {lang:3} {'PASS' if ok else 'FAIL'} in {tries} tries ({rec['seconds']}s)", flush=True)
