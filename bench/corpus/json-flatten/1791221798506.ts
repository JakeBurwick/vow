const jsonInput = Deno.args[0];

let data: unknown;
try {
  data = JSON.parse(jsonInput);
} catch {
  console.log('{"error":"bad json"}');
  Deno.exit(0);
}

// Check if top level is object or array
if (typeof data !== "object" || data === null) {
  console.log('{"error":"not a container"}');
  Deno.exit(0);
}

// If the whole document is an empty object or array, print {}
if ((Array.isArray(data) && data.length === 0) || (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0)) {
  console.log("{}");
  Deno.exit(0);
}

const result: Record<string, unknown> = {};

function isLeaf(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return true;
  return false;
}

function flatten(value: unknown, path: string): void {
  if (isLeaf(value)) {
    result[path] = value;
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      flatten(value[i], `${path}[${i}]`);
    }
  } else if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      const newPath = path ? `${path}.${key}` : key;
      flatten((value as Record<string, unknown>)[key], newPath);
    }
  }
}

if (Array.isArray(data)) {
  flatten(data, "");
} else {
  flatten(data, "");
}

// Format output: single-line JSON with no spaces, special number formatting
const output: Record<string, string> = {};
for (const [path, value] of Object.entries(result)) {
  if (value === null) {
    output[path] = "null";
  } else if (typeof value === "boolean") {
    output[path] = value ? "true" : "false";
  } else if (typeof value === "number") {
    // Numbers with no fractional part print without decimal
    if (Number.isInteger(value)) {
      output[path] = String(value);
    } else {
      output[path] = String(value);
    }
  } else if (typeof value === "string") {
    // Escape quotes and backslashes
    output[path] = JSON.stringify(value);
  } else if (Array.isArray(value) && value.length === 0) {
    output[path] = "[]";
  } else if (typeof value === "object" && value !== null && Object.keys(value).length === 0) {
    output[path] = "{}";
  }
}

// Build final JSON object
let jsonOutput = "{";
const entries: string[] = [];
for (const [path, value] of Object.entries(output)) {
  entries.push(`${JSON.stringify(path)}:${value}`);
}
jsonOutput += entries.join(",") + "}";

console.log(jsonOutput);
