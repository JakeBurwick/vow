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
    if (Number.isInteger(value)) {
      return Math.floor(value as number).toString();
    }
    return String(value);
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value) || typeof value === "object") {
    throw new Error("error: not printable");
  }
  return String(value);
}

// Find the position of }} starting from startPos
function findClosingBraces(template: string, startPos: number): number {
  for (let i = startPos; i + 1 < template.length; i++) {
    if (template[i] === "}" && template[i + 1] === "}") {
      return i;
    }
  }
  return -1;
}

// Find the matching closing tag (/if or /each) with proper nesting
function findMatchingClose(template: string, startPos: number, openTag: string, closeTag: string): number {
  let pos = startPos;
  let depth = 1;

  while (pos < template.length) {
    // Look for next tag
    const tagStart = template.indexOf("{{", pos);
    if (tagStart === -1) break;

    const closePos = findClosingBraces(template, tagStart + 2);
    if (closePos === -1) break;

    const tagContent = template.substring(tagStart + 2, closePos).trim();

    if (tagContent.startsWith(openTag)) {
      depth++;
    } else if (tagContent === closeTag) {
      depth--;
      if (depth === 0) {
        return tagStart;  // Return position of {{
      }
    }

    pos = closePos + 2;
  }

  return -1;  // Not found
}

function parseTemplate(template: string, context: Context): string {
  let result = "";
  let i = 0;

  while (i < template.length) {
    if (template[i] === "{" && i + 1 < template.length && template[i + 1] === "{") {
      // Find closing }}
      const closePos = findClosingBraces(template, i + 2);

      if (closePos === -1) {
        throw new Error("error: unclosed tag");
      }

      const tagContent = template.substring(i + 2, closePos).trim();
      const afterTag = closePos + 2;

      if (tagContent.startsWith("#if ")) {
        const name = tagContent.substring(4).trim();
        const value = getValue(name, context);

        // Find matching {{/if}}
        const closeIfPos = findMatchingClose(template, afterTag, "#if ", "/if");
        if (closeIfPos === -1) {
          throw new Error("error: unclosed if");
        }

        const blockContent = template.substring(afterTag, closeIfPos);
        const afterClose = findClosingBraces(template, closeIfPos + 2);
        const endPos = afterClose + 2;

        if (isTruthy(value)) {
          result += parseTemplate(blockContent, context);
        }

        i = endPos;
      } else if (tagContent.startsWith("#each ")) {
        const name = tagContent.substring(6).trim();
        const value = getValue(name, context);

        // Find matching {{/each}}
        const closeEachPos = findMatchingClose(template, afterTag, "#each ", "/each");
        if (closeEachPos === -1) {
          throw new Error("error: unclosed each");
        }

        const blockContent = template.substring(afterTag, closeEachPos);
        const afterClose = findClosingBraces(template, closeEachPos + 2);
        const endPos = afterClose + 2;

        if (value === undefined) {
          // Missing name renders nothing
          i = endPos;
        } else if (!Array.isArray(value)) {
          throw new Error(`error: not a list: ${name}`);
        } else {
          for (const item of value) {
            let itemData: Record<string, unknown>;
            if (typeof item === "object" && item !== null && !Array.isArray(item)) {
              itemData = item as Record<string, unknown>;
            } else {
              itemData = { ".": item };
            }
            const itemContext: Context = { data: itemData, parent: context };
            result += parseTemplate(blockContent, itemContext);
          }
          i = endPos;
        }
      } else if (tagContent === "/if") {
        throw new Error("error: unexpected /if");
      } else if (tagContent === "/each") {
        throw new Error("error: unexpected /each");
      } else {
        // Simple substitution
        const value = getValue(tagContent, context);
        result += toString(value);
        i = afterTag;
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
