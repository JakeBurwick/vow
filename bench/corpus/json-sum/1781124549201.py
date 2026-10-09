import json
import sys


def main():
    if len(sys.argv) < 2:
        print("invalid")
        return
    try:
        data = json.loads(sys.argv[1])
    except (ValueError, TypeError):
        print("invalid")
        return
    if not isinstance(data, list):
        print("invalid")
        return
    for item in data:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            print("invalid")
            return
    total = sum(data)
    if isinstance(total, float) and total.is_integer():
        total = int(total)
    print(total)


if __name__ == "__main__":
    main()
