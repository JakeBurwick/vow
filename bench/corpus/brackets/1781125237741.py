#!/usr/bin/env python3
import sys

def is_balanced(s):
    stack = []
    pairs = {'(': ')', '[': ']', '{': '}'}

    for char in s:
        if char in pairs:
            stack.append(char)
        else:
            if not stack or pairs[stack.pop()] != char:
                return False

    return len(stack) == 0

if len(sys.argv) > 1:
    result = is_balanced(sys.argv[1])
    print("yes" if result else "no")
