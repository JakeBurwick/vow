#!/usr/bin/env python3
import sys

def evaluate_rpn(expression):
    tokens = expression.split()
    stack = []

    for token in tokens:
        if token in ['+', '-', '*', '/']:
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
                result = int(a / b)

            stack.append(result)
        else:
            try:
                stack.append(int(token))
            except ValueError:
                return "error"

    if len(stack) != 1:
        return "error"

    return str(stack[0])

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("error")
    else:
        print(evaluate_rpn(sys.argv[1]))
