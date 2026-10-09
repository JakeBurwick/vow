#!/usr/bin/env python3
import sys
from collections import deque, defaultdict

def solve(edges_str, start, goal):
    if start == goal:
        return start

    # Parse edges
    graph = defaultdict(set)
    nodes = set()

    if edges_str.strip():
        for edge in edges_str.split(','):
            edge = edge.strip()
            if '-' in edge:
                parts = edge.split('-')
                if len(parts) == 2:
                    a, b = parts[0].strip(), parts[1].strip()
                    graph[a].add(b)
                    graph[b].add(a)
                    nodes.add(a)
                    nodes.add(b)

    # Check if nodes exist
    if start not in nodes or goal not in nodes:
        return "no path"

    # BFS to find shortest path
    queue = deque([(start, [start])])
    visited = {start}
    shortest_paths = []
    found_distance = None

    while queue:
        node, path = queue.popleft()

        if found_distance is not None and len(path) - 1 > found_distance:
            break

        if node == goal:
            if found_distance is None:
                found_distance = len(path) - 1
            shortest_paths.append(path)
            continue

        for neighbor in sorted(graph[node]):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))

    if not shortest_paths:
        return "no path"

    # Pick lexicographically smallest path
    shortest_paths.sort()
    return " -> ".join(shortest_paths[0])

if __name__ == "__main__":
    edges = sys.argv[1]
    start = sys.argv[2]
    goal = sys.argv[3]
    print(solve(edges, start, goal))
