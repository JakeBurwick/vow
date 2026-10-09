#!/usr/bin/env python3
import sys
import re

def is_number(value):
    """Check if a value can be parsed as a number"""
    try:
        float(value)
        return True
    except ValueError:
        return False

def parse_csv(csv_data):
    """Parse CSV data into list of dicts"""
    lines = csv_data.strip().split('\n')
    if not lines:
        return [], []

    header = lines[0].split(',')
    rows = []
    for line in lines[1:]:
        if line:
            values = line.split(',')
            rows.append(dict(zip(header, values)))

    return header, rows

def compare_values(val1, val2, op):
    """Compare two values based on operator. Returns True/False or None for error"""
    is_num1 = is_number(val1)
    is_num2 = is_number(val2)

    # Both are numbers - numeric comparison
    if is_num1 and is_num2:
        num1 = float(val1)
        num2 = float(val2)
        if op == '=':
            return num1 == num2
        elif op == '!=':
            return num1 != num2
        elif op == '<':
            return num1 < num2
        elif op == '>':
            return num1 > num2
        elif op == '<=':
            return num1 <= num2
        elif op == '>=':
            return num1 >= num2
    else:
        # String comparison - only = and != allowed
        if op not in ['=', '!=']:
            return None  # Error: bad comparison
        if op == '=':
            return val1 == val2
        elif op == '!=':
            return val1 != val2

    return False

def parse_query(query_str):
    """Parse query string into components"""
    # Split by keywords
    tokens = query_str.split()

    if not tokens or tokens[0] != 'SELECT':
        return None

    parts = {
        'select': None,
        'where': None,   # (col, op, val)
        'order_by': None,  # (col, desc)
        'limit': None
    }

    i = 1

    # Parse SELECT columns (until next keyword)
    select_end = i
    while select_end < len(tokens) and tokens[select_end] not in ['WHERE', 'ORDER', 'LIMIT']:
        select_end += 1

    if i >= select_end:
        return None  # No columns

    # Join and split by comma
    select_str = ' '.join(tokens[i:select_end])
    parts['select'] = select_str.split(',')

    i = select_end

    # Parse WHERE clause
    if i < len(tokens) and tokens[i] == 'WHERE':
        i += 1
        if i + 2 >= len(tokens):
            return None

        where_col = tokens[i]
        where_op = tokens[i + 1]
        where_val = tokens[i + 2]

        if where_op not in ['=', '!=', '<', '>', '<=', '>=']:
            return None

        parts['where'] = (where_col, where_op, where_val)
        i += 3

    # Parse ORDER BY clause
    if i < len(tokens) and tokens[i] == 'ORDER':
        i += 1
        if i >= len(tokens) or tokens[i] != 'BY':
            return None
        i += 1
        if i >= len(tokens):
            return None

        order_col = tokens[i]
        order_desc = False
        i += 1

        if i < len(tokens) and tokens[i] == 'DESC':
            order_desc = True
            i += 1

        parts['order_by'] = (order_col, order_desc)

    # Parse LIMIT clause
    if i < len(tokens) and tokens[i] == 'LIMIT':
        i += 1
        if i >= len(tokens):
            return None

        try:
            parts['limit'] = int(tokens[i])
        except ValueError:
            return None
        i += 1

    # Should have consumed all tokens
    if i != len(tokens):
        return None

    return parts

def main():
    if len(sys.argv) != 3:
        print("error: bad query")
        return

    csv_data = sys.argv[1]
    query_str = sys.argv[2]

    header, rows = parse_csv(csv_data)
    query = parse_query(query_str)

    if query is None or query['select'] is None:
        print("error: bad query")
        return

    # Create set of available columns
    col_set = set(header)

    # Validate columns in order: SELECT first, then WHERE, then ORDER BY
    select_cols = query['select']

    for col in select_cols:
        if col not in col_set:
            print(f"error: unknown column {col}")
            return

    if query['where']:
        where_col = query['where'][0]
        if where_col not in col_set:
            print(f"error: unknown column {where_col}")
            return

    if query['order_by']:
        order_col = query['order_by'][0]
        if order_col not in col_set:
            print(f"error: unknown column {order_col}")
            return

    # Filter rows based on WHERE clause
    filtered_rows = []
    for row in rows:
        if query['where']:
            col, op, val = query['where']
            result = compare_values(row[col], val, op)
            if result is None:
                print("error: bad comparison")
                return
            if result:
                filtered_rows.append(row)
        else:
            filtered_rows.append(row)

    # Sort based on ORDER BY
    if query['order_by']:
        col, desc = query['order_by']
        # Check if all values in column are numbers
        all_nums = all(is_number(row[col]) for row in filtered_rows) if filtered_rows else True

        if all_nums:
            filtered_rows.sort(key=lambda r: float(r[col]), reverse=desc)
        else:
            filtered_rows.sort(key=lambda r: r[col], reverse=desc)

    # Apply LIMIT
    if query['limit']:
        filtered_rows = filtered_rows[:query['limit']]

    # Output
    print(','.join(select_cols))
    for row in filtered_rows:
        print(','.join(row[col] for col in select_cols))

if __name__ == '__main__':
    main()
