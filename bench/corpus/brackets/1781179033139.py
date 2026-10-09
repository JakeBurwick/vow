import sys

def is_balanced(s):
    stack = []
    pairs = {'(': ')', '[': ']', '{': '}'}

    for char in s:
        if char in pairs:
            # Opening bracket
            stack.append(char)
        else:
            # Closing bracket
            if not stack or pairs[stack.pop()] != char:
                return False

    return len(stack) == 0

# Try to get input from command line arg first, otherwise stdin
if len(sys.argv) > 1:
    s = sys.argv[1]
else:
    s = sys.stdin.read().strip()

print("yes" if is_balanced(s) else "no")
