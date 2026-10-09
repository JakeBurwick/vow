const input = Deno.args[0];
const entries = input.split(';');

const packages = new Map<string, Set<string>>();
const allPackageNames = new Set<string>();

// Parse and validate entries
for (const entry of entries) {
  if (entry.trim() === '') continue;

  // Check for exactly one colon
  const colonCount = (entry.match(/:/g) || []).length;
  if (colonCount !== 1) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const colonIndex = entry.indexOf(':');
  const nameStr = entry.substring(0, colonIndex).trim();
  const depsStr = entry.substring(colonIndex + 1);

  // Validate name (lowercase letters only)
  if (!nameStr || !/^[a-z]+$/.test(nameStr)) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  // Initialize package
  if (!packages.has(nameStr)) {
    packages.set(nameStr, new Set<string>());
  }
  allPackageNames.add(nameStr);

  // Parse dependencies
  if (depsStr.trim() !== '') {
    const deps = depsStr.split(',').map(d => d.trim()).filter(d => d !== '');
    for (const dep of deps) {
      // Validate dependency name
      if (!dep || !/^[a-z]+$/.test(dep)) {
        console.log(`error: bad entry ${entry}`);
        Deno.exit(0);
      }
      packages.get(nameStr)!.add(dep);
      allPackageNames.add(dep);
    }
  }
}

// Check for cycles using DFS
function hasCycle(): boolean {
  const color = new Map<string, number>(); // 0: white, 1: gray, 2: black

  for (const pkg of allPackageNames) {
    color.set(pkg, 0);
  }

  function visit(node: string): boolean {
    color.set(node, 1);
    const deps = packages.get(node) || new Set<string>();
    for (const dep of deps) {
      const depColor = color.get(dep);
      if (depColor === 1) return true; // Back edge = cycle
      if (depColor === 0 && visit(dep)) return true;
    }
    color.set(node, 2);
    return false;
  }

  for (const pkg of allPackageNames) {
    if (color.get(pkg) === 0) {
      if (visit(pkg)) return true;
    }
  }
  return false;
}

if (hasCycle()) {
  console.log('error: cycle');
  Deno.exit(0);
}

// Topological sort using Kahn's algorithm
const inDegree = new Map<string, number>();
const dependents = new Map<string, Set<string>>();

for (const pkg of allPackageNames) {
  inDegree.set(pkg, 0);
  dependents.set(pkg, new Set<string>());
}

// Build in-degrees and dependents map
for (const [pkg, deps] of packages) {
  for (const dep of deps) {
    inDegree.set(pkg, inDegree.get(pkg)! + 1);
    dependents.get(dep)!.add(pkg);
  }
}

// Initialize queue with packages that have no dependencies
const queue: string[] = [];
for (const pkg of allPackageNames) {
  if (inDegree.get(pkg) === 0) {
    queue.push(pkg);
  }
}

// Process packages, maintaining alphabetical order
const result: string[] = [];
while (queue.length > 0) {
  queue.sort();
  const current = queue.shift()!;
  result.push(current);

  // Reduce in-degree of dependents
  for (const dependent of dependents.get(current)!) {
    inDegree.set(dependent, inDegree.get(dependent)! - 1);
    if (inDegree.get(dependent) === 0) {
      queue.push(dependent);
    }
  }
}

console.log(result.join(' '));
