const template = Deno.args[0];
const dataArg = Deno.args[1];

// Parse JSON data
let data: any;
try {
  data = JSON.parse(dataArg);
} catch {
  console.log("error: bad data");
  Deno.exit(0);
}

// Verify data is an object
if (typeof data !== "object" || data === null || Array.isArray(data)) {
  console.log("error: bad data");
  Deno.exit(0);
}

interface Token {
  type: "text" | "insert" | "if" | "each" | "endIf" | "endEach";
  value: string;
}

function tokenize(tpl: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < tpl.length) {
    const tagStart = tpl.indexOf("{{", pos);
    
    if (tagStart === -1) {
      // No more tags
      if (pos < tpl.length) {
        tokens.push({ type: "text", value: tpl.slice(pos) });
      }
      break;
    }

    // Add text before tag
    if (tagStart > pos) {
      tokens.push({ type: "text", value: tpl.slice(pos, tagStart) });
    }

    // Find closing }}
    const tagEnd = tpl.indexOf("}}", tagStart);
    if (tagEnd === -1) {
      tokens.push({ type: "text", value: tpl.slice(tagStart) });
      break;
    }

    const content = tpl.slice(tagStart + 2, tagEnd).trim();
    
    if (content.startsWith("#if ")) {
      const name = content.slice(4).trim();
      tokens.push({ type: "if", value: name });
    } else if (content.startsWith("#each ")) {
      const name = content.slice(6).trim();
      tokens.push({ type: "each", value: name });
    } else if (content === "/if") {
      tokens.push({ type: "endIf", value: "" });
    } else if (content === "/each") {
      tokens.push({ type: "endEach", value: "" });
    } else {
      // Regular insertion
      tokens.push({ type: "insert", value: content });
    }

    pos = tagEnd + 2;
  }

  return tokens;
}

function getValue(name: string, context: any): any {
  return context[name];
}

function isTruthy(val: any): boolean {
  if (val === null || val === undefined || val === false) return false;
  if (val === 0 || val === "" || (Array.isArray(val) && val.length === 0)) return false;
  if (typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0) return false;
  return true;
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return String(val);
    return String(val);
  }
  return String(val);
}

function process(tokens: Token[], context: any, start: number = 0, endType?: string): [string, number] {
  let output = "";
  let i = start;

  while (i < tokens.length) {
    const token = tokens[i];

    if (endType && token.type === endType) {
      return [output, i];
    }

    if (token.type === "text") {
      output += token.value;
      i++;
    } else if (token.type === "insert") {
      const val = getValue(token.value, context);
      if (val === null || val === undefined) {
        // Print nothing
      } else if (typeof val === "object") {
        console.log("error: not printable");
        Deno.exit(0);
      } else {
        output += formatValue(val);
      }
      i++;
    } else if (token.type === "if") {
      const val = getValue(token.value, context);
      if (isTruthy(val)) {
        const [body, endIdx] = process(tokens, context, i + 1, "endIf");
        output += body;
        i = endIdx + 1;
      } else {
        // Skip to matching /if
        let depth = 1;
        let j = i + 1;
        while (j < tokens.length && depth > 0) {
          if (tokens[j].type === "if") depth++;
          if (tokens[j].type === "endIf") depth--;
          j++;
        }
        i = j;
      }
    } else if (token.type === "each") {
      const val = getValue(token.value, context);
      if (val === undefined || val === null) {
        // Missing name renders nothing - skip to matching /each
        let depth = 1;
        let j = i + 1;
        while (j < tokens.length && depth > 0) {
          if (tokens[j].type === "each") depth++;
          if (tokens[j].type === "endEach") depth--;
          j++;
        }
        i = j;
      } else if (!Array.isArray(val)) {
        console.log(`error: not a list: ${token.value}`);
        Deno.exit(0);
      } else {
        // Collect body tokens
        let depth = 1;
        let bodyStart = i + 1;
        let j = i + 1;
        while (j < tokens.length && depth > 0) {
          if (tokens[j].type === "each") depth++;
          if (tokens[j].type === "endEach") depth--;
          j++;
        }
        const bodyEnd = j - 1;
        
        // Process each element
        for (const item of val) {
          const itemContext = typeof item === "object" && item !== null ? { ...context, ...item, ".": item } : { ...context, ".": item };
          const [body] = process(tokens, itemContext, bodyStart, "endEach");
          output += body;
        }
        
        i = j;
      }
    } else if (token.type === "endIf") {
      console.log("error: unexpected /if");
      Deno.exit(0);
    } else if (token.type === "endEach") {
      console.log("error: unexpected /each");
      Deno.exit(0);
    } else {
      i++;
    }
  }

  if (endType) {
    // Unclosed block
    if (endType === "endIf") {
      console.log("error: unclosed if");
    } else if (endType === "endEach") {
      console.log("error: unclosed each");
    }
    Deno.exit(0);
  }

  return [output, i];
}

const tokens = tokenize(template);
const [output] = process(tokens, data);
console.log(output);
