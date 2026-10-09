#!/usr/bin/env python3
import json
import sys

if len(sys.argv) < 2:
    arg = ""
else:
    arg = sys.argv[1]

if not arg:
    print("{}")
else:
    pairs = arg.split(",")
    result = {}
    error = None

    for pair in pairs:
        if ":" not in pair:
            error = pair
            break

        parts = pair.split(":", 1)
        name = parts[0]
        amount_str = parts[1]

        try:
            amount = int(amount_str)
        except ValueError:
            error = pair
            break

        result[name] = amount

    if error:
        print(json.dumps({"error": f"bad pair: {error}"}, separators=(',', ':')))
    else:
        print(json.dumps(result, separators=(',', ':')))
