const input = Deno.args[0];
const entries = input.split(";").filter(e => e.length > 0);

// Parse and validate entries, build dependency graph
const packages = new Map<string, Set<string>>();

for (const entry of entries) {
  if (!entry.includes(":")) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const parts = entry.split(":");
  if (parts.length !== 2) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const [name, depsStr] = parts;

  // Validate name is lowercase letters only
  if (!/^[a-z]+$/.test(name)) {
    console.log(`error: bad entry ${entry}`);
    Deno.exit(0);
  }

  const deps = depsStr.length > 0 ? depsStr.split(",") : [];

  // Validate each dependency is lowercase letters only
  for (const dep of deps) {
    if (!/^[a-z]+$/.test(dep)) {
      console.log(`error: bad entry ${entry}`);
      Deno.exit(0);
    }
  }

  // Add or merge dependencies for this package
  if (packages.has(name)) {
    for (const dep of deps) {
      packages.get(name)!.add(dep);
    }
  } else {
    packages.set(name, new Set(deps));
  }

  // Ensure all dependencies are also registered as packages
  for (const dep of deps) {
    if (!packages.has(dep)) {
      packages.set(dep, new Set());
    }
  }
}

// Detect cycles using DFS
function hasCycle(): boolean {
  const visited = new Map<string, number>(); // 0 = white, 1 = gray, 2 = black

  function dfs(node: string): boolean {
    visited.set(node, 1); // gray
    const deps = packages.get(node) || new Set();
    for (const dep of deps) {
      const status = visited.get(dep) || 0;
      if (status === 1) return true; // back edge, cycle
      if (status === 0 && dfs(dep)) return true;
    }
    visited.set(node, 2); // black
    return false;
  }

  for (const [pkg] of packages) {
    if ((visited.get(pkg) || 0) === 0) {
      if (dfs(pkg)) return true;
    }
  }

  return false;
}

if (hasCycle()) {
  console.log("error: cycle");
  Deno.exit(0);
}

// Topological sort with alphabetical ordering
const result: string[] = [];
const visited = new Set<string>();

function visit(node: string) {
  if (visited.has(node)) return;
  visited.add(node);

  const deps = packages.get(node) || new Set();
  // Visit dependencies in alphabetical order
  const sortedDeps = Array.from(deps).sort();
  for (const dep of sortedDeps) {
    visit(dep);
  }

  result.push(node);
}

// Process all packages in alphabetical order
const sortedPackages = Array.from(packages.keys()).sort();
for (const pkg of sortedPackages) {
  visit(pkg);
}

console.log(result.join(" "));
