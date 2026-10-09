import { parse } from "https://deno.land/std@0.208.0/json/mod.ts";

interface Context {
  data: Record<string, unknown>;
  parent?: Context;
}

function getValue(name: string, context: Context): unknown {
  // Look up in current level first, then parent
  if (name in context.data) {
    return context.data[name];
  }
  if (context.parent) {
    return getValue(name, context.parent);
  }
  return undefined;
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return false;
  return true;
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    const str = String(value);
    // Remove trailing .0 if the number is a whole number
    if (Number.isInteger(value)) {
      return Math.floor(value as number).toString();
    }
    return str;
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value) || typeof value === "object") {
    throw new Error("error: not printable");
  }
  return String(value);
}

function parseTemplate(template: string, context: Context): string {
  let result = "";
  let i = 0;

  while (i < template.length) {
    if (template[i] === "{" && template[i + 1] === "{") {
      let j = i + 2;
      while (j < template.length && template[j] !== "}") j++;
      if (j + 1 >= template.length) {
        throw new Error("Unclosed tag");
      }

      const tagContent = template.substring(i + 2, j).trim();
      j += 2;

      if (tagContent.startsWith("#if ")) {
        const name = tagContent.substring(4).trim();
        const value = getValue(name, context);
        let blockContent = "";
        let depth = 1;
        let blockStart = j;

        while (j < template.length && depth > 0) {
          if (template[j] === "{" && template[j + 1] === "{") {
            let k = j + 2;
            while (k < template.length && template[k] !== "}") k++;
            if (k + 1 < template.length) {
              const innerTag = template.substring(j + 2, k).trim();
              if (innerTag === "#if " + name || innerTag.startsWith("#if ")) depth++;
              else if (innerTag === "/if") depth--;
            }
            j = k + 2;
          } else {
            j++;
          }
        }

        if (depth !== 0) {
          throw new Error("error: unclosed if");
        }

        blockContent = template.substring(blockStart, j - 4);

        if (isTruthy(value)) {
          result += parseTemplate(blockContent, context);
        }

        i = j;
      } else if (tagContent.startsWith("#each ")) {
        const name = tagContent.substring(6).trim();
        const value = getValue(name, context);

        if (value === undefined) {
          // Missing name renders nothing
          let depth = 1;
          let j_inner = j;
          while (j_inner < template.length && depth > 0) {
            if (template[j_inner] === "{" && template[j_inner + 1] === "{") {
              let k = j_inner + 2;
              while (k < template.length && template[k] !== "}") k++;
              if (k + 1 < template.length) {
                const innerTag = template.substring(j_inner + 2, k).trim();
                if (innerTag.startsWith("#each ")) depth++;
                else if (innerTag === "/each") depth--;
              }
              j_inner = k + 2;
            } else {
              j_inner++;
            }
          }
          i = j_inner;
          continue;
        }

        if (!Array.isArray(value)) {
          throw new Error(`error: not a list: ${name}`);
        }

        let blockContent = "";
        let depth = 1;
        let blockStart = j;

        while (j < template.length && depth > 0) {
          if (template[j] === "{" && template[j + 1] === "{") {
            let k = j + 2;
            while (k < template.length && template[k] !== "}") k++;
            if (k + 1 < template.length) {
              const innerTag = template.substring(j + 2, k).trim();
              if (innerTag.startsWith("#each ")) depth++;
              else if (innerTag === "/each") depth--;
            }
            j = k + 2;
          } else {
            j++;
          }
        }

        if (depth !== 0) {
          throw new Error("error: unclosed each");
        }

        blockContent = template.substring(blockStart, j - 7);

        for (const item of value) {
          let itemContext: Context = { data: typeof item === "object" && item !== null ? item as Record<string, unknown> : { ".": item }, parent: context };
          result += parseTemplate(blockContent, itemContext);
        }

        i = j;
      } else if (tagContent === "/if") {
        throw new Error("error: unexpected /if");
      } else if (tagContent === "/each") {
        throw new Error("error: unexpected /each");
      } else {
        // Simple substitution
        const value = getValue(tagContent, context);
        result += toString(value);
        i = j;
      }
    } else {
      result += template[i];
      i++;
    }
  }

  return result;
}

try {
  const template = Deno.args[0];
  const dataStr = Deno.args[1];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataStr);
  } catch {
    console.log("error: bad data");
    Deno.exit(0);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.log("error: bad data");
    Deno.exit(0);
  }

  const context: Context = { data };
  const result = parseTemplate(template, context);
  console.log(result);
} catch (error) {
  if (error instanceof Error) {
    console.log(error.message);
  }
}
