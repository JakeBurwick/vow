import sys


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    accounts = {}
    out = []
    for raw in arg.split(";"):
        cmd = raw.strip()
        if not cmd:
            continue
        parts = cmd.split()
        op = parts[0]
        if op == "open" and len(parts) == 3:
            name, amount = parts[1], int(parts[2])
            if name in accounts:
                out.append("error")
                break
            accounts[name] = amount
        elif op == "deposit" and len(parts) == 3:
            name, amount = parts[1], int(parts[2])
            if name not in accounts:
                out.append("error")
                break
            accounts[name] += amount
        elif op == "withdraw" and len(parts) == 3:
            name, amount = parts[1], int(parts[2])
            if name not in accounts or amount > accounts[name]:
                out.append("error")
                break
            accounts[name] -= amount
        elif op == "balance" and len(parts) == 2:
            name = parts[1]
            if name not in accounts:
                out.append("error")
                break
            out.append(f"{name} {accounts[name]}")
        else:
            out.append("error")
            break
    print("\n".join(out))


if __name__ == "__main__":
    main()
