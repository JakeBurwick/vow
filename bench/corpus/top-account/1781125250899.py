import sys

def main():
    input_str = sys.argv[1]

    pairs = input_str.split(',')

    max_name = None
    max_amount = -1

    for pair in pairs:
        name, amount_str = pair.split(':')
        amount = int(amount_str)

        if amount > max_amount:
            max_amount = amount
            max_name = name

    print(f"{max_name} {max_amount}")

if __name__ == "__main__":
    main()
