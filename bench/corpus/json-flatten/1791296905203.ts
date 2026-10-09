#!/usr/bin/env deno run --allow-net

const jsonStr = Deno.args[0];

let data: unknown;
try {
  data = JSON.parse(jsonStr);
} catch {
  console.log('{"error":"bad json"}');
  Deno.exit(0);
}

// Check if top level is object or array
if (typeof data !== "object" || data === null || (typeof data !== "object" || (!Array.isArray(data) && typeof data !== "object"))) {
  if (typeof data !== "object" || data === null) {
    console.log('{"error":"not a container"}');
    Deno.exit(0);
  }
}

if (!Array.isArray(data) && typeof data !== "object") {
  console.log('{"error":"not a container"}');
  Deno.exit(0);
}

const result: Map<string, unknown> = new Map();

function isLeaf(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return true;
  return false;
}

function flatten(obj: unknown, path: string): void {
  if (isLeaf(obj)) {
    result.set(path, obj);
    return;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      flatten(obj[i], path + "[" + i + "]");
    }
  } else if (typeof obj === "object" && obj !== null) {
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      const newPath = path === "" ? key : path + "." + key;
      flatten((obj as Record<string, unknown>)[key], newPath);
    }
  }
}

// Handle top-level empty objects/arrays
if (Array.isArray(data)) {
  if (data.length === 0) {
    console.log("{}");
    Deno.exit(0);
  }
  for (let i = 0; i < data.length; i++) {
    flatten(data[i], "[" + i + "]");
  }
} else if (typeof data === "object" && data !== null) {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    console.log("{}");
    Deno.exit(0);
  }
  keys.sort();
  for (const key of keys) {
    flatten((data as Record<string, unknown>)[key], key);
  }
}

// Build output object
const outputObj: Record<string, unknown> = {};
for (const [path, value] of result) {
  outputObj[path] = value;
}

// Convert to JSON with proper escaping and no spaces
const json = JSON.stringify(outputObj);
console.log(json);
