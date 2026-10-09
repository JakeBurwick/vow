#!/usr/bin/env deno run --allow-net

const graphStr = Deno.args[0];
const start = Deno.args[1];
const goal = Deno.args[2];

// Parse the graph
const edges = graphStr.split(",");
const adjacency: Map<string, Set<string>> = new Map();

for (const edge of edges) {
  const [a, b] = edge.split("-");
  if (!adjacency.has(a)) adjacency.set(a, new Set());
  if (!adjacency.has(b)) adjacency.set(b, new Set());
  adjacency.get(a)!.add(b);
  adjacency.get(b)!.add(a);
}

// Check if nodes exist
if (!adjacency.has(start) || !adjacency.has(goal)) {
  console.log("no path");
  Deno.exit(0);
}

// If start equals goal
if (start === goal) {
  console.log(start);
  Deno.exit(0);
}

// BFS to find all shortest paths
interface PathState {
  node: string;
  path: string[];
}

const queue: PathState[] = [{ node: start, path: [start] }];
const visited: Map<string, number> = new Map();
visited.set(start, 0);
let shortestPaths: string[][] = [];
let shortestLength = Infinity;

while (queue.length > 0) {
  const { node, path } = queue.shift()!;

  if (path.length > shortestLength) {
    break;
  }

  if (node === goal) {
    if (path.length < shortestLength) {
      shortestPaths = [path];
      shortestLength = path.length;
    } else if (path.length === shortestLength) {
      shortestPaths.push(path);
    }
    continue;
  }

  const neighbors = Array.from(adjacency.get(node)!).sort();
  for (const neighbor of neighbors) {
    const newDist = path.length;
    if (!visited.has(neighbor) || visited.get(neighbor)! === newDist) {
      visited.set(neighbor, newDist);
      queue.push({ node: neighbor, path: [...path, neighbor] });
    }
  }
}

if (shortestPaths.length === 0) {
  console.log("no path");
} else {
  // Pick the alphabetically smallest path (node by node comparison)
  shortestPaths.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  });
  console.log(shortestPaths[0].join(" -> "));
}
