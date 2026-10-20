import json, sys
order = json.loads(sys.argv[1])
print(f"order {order['id']}")
