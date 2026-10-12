const input = Deno.args[0];

// Parse entries
const entries = input.split(";").filter((e) => e.length > 0);

// Build dependency graph
const packages = new Map<string, Set<string>>();

// Validate entries and populate packages
for (const entry of entries) {
  const colonIndex = entry.indexOf(":");
  if (colonIndex === -1 || entry.indexOf(":", colonIndex + 1) !== -1) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const name = entry.substring(0, colonIndex);
  const depsStr = entry.substring(colonIndex + 1);

  // Validate name: lowercase letters only
  if (!/^[a-z]+$/.test(name)) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const deps = depsStr.length > 0 ? depsStr.split(",") : [];

  // Validate all dependency names
  for (const dep of deps) {
    if (!/^[a-z]+$/.test(dep)) {
      console.log(`error: bad entry ${entry}`);
      Deno.exit(0);
    }
  }

  // Add package with dependencies
  if (!packages.has(name)) {
    packages.set(name, new Set());
  }
  for (const dep of deps) {
    packages.get(name)!.add(dep);
    // Make sure dependency exists as a package (with no deps if not mentioned elsewhere)
    if (!packages.has(dep)) {
      packages.set(dep, new Set());
    }
  }
}

// Detect cycle using DFS
function hasCycle(): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);

    const deps = packages.get(node) || new Set();
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (recStack.has(dep)) {
        return true;
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const pkg of packages.keys()) {
    if (!visited.has(pkg)) {
      if (dfs(pkg)) return true;
    }
  }
  return false;
}

if (hasCycle()) {
  console.log("error: cycle");
  Deno.exit(0);
}

// Topological sort using Kahn's algorithm (keeps packages in alphabetical order)
const inDegree = new Map<string, number>();
const graph = new Map<string, Set<string>>(); // Reverse: dep -> dependents

// Initialize
for (const [pkg] of packages) {
  inDegree.set(pkg, 0);
  graph.set(pkg, new Set());
}

// Build reverse graph and count in-degrees
for (const [pkg, deps] of packages) {
  inDegree.set(pkg, deps.size);
  for (const dep of deps) {
    if (!graph.has(dep)) {
      graph.set(dep, new Set());
    }
    graph.get(dep)!.add(pkg);
  }
}

const queue: string[] = [];
for (const [pkg, degree] of inDegree) {
  if (degree === 0) {
    queue.push(pkg);
  }
}

queue.sort(); // Start with alphabetical order

const result: string[] = [];

while (queue.length > 0) {
  queue.sort(); // Always pick alphabetically smallest available
  const pkg = queue.shift()!;
  result.push(pkg);

  // Process packages that depend on this one
  const dependents = graph.get(pkg) || new Set();
  for (const dependent of dependents) {
    inDegree.set(dependent, inDegree.get(dependent)! - 1);
    if (inDegree.get(dependent) === 0) {
      queue.push(dependent);
    }
  }
}

console.log(result.join(" "));
