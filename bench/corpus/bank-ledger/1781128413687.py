import sys

commands = sys.argv[1] if len(sys.argv) > 1 else ""

# Parse commands separated by semicolons
command_list = commands.split(";") if commands else []

# Dictionary to store account balances
accounts = {}

# Process each command
for cmd in command_list:
    cmd = cmd.strip()
    if not cmd:
        continue

    parts = cmd.split()

    if not parts:
        continue

    action = parts[0]

    if action == "open":
        if len(parts) != 3:
            print("error")
            break
        name = parts[1]
        try:
            amount = int(parts[2])
        except ValueError:
            print("error")
            break

        # Check if account already exists
        if name in accounts:
            print("error")
            break

        # Check amount is non-negative
        if amount < 0:
            print("error")
            break

        accounts[name] = amount

    elif action == "deposit":
        if len(parts) != 3:
            print("error")
            break
        name = parts[1]
        try:
            amount = int(parts[2])
        except ValueError:
            print("error")
            break

        # Check if account exists
        if name not in accounts:
            print("error")
            break

        # Check amount is non-negative
        if amount < 0:
            print("error")
            break

        accounts[name] += amount

    elif action == "withdraw":
        if len(parts) != 3:
            print("error")
            break
        name = parts[1]
        try:
            amount = int(parts[2])
        except ValueError:
            print("error")
            break

        # Check if account exists
        if name not in accounts:
            print("error")
            break

        # Check amount is non-negative
        if amount < 0:
            print("error")
            break

        # Check if withdrawal would exceed balance
        if accounts[name] < amount:
            print("error")
            break

        accounts[name] -= amount

    elif action == "balance":
        if len(parts) != 2:
            print("error")
            break
        name = parts[1]

        # Check if account exists
        if name not in accounts:
            print("error")
            break

        print(f"{name} {accounts[name]}")

    else:
        print("error")
        break
