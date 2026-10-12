// Template parser and renderer
interface DataObject {
  [key: string]: unknown;
}

function lookup(name: string, context: DataObject): unknown {
  if (context.hasOwnProperty(name)) {
    return context[name];
  }
  return null;
}

function isTruthy(val: unknown): boolean {
  if (val === null || val === undefined || val === false) return false;
  if (val === 0 || val === "" || (Array.isArray(val) && val.length === 0) || (typeof val === "object" && Object.keys(val as object).length === 0)) return false;
  return true;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") {
    // Remove trailing .0 for whole numbers
    if (Number.isInteger(val)) return String(val);
    return String(val);
  }
  if (typeof val === "string") return val;
  throw new Error("error: not printable");
}

interface Token {
  type: "text" | "var" | "if" | "each" | "endif" | "endeach";
  value: string;
  content?: Token[];
}

function tokenize(template: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < template.length) {
    const tagStart = template.indexOf("{{", pos);

    if (tagStart === -1) {
      // No more tags
      if (pos < template.length) {
        tokens.push({ type: "text", value: template.substring(pos) });
      }
      break;
    }

    // Add text before tag
    if (tagStart > pos) {
      tokens.push({ type: "text", value: template.substring(pos, tagStart) });
    }

    // Find end of tag
    const tagEnd = template.indexOf("}}", tagStart + 2);
    if (tagEnd === -1) {
      // No closing tag found, treat rest as text
      tokens.push({ type: "text", value: template.substring(tagStart) });
      break;
    }

    const tagContent = template.substring(tagStart + 2, tagEnd).trim();

    if (tagContent.startsWith("#if ")) {
      tokens.push({ type: "if", value: tagContent.substring(4).trim() });
    } else if (tagContent.startsWith("#each ")) {
      tokens.push({ type: "each", value: tagContent.substring(6).trim() });
    } else if (tagContent === "/if") {
      tokens.push({ type: "endif", value: "" });
    } else if (tagContent === "/each") {
      tokens.push({ type: "endeach", value: "" });
    } else {
      tokens.push({ type: "var", value: tagContent });
    }

    pos = tagEnd + 2;
  }

  return tokens;
}

function buildAST(tokens: Token[], startIdx: number = 0, endType?: string): { ast: Token[]; endIdx: number } {
  const ast: Token[] = [];
  let i = startIdx;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === "text" || token.type === "var") {
      ast.push(token);
      i++;
    } else if (token.type === "if") {
      const ifToken: Token = { type: "if", value: token.value, content: [] };
      const { ast: content, endIdx } = buildAST(tokens, i + 1, "/if");
      ifToken.content = content;
      ast.push(ifToken);
      i = endIdx + 1;
    } else if (token.type === "each") {
      const eachToken: Token = { type: "each", value: token.value, content: [] };
      const { ast: content, endIdx } = buildAST(tokens, i + 1, "/each");
      eachToken.content = content;
      ast.push(eachToken);
      i = endIdx + 1;
    } else if (token.type === "endif") {
      if (endType === "/if") {
        return { ast, endIdx: i };
      } else {
        throw new Error("error: unexpected /if");
      }
    } else if (token.type === "endeach") {
      if (endType === "/each") {
        return { ast, endIdx: i };
      } else {
        throw new Error("error: unexpected /each");
      }
    }
  }

  if (endType === "/if") {
    throw new Error("error: unclosed if");
  } else if (endType === "/each") {
    throw new Error("error: unclosed each");
  }

  return { ast, endIdx: tokens.length };
}

function render(ast: Token[], context: DataObject): string {
  const result: string[] = [];

  for (const token of ast) {
    if (token.type === "text") {
      result.push(token.value);
    } else if (token.type === "var") {
      const val = lookup(token.value, context);
      if (Array.isArray(val) || (typeof val === "object" && val !== null)) {
        throw new Error("error: not printable");
      }
      result.push(formatValue(val));
    } else if (token.type === "if") {
      const val = lookup(token.value, context);
      if (isTruthy(val)) {
        result.push(render(token.content || [], context));
      }
    } else if (token.type === "each") {
      const val = lookup(token.value, context);
      if (val === null || val === undefined) {
        // Missing name renders nothing
      } else if (!Array.isArray(val)) {
        throw new Error(`error: not a list: ${token.value}`);
      } else {
        for (const item of val) {
          let itemContext: DataObject;
          if (typeof item === "object" && item !== null && !Array.isArray(item)) {
            itemContext = { ...context, ...item as DataObject };
          } else {
            itemContext = { ...context, ".": item };
          }
          result.push(render(token.content || [], itemContext));
        }
      }
    }
  }

  return result.join("");
}

function parseTemplate(template: string, data: DataObject): string {
  const tokens = tokenize(template);
  const { ast } = buildAST(tokens);
  return render(ast, data);
}

// Main
const template = Deno.args[0];
const dataStr = Deno.args[1];

try {
  const data = JSON.parse(dataStr);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.log("error: bad data");
  } else {
    const result = parseTemplate(template, data as DataObject);
    console.log(result);
  }
} catch (e) {
  if (e instanceof SyntaxError) {
    console.log("error: bad data");
  } else if (e instanceof Error) {
    console.log(e.message);
  } else {
    console.log("error: bad data");
  }
}
