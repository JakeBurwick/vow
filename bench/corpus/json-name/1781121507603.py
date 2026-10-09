import sys, json
try:
    j = json.loads(sys.argv[1])
    name = j["name"]
    if not isinstance(name, str):
        raise ValueError
    print(name)
except Exception:
    print("no name")
