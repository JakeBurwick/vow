function solveShortestPath(graphStr: string, start: string, goal: string): string {
  if (start === goal) {
    return start;
  }

  // Parse edges
  const edges = graphStr.split(",").map((e) => e.trim());
  const graph = new Map<string, Set<string>>();
  const allNodes = new Set<string>();

  for (const edge of edges) {
    const [a, b] = edge.split("-").map((x) => x.trim());
    allNodes.add(a);
    allNodes.add(b);
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  }

  // Check if both nodes exist
  if (!allNodes.has(start) || !allNodes.has(goal)) {
    return "no path";
  }

  // BFS to find shortest path length
  const distance = new Map<string, number>();
  const parents = new Map<string, string[]>();
  const queue: string[] = [start];
  distance.set(start, 0);
  parents.set(start, []);

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;

    const neighbors = Array.from(graph.get(node) || []).sort();
    for (const neighbor of neighbors) {
      if (!distance.has(neighbor)) {
        distance.set(neighbor, distance.get(node)! + 1);
        parents.set(neighbor, [node]);
        queue.push(neighbor);
      } else if (distance.get(neighbor) === distance.get(node)! + 1) {
        parents.get(neighbor)!.push(node);
      }
    }
  }

  if (!distance.has(goal)) {
    return "no path";
  }

  // Reconstruct all shortest paths
  function getPaths(node: string): string[][] {
    if (node === start) {
      return [[start]];
    }
    const parentList = parents.get(node) || [];
    const allPaths: string[][] = [];
    for (const parent of parentList) {
      const parentPaths = getPaths(parent);
      for (const path of parentPaths) {
        allPaths.push([...path, node]);
      }
    }
    return allPaths;
  }

  const allPaths = getPaths(goal);

  // Sort paths lexicographically
  allPaths.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  });

  return allPaths[0].join(" -> ");
}

const graphStr = Deno.args[0];
const start = Deno.args[1];
const goal = Deno.args[2];
console.log(solveShortestPath(graphStr, start, goal));
