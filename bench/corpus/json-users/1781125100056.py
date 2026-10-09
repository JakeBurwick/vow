import json
import sys

try:
    data = json.loads(sys.argv[1])

    # Validate that it's an array
    if not isinstance(data, list):
        print("invalid")
        sys.exit(0)

    # Process each element
    for item in data:
        # Check if it's a dict and has both required fields
        if not isinstance(item, dict):
            print("invalid")
            sys.exit(0)

        if "name" not in item or "age" not in item:
            print("invalid")
            sys.exit(0)

        # Check field types
        if not isinstance(item["name"], str) or not isinstance(item["age"], (int, float)):
            print("invalid")
            sys.exit(0)

        # If age is a float but not a whole number, it's invalid
        if isinstance(item["age"], float) and item["age"] != int(item["age"]):
            print("invalid")
            sys.exit(0)

        # Print name if age >= 18
        if item["age"] >= 18:
            print(item["name"])

except (json.JSONDecodeError, IndexError, TypeError):
    print("invalid")
