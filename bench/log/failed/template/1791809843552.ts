const args = Deno.args;

if (args.length < 2) {
  console.log("error: missing arguments");
  Deno.exit(1);
}

const template = args[0];
let data: any;

try {
  data = JSON.parse(args[1]);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.log("error: bad data");
    Deno.exit(0);
  }
} catch {
  console.log("error: bad data");
  Deno.exit(0);
}

interface Token {
  type: "text" | "var" | "if" | "each" | "endif" | "endeach";
  value?: string;
  name?: string;
  body?: Token[];
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const start = input.indexOf("{{", i);
    if (start === -1) {
      if (i < input.length) {
        tokens.push({ type: "text", value: input.slice(i) });
      }
      break;
    }

    if (start > i) {
      tokens.push({ type: "text", value: input.slice(i, start) });
    }

    const end = input.indexOf("}}", start);
    if (end === -1) {
      tokens.push({ type: "text", value: input.slice(start) });
      break;
    }

    const content = input.slice(start + 2, end).trim();

    if (content.startsWith("#if ")) {
      const name = content.slice(4).trim();
      tokens.push({ type: "if", name });
    } else if (content.startsWith("#each ")) {
      const name = content.slice(6).trim();
      tokens.push({ type: "each", name });
    } else if (content === "/if") {
      tokens.push({ type: "endif" });
    } else if (content === "/each") {
      tokens.push({ type: "endeach" });
    } else {
      tokens.push({ type: "var", name: content });
    }

    i = end + 2;
  }

  return tokens;
}

function parseTokens(tokens: Token[], startIdx = 0): [Token[], number] {
  const result: Token[] = [];
  let i = startIdx;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === "endif") {
      return [result, i];
    } else if (token.type === "endeach") {
      return [result, i];
    } else if (token.type === "if") {
      const [body, endIdx] = parseTokens(tokens, i + 1);
      if (endIdx >= tokens.length || tokens[endIdx].type !== "endif") {
        throw new Error("unclosed if");
      }
      result.push({ type: "if", name: token.name, body });
      i = endIdx + 1;
    } else if (token.type === "each") {
      const [body, endIdx] = parseTokens(tokens, i + 1);
      if (endIdx >= tokens.length || tokens[endIdx].type !== "endeach") {
        throw new Error("unclosed each");
      }
      result.push({ type: "each", name: token.name, body });
      i = endIdx + 1;
    } else {
      result.push(token);
      i++;
    }
  }

  // Check for unclosed blocks
  for (const token of result) {
    if (token.type === "if") {
      // Valid
    } else if (token.type === "each") {
      // Valid
    } else if (token.type === "endif") {
      throw new Error("unexpected /if");
    } else if (token.type === "endeach") {
      throw new Error("unexpected /each");
    }
  }

  return [result, tokens.length];
}

function getValue(obj: any, path: string): any {
  if (typeof path !== "string") return undefined;
  if (path === ".") return obj["."];

  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function isTruthy(val: any): boolean {
  if (val === null || val === undefined) return false;
  if (val === false) return false;
  if (val === 0) return false;
  if (val === "") return false;
  if (Array.isArray(val) && val.length === 0) return false;
  if (typeof val === "object" && Object.keys(val).length === 0) return false;
  return true;
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") {
    if (Number.isInteger(val)) return String(val);
    return String(val);
  }
  if (typeof val === "string") return val;
  if (Array.isArray(val) || typeof val === "object") {
    throw new Error("not printable");
  }
  return String(val);
}

function renderTokens(tokens: Token[], context: any): string {
  let result = "";

  for (const token of tokens) {
    if (token.type === "text") {
      result += token.value;
    } else if (token.type === "var") {
      const val = getValue(context, token.name!);
      result += formatValue(val);
    } else if (token.type === "if") {
      const val = getValue(context, token.name!);
      if (isTruthy(val)) {
        result += renderTokens(token.body || [], context);
      }
    } else if (token.type === "each") {
      const val = getValue(context, token.name!);
      if (val === null || val === undefined) {
        // Missing name renders nothing
      } else if (!Array.isArray(val)) {
        throw new Error(`not a list: ${token.name}`);
      } else {
        for (const item of val) {
          const itemContext = { ...context };
          if (typeof item === "object" && item !== null) {
            Object.assign(itemContext, item);
          }
          itemContext["."] = item;
          result += renderTokens(token.body || [], itemContext);
        }
      }
    }
  }

  return result;
}

try {
  const tokens = tokenize(template);
  const [parsed, endIdx] = parseTokens(tokens);

  // Check for unclosed blocks at top level
  for (const token of parsed) {
    if (token.type === "endif") {
      console.log("error: unexpected /if");
      Deno.exit(0);
    } else if (token.type === "endeach") {
      console.log("error: unexpected /each");
      Deno.exit(0);
    }
  }

  const result = renderTokens(parsed, data);
  console.log(result);
} catch (e) {
  const msg = (e as Error).message;
  if (msg.startsWith("not a list:")) {
    console.log(`error: ${msg}`);
  } else if (msg === "not printable") {
    console.log("error: not printable");
  } else if (msg === "unclosed if") {
    console.log("error: unclosed if");
  } else if (msg === "unclosed each") {
    console.log("error: unclosed each");
  } else if (msg === "unexpected /if") {
    console.log("error: unexpected /if");
  } else if (msg === "unexpected /each") {
    console.log("error: unexpected /each");
  } else {
    console.log(`error: ${msg}`);
  }
}
