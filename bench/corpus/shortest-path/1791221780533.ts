const edges = Deno.args[0];
const start = Deno.args[1];
const goal = Deno.args[2];

// Parse edges and build adjacency list
const graph = new Map<string, Set<string>>();
const edgeList = edges.split(",");

for (const edge of edgeList) {
  const [a, b] = edge.trim().split("-");
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

// Check if start and goal exist in graph
if (!graph.has(start) || !graph.has(goal)) {
  console.log("no path");
  Deno.exit(0);
}

// Special case: start equals goal
if (start === goal) {
  console.log(start);
  Deno.exit(0);
}

// BFS to find all shortest paths
const queue: { node: string; path: string[] }[] = [{ node: start, path: [start] }];
const visited = new Map<string, number>();
visited.set(start, 0);

let shortestPaths: string[][] = [];
let shortestDist = Infinity;

while (queue.length > 0) {
  const { node, path } = queue.shift()!;
  const dist = path.length - 1;

  // If we've found a path and this distance is greater, stop
  if (dist > shortestDist) break;

  // Found the goal
  if (node === goal) {
    if (dist < shortestDist) {
      shortestDist = dist;
      shortestPaths = [path];
    } else if (dist === shortestDist) {
      shortestPaths.push(path);
    }
    continue;
  }

  // Explore neighbors
  const neighbors = Array.from(graph.get(node)!).sort();
  for (const neighbor of neighbors) {
    const neighborDist = visited.get(neighbor);
    if (neighborDist === undefined || neighborDist >= dist + 1) {
      visited.set(neighbor, dist + 1);
      queue.push({ node: neighbor, path: [...path, neighbor] });
    }
  }
}

if (shortestPaths.length === 0) {
  console.log("no path");
} else {
  // Pick the alphabetically smallest path
  shortestPaths.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  });
  console.log(shortestPaths[0].join(" -> "));
}
