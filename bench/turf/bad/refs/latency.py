# Latency report: per-path count/mean/max, p95 (nearest rank), 5xx count. Fails loudly on any line it cannot read.
import re, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

paths, all_ms, errors = {}, [], 0
for n, line in enumerate(sys.stdin.read().split("\n"), 1):
    if line == "":
        continue
    f = line.split(" ")
    if len(f) != 5:
        fail(f"line {n}: expected 5 fields, got {len(f)}")
    ts, method, path, status, dur = f
    if not path.startswith("/"):
        fail(f"line {n}: bad path {path!r}")
    if not re.fullmatch(r"[0-9]{3}", status):
        fail(f"line {n}: bad status {status!r}")
    m = re.fullmatch(r"([0-9]+)ms", dur)
    if not m:
        fail(f"line {n}: bad duration {dur!r}")
    ms = int(m[1])
    paths.setdefault(path, []).append(ms)
    all_ms.append(ms)
    if int(status) >= 500:
        errors += 1
if not all_ms:
    fail("no requests, p95 is undefined")
for path in sorted(paths):
    d = paths[path]
    t = (20 * sum(d) + len(d)) // (2 * len(d))
    print(f"{path} {len(d)} {t // 10}.{t % 10} {max(d)}")
all_ms.sort()
print("p95", all_ms[(95 * len(all_ms) + 99) // 100 - 1])
print("errors", errors)
