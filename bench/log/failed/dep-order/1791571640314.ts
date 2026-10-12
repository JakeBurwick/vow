import { args } from 'deno';

interface Package {
  name: string;
  dependencies: string[];
}

function parseEntry(entry: string): Package {
  if (!entry) return { name: '', dependencies: [] };
  const parts = entry.split(':');
  if (parts.length !== 2) {
    console.log(`error: bad entry ${entry}`);
    return { name: '', dependencies: [] };
  }
  const name = parts[0].trim().toLowerCase();
  const deps = parts[1].trim().split(',');
  return { name, dependencies: deps.map(dep => dep.trim()) };
}

function findCycles(graph: { [name: string]: string[] }): boolean {
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(name: string): boolean {
    if (stack.has(name)) return true;
    if (visited.has(name)) return false;
    visited.add(name);
    stack.add(name);
    for (const dep of graph[name]) {
      if (dfs(dep)) return true;
    }
    stack.delete(name);
    return false;
  }

  for (const name in graph) {
    if (dfs(name)) return true;
  }
  return false;
}

function buildGraph(entries: Package[]): { [name: string]: string[] } {
  const graph: { [name: string]: string[] } = {};
  for (const entry of entries) {
    graph[entry.name] = [];
    for (const dep of entry.dependencies) {
      if (!graph[dep]) graph[dep] = [];
      graph[entry.name].push(dep);
    }
  }
  return graph;
}

function buildOrder(graph: { [name: string]: string[] }): string[] {
  const order: string[] = [];
  const queue: string[] = [];

  for (const name in graph) {
    if (graph[name].length === 0) {
      queue.push(name);
    }
  }

  while (queue.length > 0) {
    queue.sort();
    const name = queue.shift() as string;
    order.push(name);
    for (const dep of graph[name]) {
      graph[dep] = graph[dep].filter(dep => dep !== name);
      if (graph[dep].length === 0) {
        queue.push(dep);
      }
    }
  }

  if (order.length !== Object.keys(graph).length) {
    console.log('error: cycle');
    return [];
  }

  return order;
}

function main() {
  const entries: Package[] = [];
  for (const entry of args) {
    if (entry) {
      const parsed = parseEntry(entry);
      if (parsed.name && parsed.dependencies.every(dep => dep.length > 0)) {
        entries.push(parsed);
      }
    }
  }

  const graph = buildGraph(entries);
  if (findCycles(graph)) {
    return;
  }

  const order = buildOrder(graph);
  console.log(order.join(' '));
}

main();
