import sys

def average(xs):
    return sum(xs) / len(xs)

scores = [float(s) for s in sys.argv[1].split(",") if s != ""]
print(average(scores))
