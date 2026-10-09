const input = Deno.args[0];

// Parse the input
const entries = input.split(';').filter(e => e.length > 0);

const packages = new Map<string, Set<string>>(); // package -> its dependencies

// Validate and build dependency graph
for (const entry of entries) {
  const colonCount = (entry.match(/:/g) || []).length;
  if (colonCount !== 1) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const [name, depsStr] = entry.split(':');

  // Validate name is lowercase letters only
  if (!/^[a-z]+$/.test(name)) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const deps = depsStr.length > 0 ? depsStr.split(',') : [];

  // Validate all dependencies are lowercase letters only
  for (const dep of deps) {
    if (!/^[a-z]+$/.test(dep)) {
      console.log(`error: bad entry ${entry}`);
      Deno.exit(0);
    }
  }

  if (!packages.has(name)) {
    packages.set(name, new Set());
  }

  // Union with existing dependencies
  for (const dep of deps) {
    packages.get(name)!.add(dep);
    // Add the dependency as a package if not already there
    if (!packages.has(dep)) {
      packages.set(dep, new Set());
    }
  }
}

// Detect cycles using DFS
function hasCycle(): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);

    const deps = packages.get(node) || new Set();
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (dfs(dep)) {
          return true;
        }
      } else if (recStack.has(dep)) {
        return true;
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const pkg of packages.keys()) {
    if (!visited.has(pkg)) {
      if (dfs(pkg)) {
        return true;
      }
    }
  }

  return false;
}

if (hasCycle()) {
  console.log('error: cycle');
  Deno.exit(0);
}

// Topological sort using Kahn's algorithm
// Build reverse graph: for each package, track what depends on it
const dependents = new Map<string, Set<string>>();
const inDegree = new Map<string, number>();

for (const [pkg] of packages) {
  dependents.set(pkg, new Set());
  inDegree.set(pkg, packages.get(pkg)!.size);
}

for (const [pkg, deps] of packages) {
  for (const dep of deps) {
    dependents.get(dep)!.add(pkg);
  }
}

// Start with packages that have no dependencies
const queue: string[] = [];
for (const [pkg, degree] of inDegree) {
  if (degree === 0) {
    queue.push(pkg);
  }
}

const result: string[] = [];
while (queue.length > 0) {
  queue.sort();
  const pkg = queue.shift()!;
  result.push(pkg);

  for (const dependent of dependents.get(pkg)!) {
    inDegree.set(dependent, inDegree.get(dependent)! - 1);
    if (inDegree.get(dependent) === 0) {
      queue.push(dependent);
    }
  }
}

console.log(result.join(' '));
