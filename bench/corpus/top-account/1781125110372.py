import sys

accounts = {}
for pair in sys.argv[1].split(','):
    name, amount = pair.split(':')
    accounts[name] = int(amount)

max_name = max(accounts, key=accounts.get)
print(f"{max_name} {accounts[max_name]}")
