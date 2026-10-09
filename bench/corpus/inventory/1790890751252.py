#!/usr/bin/env python3
import sys
from decimal import Decimal, ROUND_HALF_UP

def format_value(value):
    d = Decimal(str(value))
    # Round to 2 decimal places with ROUND_HALF_UP
    rounded = d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    # Convert to string and remove trailing zeros and unnecessary decimal point
    s = str(rounded)
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return s

def solve(commands_str):
    products = {}  # sku -> {name, qty, price, discontinued}

    if not commands_str.strip():
        return

    commands = commands_str.split(';')

    for cmd in commands:
        cmd = cmd.strip()
        if not cmd:
            continue

        parts = cmd.split()
        if not parts:
            continue

        action = parts[0]

        try:
            if action == "add":
                if len(parts) < 4:
                    print(f"error: {cmd}")
                    continue
                sku = parts[1]
                name = parts[2]
                qty = int(parts[3])
                price = Decimal(parts[4])

                if sku in products:
                    print(f"error: {cmd}")
                    continue

                products[sku] = {
                    'name': name,
                    'qty': qty,
                    'price': price,
                    'discontinued': False
                }

            elif action == "sell":
                if len(parts) < 3:
                    print(f"error: {cmd}")
                    continue
                sku = parts[1]
                qty = int(parts[2])

                if sku not in products:
                    print(f"error: {cmd}")
                    continue

                if products[sku]['discontinued']:
                    print(f"error: {cmd}")
                    continue

                if products[sku]['qty'] < qty:
                    print(f"error: {cmd}")
                    continue

                products[sku]['qty'] -= qty

            elif action == "restock":
                if len(parts) < 3:
                    print(f"error: {cmd}")
                    continue
                sku = parts[1]
                qty = int(parts[2])

                if sku not in products:
                    print(f"error: {cmd}")
                    continue

                if products[sku]['discontinued']:
                    print(f"error: {cmd}")
                    continue

                products[sku]['qty'] += qty

            elif action == "discontinue":
                if len(parts) < 2:
                    print(f"error: {cmd}")
                    continue
                sku = parts[1]

                if sku not in products:
                    print(f"error: {cmd}")
                    continue

                products[sku]['discontinued'] = True

            elif action == "report":
                for sku in sorted(products.keys()):
                    prod = products[sku]
                    name = prod['name']
                    qty = prod['qty']
                    price = prod['price']
                    value = qty * price

                    # Format value without trailing zeros
                    value_str = format_value(value)

                    line = f"{sku} {name} qty={qty} value={value_str}"
                    if prod['discontinued']:
                        line += " discontinued"
                    print(line)

            else:
                print(f"error: {cmd}")

        except (ValueError, IndexError):
            print(f"error: {cmd}")

if __name__ == "__main__":
    commands = sys.argv[1]
    solve(commands)
