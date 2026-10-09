#!/usr/bin/env python3
import json
import sys

if len(sys.argv) < 2:
    print('{"error":"bad order"}')
    sys.exit(0)

try:
    orders = json.loads(sys.argv[1])
except (json.JSONDecodeError, ValueError):
    print('{"error":"bad order"}')
    sys.exit(0)

# Check if input is an array
if not isinstance(orders, list):
    print('{"error":"bad order"}')
    sys.exit(0)

# Empty array returns empty object
if len(orders) == 0:
    print('{}')
    sys.exit(0)

totals = {}

for order in orders:
    # Each order must be an object (dict)
    if not isinstance(order, dict):
        print('{"error":"bad order"}')
        sys.exit(0)

    # Check if all required fields exist
    if 'item' not in order or 'qty' not in order or 'price' not in order:
        print('{"error":"bad order"}')
        sys.exit(0)

    # Validate field types
    # item must be a string
    if not isinstance(order['item'], str):
        print('{"error":"bad order"}')
        sys.exit(0)

    # qty must be a number (int or float), but not a boolean
    if isinstance(order['qty'], bool) or not isinstance(order['qty'], (int, float)):
        print('{"error":"bad order"}')
        sys.exit(0)

    # price must be a number (int or float), but not a boolean
    if isinstance(order['price'], bool) or not isinstance(order['price'], (int, float)):
        print('{"error":"bad order"}')
        sys.exit(0)

    # Calculate and accumulate revenue
    item = order['item']
    revenue = order['qty'] * order['price']

    if item not in totals:
        totals[item] = 0
    totals[item] += revenue

# Output sorted JSON without spaces
sorted_totals = dict(sorted(totals.items()))
print(json.dumps(sorted_totals, separators=(',', ':')))
