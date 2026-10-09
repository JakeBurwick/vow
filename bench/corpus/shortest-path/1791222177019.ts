const [graphArg, start, goal] = Deno.args;

if (!graphArg || !start || !goal) {
  console.log("no path");
  Deno.exit(0);
}

// Parse the graph
const edges = graphArg.split(",").map(e => e.trim()).filter(e => e);
const graph = new Map<string, string[]>();

for (const edge of edges) {
  const [a, b] = edge.split("-").map(x => x.trim());
  if (!graph.has(a)) graph.set(a, []);
  if (!graph.has(b)) graph.set(b, []);
  graph.get(a)!.push(b);
  graph.get(b)!.push(a);
}

// Check if nodes exist
if (!graph.has(start) || !graph.has(goal)) {
  console.log("no path");
  Deno.exit(0);
}

// If start equals goal
if (start === goal) {
  console.log(start);
  Deno.exit(0);
}

// Sort adjacency lists for lexicographic ordering
for (const neighbors of graph.values()) {
  neighbors.sort();
}

// BFS to find distance and parent relationships
const distance = new Map<string, number>();
const parents = new Map<string, string[]>();

distance.set(start, 0);
parents.set(start, []);

const queue = [start];

while (queue.length > 0) {
  const node = queue.shift()!;
  const currentDist = distance.get(node)!;

  for (const neighbor of graph.get(node)!) {
    if (!distance.has(neighbor)) {
      distance.set(neighbor, currentDist + 1);
      parents.set(neighbor, [node]);
      queue.push(neighbor);
    } else if (distance.get(neighbor) === currentDist + 1) {
      // This is an alternative parent at the same distance level
      parents.get(neighbor)!.push(node);
    }
  }
}

if (!distance.has(goal)) {
  console.log("no path");
  Deno.exit(0);
}

// Reconstruct all paths from goal back to start
function getAllPaths(node: string): string[][] {
  if (node === start) {
    return [[start]];
  }

  const nodeParents = parents.get(node)!;
  const paths: string[][] = [];

  for (const parent of nodeParents) {
    const parentPaths = getAllPaths(parent);
    for (const path of parentPaths) {
      paths.push([...path, node]);
    }
  }

  return paths;
}

const allPaths = getAllPaths(goal);
allPaths.sort((a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return a[i].localeCompare(b[i]);
    }
  }
  return 0;
});

console.log(allPaths[0].join(" -> "));
