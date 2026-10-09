import sys

words = sys.argv[1].split(" ")
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
best = max(words, key=lambda w: (counts[w], -words.index(w)))
print(best)
