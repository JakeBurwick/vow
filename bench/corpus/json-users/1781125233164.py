import json
import sys

try:
    # Read the first CLI argument
    data = json.loads(sys.argv[1])

    # Check that it's an array
    if not isinstance(data, list):
        print("invalid")
        sys.exit(0)

    # Process each element
    for item in data:
        # Check that item is a dict
        if not isinstance(item, dict):
            print("invalid")
            sys.exit(0)

        # Check that it has both "name" and "age" fields
        if "name" not in item or "age" not in item:
            print("invalid")
            sys.exit(0)

        # Check that name is a string and age is a number
        if not isinstance(item["name"], str) or not isinstance(item["age"], (int, float)):
            print("invalid")
            sys.exit(0)

        # Check if age is an integer (JSON numbers can be floats)
        if isinstance(item["age"], float) and item["age"] != int(item["age"]):
            print("invalid")
            sys.exit(0)

        # Print name if age >= 18
        if item["age"] >= 18:
            print(item["name"])

except (json.JSONDecodeError, IndexError, TypeError, KeyError):
    print("invalid")
