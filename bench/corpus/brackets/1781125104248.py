#!/usr/bin/env python3
import sys

s = sys.argv[1]
stack = []
pairs = {'(': ')', '[': ']', '{': '}'}

for char in s:
    if char in pairs:
        stack.append(char)
    else:
        if not stack or pairs[stack.pop()] != char:
            print("no")
            sys.exit(0)

if stack:
    print("no")
else:
    print("yes")
