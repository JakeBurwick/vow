import sys
import json
from collections import OrderedDict

def flatten_json(obj, prefix=''):
    """Flatten a JSON object into paths and leaf values, in visit order."""
    result = OrderedDict()

    if isinstance(obj, dict):
        # Sort keys alphabetically for visitation
        for key in sorted(obj.keys()):
            value = obj[key]
            new_prefix = f"{prefix}.{key}" if prefix else key

            if isinstance(value, (dict, list)):
                if len(value) == 0:
                    # Empty dict or list is a leaf
                    result[new_prefix] = value
                else:
                    # Recurse
                    result.update(flatten_json(value, new_prefix))
            else:
                # Leaf value (string, number, boolean, null)
                result[new_prefix] = value

    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            new_prefix = f"{prefix}[{i}]"

            if isinstance(value, (dict, list)):
                if len(value) == 0:
                    # Empty dict or list is a leaf
                    result[new_prefix] = value
                else:
                    # Recurse
                    result.update(flatten_json(value, new_prefix))
            else:
                # Leaf value (string, number, boolean, null)
                result[new_prefix] = value

    return result

def serialize_value(v):
    """Serialize a leaf value to JSON string."""
    if v is None:
        return 'null'
    elif isinstance(v, bool):
        return 'true' if v else 'false'
    elif isinstance(v, (int, float)):
        # Numbers with no fractional part should not have decimal point
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        else:
            return json.dumps(v)
    elif isinstance(v, str):
        return json.dumps(v)
    elif isinstance(v, dict):
        return json.dumps(v, separators=(',', ':'))
    elif isinstance(v, list):
        return json.dumps(v, separators=(',', ':'))

def main():
    json_str = sys.argv[1]

    try:
        obj = json.loads(json_str)
    except json.JSONDecodeError:
        print('{"error":"bad json"}')
        return

    # Check if top level is object or array
    if not isinstance(obj, (dict, list)):
        print('{"error":"not a container"}')
        return

    # Handle empty object or array
    if isinstance(obj, (dict, list)) and len(obj) == 0:
        print('{}')
        return

    # Flatten
    flattened = flatten_json(obj)

    # Build the JSON string manually to preserve visit order
    parts = []
    for path, value in flattened.items():
        path_str = json.dumps(path)
        value_str = serialize_value(value)
        parts.append(f'{path_str}:{value_str}')

    result_str = '{' + ','.join(parts) + '}'
    print(result_str)

if __name__ == '__main__':
    main()
