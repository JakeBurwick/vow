function solveDependencyOrder(input: string): string {
  const entries = input.split(";");
  const packages = new Map<string, Set<string>>();

  // Parse entries
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue; // Empty entries are ignored

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1 || trimmed.lastIndexOf(":") !== colonIdx) {
      return `error: bad entry ${trimmed}`;
    }

    const name = trimmed.substring(0, colonIdx).trim();
    const depsStr = trimmed.substring(colonIdx + 1).trim();

    // Validate name (lowercase letters only)
    if (!/^[a-z]*$/.test(name)) {
      return `error: bad entry ${trimmed}`;
    }

    // Initialize or get package
    if (!packages.has(name)) {
      packages.set(name, new Set());
    }

    // Parse dependencies
    if (depsStr) {
      const deps = depsStr.split(",").map((d) => d.trim());
      for (const dep of deps) {
        // Validate dependency name (lowercase letters only)
        if (!/^[a-z]+$/.test(dep)) {
          return `error: bad entry ${trimmed}`;
        }
        packages.get(name)!.add(dep);
        // Add dependency as a package if not already present
        if (!packages.has(dep)) {
          packages.set(dep, new Set());
        }
      }
    }
  }

  // Check for cycles using DFS
  function hasCycle(): boolean {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    function dfs(pkg: string): boolean {
      if (visiting.has(pkg)) return true; // Cycle detected
      if (visited.has(pkg)) return false;

      visiting.add(pkg);
      for (const dep of packages.get(pkg)!) {
        if (dfs(dep)) return true;
      }
      visiting.delete(pkg);
      visited.add(pkg);
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
    return "error: cycle";
  }

  // Topological sort with alphabetical ordering
  const installed = new Set<string>();
  const result: string[] = [];

  while (installed.size < packages.size) {
    // Find all packages that are ready (all deps installed)
    const ready: string[] = [];
    for (const pkg of packages.keys()) {
      if (installed.has(pkg)) continue;
      const deps = packages.get(pkg)!;
      let allDepsInstalled = true;
      for (const dep of deps) {
        if (!installed.has(dep)) {
          allDepsInstalled = false;
          break;
        }
      }
      if (allDepsInstalled) {
        ready.push(pkg);
      }
    }

    // Sort ready packages alphabetically and install the first one
    ready.sort();
    for (const pkg of ready) {
      installed.add(pkg);
      result.push(pkg);
    }
  }

  return result.join(" ");
}

const input = Deno.args[0];
console.log(solveDependencyOrder(input));
