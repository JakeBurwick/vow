const input = Deno.args[0];

// Parse the input
const entries = input.split(';').filter(e => e.length > 0);

const dependencies: Map<string, Set<string>> = new Map();
const allPackages = new Set<string>();

// First pass: validate and build dependency graph
for (const entry of entries) {
  // Check for exactly one colon
  const colonCount = (entry.match(/:/g) || []).length;
  if (colonCount !== 1) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const [name, depsStr] = entry.split(':');

  // Validate name: must be lowercase letters only
  if (!/^[a-z]+$/.test(name)) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  allPackages.add(name);

  const deps = depsStr.length > 0 ? depsStr.split(',') : [];

  // Validate dependency names
  for (const dep of deps) {
    if (!/^[a-z]+$/.test(dep)) {
      console.log(`error: bad entry ${entry}`);
      Deno.exit(0);
    }
    allPackages.add(dep);
  }

  // Merge dependencies (union)
  if (!dependencies.has(name)) {
    dependencies.set(name, new Set());
  }
  for (const dep of deps) {
    dependencies.get(name)!.add(dep);
  }
}

// Ensure all packages are in the map
for (const pkg of allPackages) {
  if (!dependencies.has(pkg)) {
    dependencies.set(pkg, new Set());
  }
}

// Kahn's algorithm for topological sort
const inDegree = new Map<string, number>();
const graph: Map<string, Set<string>> = new Map();

// Build reverse graph (package -> packages that depend on it)
for (const pkg of allPackages) {
  inDegree.set(pkg, 0);
  if (!graph.has(pkg)) {
    graph.set(pkg, new Set());
  }
}

for (const [pkg, deps] of dependencies.entries()) {
  inDegree.set(pkg, deps.size);
  for (const dep of deps) {
    graph.get(dep)!.add(pkg);
  }
}

const result: string[] = [];
const queue: string[] = [];

// Find all packages with no dependencies
for (const pkg of allPackages) {
  if (inDegree.get(pkg) === 0) {
    queue.push(pkg);
  }
}

while (queue.length > 0) {
  queue.sort(); // Always pick the alphabetically smallest
  const pkg = queue.shift()!;
  result.push(pkg);

  for (const dependent of graph.get(pkg) || []) {
    inDegree.set(dependent, inDegree.get(dependent)! - 1);
    if (inDegree.get(dependent) === 0) {
      queue.push(dependent);
    }
  }
}

if (result.length !== allPackages.size) {
  console.log('error: cycle');
} else {
  console.log(result.join(' '));
}
