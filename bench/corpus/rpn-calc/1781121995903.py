import sys


def main():
    if len(sys.argv) < 2:
        print("error")
        return
    tokens = sys.argv[1].split(" ")
    stack = []
    try:
        for tok in tokens:
            if tok in ("+", "-", "*", "/"):
                if len(stack) < 2:
                    print("error")
                    return
                b = stack.pop()
                a = stack.pop()
                if tok == "+":
                    stack.append(a + b)
                elif tok == "-":
                    stack.append(a - b)
                elif tok == "*":
                    stack.append(a * b)
                else:
                    if b == 0:
                        print("error")
                        return
                    q = a / b
                    stack.append(int(q))
            else:
                try:
                    n = int(tok)
                except ValueError:
                    print("error")
                    return
                stack.append(n)
        if len(stack) != 1:
            print("error")
            return
        print(stack[0])
    except Exception:
        print("error")


if __name__ == "__main__":
    main()
