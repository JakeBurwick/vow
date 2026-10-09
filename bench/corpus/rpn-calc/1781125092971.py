#!/usr/bin/env python3
import sys

def evaluate_rpn(expression):
    tokens = expression.split()
    stack = []

    for token in tokens:
        if token in ['+', '-', '*', '/']:
            # Need at least 2 operands
            if len(stack) < 2:
                return "error"

            b = stack.pop()
            a = stack.pop()

            if token == '+':
                result = a + b
            elif token == '-':
                result = a - b
            elif token == '*':
                result = a * b
            elif token == '/':
                if b == 0:
                    return "error"
                # Integer division
                result = int(a / b)

            stack.append(result)
        else:
            # Try to parse as integer
            try:
                num = int(token)
                stack.append(num)
            except ValueError:
                return "error"

    # Should have exactly one element left
    if len(stack) != 1:
        return "error"

    return str(stack[0])

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("error")
        sys.exit(1)

    result = evaluate_rpn(sys.argv[1])
    print(result)
