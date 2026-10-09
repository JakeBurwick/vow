#!/usr/bin/env python3

import sys

def tokenize(expr):
    """Tokenize the expression into a list of tokens."""
    tokens = []
    i = 0
    while i < len(expr):
        if expr[i].isspace():
            i += 1
        elif expr[i].isdigit():
            j = i
            while j < len(expr) and expr[j].isdigit():
                j += 1
            tokens.append(('NUM', int(expr[i:j])))
            i = j
        elif expr[i] in '+-*/()':
            tokens.append((expr[i], expr[i]))
            i += 1
        else:
            return None
    return tokens

class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        """Look at the current token without consuming it."""
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return None

    def consume(self):
        """Consume and return the current token."""
        token = self.peek()
        self.pos += 1
        return token

    def parse(self):
        """Parse the entire expression."""
        if not self.tokens:
            return None
        result = self.parse_expr()
        if result is None or self.pos != len(self.tokens):
            return None
        return result

    def parse_expr(self):
        """Parse addition/subtraction (lowest precedence)."""
        left = self.parse_term()
        if left is None:
            return None

        while True:
            token = self.peek()
            if token and token[0] in ['+', '-']:
                op = self.consume()[0]
                right = self.parse_term()
                if right is None:
                    return None
                if op == '+':
                    left = left + right
                else:
                    left = left - right
            else:
                break

        return left

    def parse_term(self):
        """Parse multiplication/division (higher precedence)."""
        left = self.parse_factor()
        if left is None:
            return None

        while True:
            token = self.peek()
            if token and token[0] in ['*', '/']:
                op = self.consume()[0]
                right = self.parse_factor()
                if right is None:
                    return None
                if op == '*':
                    left = left * right
                else:
                    if right == 0:
                        raise ValueError("division by zero")
                    left = left / right
            else:
                break

        return left

    def parse_factor(self):
        """Parse numbers and parenthesized expressions (highest precedence)."""
        token = self.peek()

        if token is None:
            return None

        if token[0] == 'NUM':
            self.consume()
            return float(token[1])

        if token[0] == '(':
            self.consume()
            result = self.parse_expr()
            if result is None:
                return None
            if self.peek() is None or self.peek()[0] != ')':
                return None
            self.consume()
            return result

        return None

def main():
    if len(sys.argv) < 2:
        print("syntax error")
        return

    expr = sys.argv[1]

    # Check for empty or whitespace-only input
    if not expr or not expr.strip():
        print("syntax error")
        return

    # Tokenize
    tokens = tokenize(expr)
    if tokens is None:
        print("syntax error")
        return

    # Parse and evaluate
    parser = Parser(tokens)
    try:
        result = parser.parse()
        if result is None:
            print("syntax error")
        else:
            # Format output: print as int if it's a whole number, otherwise as float
            if result == int(result):
                print(int(result))
            else:
                print(result)
    except ValueError as e:
        if "division by zero" in str(e):
            print("division by zero")
        else:
            print("syntax error")

if __name__ == "__main__":
    main()
