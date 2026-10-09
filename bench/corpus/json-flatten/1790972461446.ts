function flattenJson(jsonStr: string): string {
  let data: unknown;

  // Parse JSON
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return '{"error":"bad json"}';
  }

  // Check if top level is container (object or array)
  if (typeof data !== "object" || data === null) {
    return '{"error":"not a container"}';
  }

  // If the whole document is an empty object or array, print {}
  if (Array.isArray(data) && data.length === 0) {
    return "{}";
  }
  if (!Array.isArray(data) && Object.keys(data).length === 0) {
    return "{}";
  }

  const result: Map<string, unknown> = new Map();

  function isLeaf(value: unknown): boolean {
    if (value === null) return true;
    if (typeof value === "string") return true;
    if (typeof value === "number") return true;
    if (typeof value === "boolean") return true;
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return value.length === 0;
      } else {
        return Object.keys(value).length === 0;
      }
    }
    return false;
  }

  function traverse(value: unknown, path: string): void {
    if (isLeaf(value)) {
      result.set(path, value);
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const newPath = path === "" ? `[${i}]` : `${path}[${i}]`;
        traverse(value[i], newPath);
      }
    } else if (typeof value === "object" && value !== null) {
      const keys = Object.keys(value).sort();
      for (const key of keys) {
        const newPath = path === "" ? key : `${path}.${key}`;
        traverse((value as Record<string, unknown>)[key], newPath);
      }
    }
  }

  traverse(data, "");

  // Build output JSON
  const entries: string[] = [];
  for (const [path, value] of result) {
    const pathJson = JSON.stringify(path);
    let valueJson: string;

    if (value === null) {
      valueJson = "null";
    } else if (typeof value === "string") {
      valueJson = JSON.stringify(value);
    } else if (typeof value === "number") {
      // Check if it's a whole number
      if (Number.isInteger(value)) {
        valueJson = String(value);
      } else {
        valueJson = String(value);
      }
    } else if (typeof value === "boolean") {
      valueJson = String(value);
    } else if (Array.isArray(value)) {
      valueJson = "[]";
    } else if (typeof value === "object") {
      valueJson = "{}";
    } else {
      valueJson = "null";
    }

    entries.push(`${pathJson}:${valueJson}`);
  }

  return "{" + entries.join(",") + "}";
}

const jsonStr = Deno.args[0];
console.log(flattenJson(jsonStr));
