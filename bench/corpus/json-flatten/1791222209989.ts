const [jsonInput] = Deno.args;

if (!jsonInput) {
  console.log('{"error":"bad json"}');
  Deno.exit(0);
}

let data: unknown;

try {
  data = JSON.parse(jsonInput);
} catch {
  console.log('{"error":"bad json"}');
  Deno.exit(0);
}

// Check if top level is object or array
const isArray = Array.isArray(data);
const isObject = !isArray && typeof data === "object" && data !== null;

if (!isArray && !isObject) {
  console.log('{"error":"not a container"}');
  Deno.exit(0);
}

// Handle empty object or array
if ((isArray && data.length === 0) || (isObject && Object.keys(data).length === 0)) {
  console.log("{}");
  Deno.exit(0);
}

const result = new Map<string, unknown>();

function flatten(obj: unknown, prefix: string = "") {
  if (obj === null) {
    result.set(prefix, null);
    return;
  }

  if (typeof obj === "boolean") {
    result.set(prefix, obj);
    return;
  }

  if (typeof obj === "number") {
    result.set(prefix, obj);
    return;
  }

  if (typeof obj === "string") {
    result.set(prefix, obj);
    return;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      result.set(prefix, []);
      return;
    }
    for (let i = 0; i < obj.length; i++) {
      flatten(obj[i], `${prefix}[${i}]`);
    }
    return;
  }

  if (typeof obj === "object" && obj !== null) {
    const keys = Object.keys(obj).sort();
    if (keys.length === 0) {
      result.set(prefix, {});
      return;
    }
    for (const key of keys) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      flatten((obj as Record<string, unknown>)[key], newPrefix);
    }
    return;
  }
}

flatten(data);

// Build JSON output manually to avoid spaces
let json = "{";
let first = true;
for (const [key, value] of result.entries()) {
  if (!first) json += ",";
  first = false;

  json += JSON.stringify(key) + ":";

  if (value === null) {
    json += "null";
  } else if (typeof value === "boolean") {
    json += value ? "true" : "false";
  } else if (typeof value === "number") {
    json += value.toString();
  } else if (typeof value === "string") {
    json += JSON.stringify(value);
  } else if (Array.isArray(value) && value.length === 0) {
    json += "[]";
  } else if (typeof value === "object" && value !== null && Object.keys(value).length === 0) {
    json += "{}";
  }
}
json += "}";

console.log(json);
