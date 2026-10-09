import json
import sys


def main():
    try:
        data = json.loads(sys.argv[1])
    except Exception:
        print("invalid")
        return
    if not isinstance(data, list):
        print("invalid")
        return
    names = []
    for item in data:
        if not isinstance(item, dict):
            print("invalid")
            return
        name = item.get("name")
        age = item.get("age")
        if "name" not in item or "age" not in item:
            print("invalid")
            return
        if not isinstance(name, str):
            print("invalid")
            return
        if isinstance(age, bool) or not isinstance(age, (int, float)):
            print("invalid")
            return
        if age >= 18:
            names.append(name)
    for n in names:
        print(n)


main()
