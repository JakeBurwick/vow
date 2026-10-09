import sys


def main():
    arg = sys.argv[1]
    pieces = arg.split(",")
    total = 0
    for piece in pieces:
        try:
            total += int(piece.strip())
        except ValueError:
            print(f"bad input: {piece}")
            return
    print(total)


if __name__ == "__main__":
    main()
