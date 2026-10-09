const template = Deno.args[0];
const dataStr = Deno.args[1];

// Parse data
let data: any;
try {
  data = JSON.parse(dataStr);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.log("error: bad data");
    Deno.exit(0);
  }
} catch {
  console.log("error: bad data");
  Deno.exit(0);
}

function formatValue(v: any): string | null {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    return String(v).replace(/\.0$/, "");
  }
  if (Array.isArray(v) || typeof v === "object") return null; // error marker
  return String(v);
}

function isTruthy(v: any): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === "object" && Object.keys(v).length === 0) return false;
  return true;
}

function render(tpl: string, ctx: any, stack: any[]): string {
  function getValue(name: string): any {
    if (name === ".") {
      return ctx;
    }
    // Look in current context first
    if (typeof ctx === "object" && ctx !== null && !Array.isArray(ctx) && name in ctx) {
      return ctx[name];
    }
    // Then look outward in stack
    for (let i = stack.length - 1; i >= 0; i--) {
      const obj = stack[i];
      if (typeof obj === "object" && obj !== null && !Array.isArray(obj) && name in obj) {
        return obj[name];
      }
    }
    return undefined;
  }

  let result = "";
  let i = 0;

  while (i < tpl.length) {
    if (tpl[i] === "{" && tpl[i + 1] === "{") {
      let tagEnd = i + 2;
      while (tagEnd < tpl.length && !(tpl[tagEnd] === "}" && tpl[tagEnd + 1] === "}")) {
        tagEnd++;
      }

      if (tagEnd >= tpl.length) {
        // Check which kind of unclosed tag
        const innerPart = tpl.slice(i + 2).trim();
        if (innerPart.startsWith("#if")) {
          console.log("error: unclosed if");
        } else if (innerPart.startsWith("#each")) {
          console.log("error: unclosed each");
        }
        Deno.exit(0);
      }

      const inner = tpl.slice(i + 2, tagEnd).trim();
      const closingBraces = tagEnd + 2;

      if (inner.startsWith("#if ")) {
        const name = inner.slice(4).trim();
        // Find matching /if
        const blockEnd = findBlockEnd(tpl, closingBraces, "if");
        if (blockEnd === -1) {
          console.log("error: unclosed if");
          Deno.exit(0);
        }

        const body = tpl.slice(closingBraces, blockEnd);
        const val = getValue(name);

        if (isTruthy(val)) {
          result += render(body, ctx, stack);
        }

        i = findEndTag(tpl, blockEnd, "if") + 7; // length of {{/if}}
      } else if (inner.startsWith("#each ")) {
        const name = inner.slice(6).trim();
        // Find matching /each
        const blockEnd = findBlockEnd(tpl, closingBraces, "each");
        if (blockEnd === -1) {
          console.log("error: unclosed each");
          Deno.exit(0);
        }

        const body = tpl.slice(closingBraces, blockEnd);
        const list = getValue(name);

        if (list === undefined) {
          // Missing name renders nothing
        } else if (!Array.isArray(list)) {
          console.log(`error: not a list: ${name}`);
          Deno.exit(0);
        } else {
          for (const item of list) {
            const newStack = [...stack, ctx];
            result += render(body, item, newStack);
          }
        }

        i = findEndTag(tpl, blockEnd, "each") + 9; // length of {{/each}}
      } else if (inner.startsWith("/if")) {
        console.log("error: unexpected /if");
        Deno.exit(0);
      } else if (inner.startsWith("/each")) {
        console.log("error: unexpected /each");
        Deno.exit(0);
      } else {
        // {{name}} - simple substitution
        const val = getValue(inner);
        const formatted = formatValue(val);
        if (formatted === null) {
          console.log("error: not printable");
          Deno.exit(0);
        }
        result += formatted;
        i = closingBraces;
      }
    } else {
      result += tpl[i];
      i++;
    }
  }

  return result;
}

function findBlockEnd(tpl: string, start: number, blockType: string): number {
  let depth = 1;
  let i = start;

  while (i < tpl.length) {
    if (tpl[i] === "{" && tpl[i + 1] === "{") {
      const tagEnd = tpl.indexOf("}}", i + 2);
      if (tagEnd === -1) break;

      const inner = tpl.slice(i + 2, tagEnd).trim();

      if (inner.startsWith("#" + blockType)) {
        depth++;
      } else if (inner === "/" + blockType) {
        depth--;
        if (depth === 0) {
          return i; // Return position of {{
        }
      }

      i = tagEnd + 2;
    } else {
      i++;
    }
  }

  return -1;
}

function findEndTag(tpl: string, pos: number, tagType: string): number {
  // pos should be at the start of the closing tag {{...}}
  return pos;
}

console.log(render(template, data, []));
