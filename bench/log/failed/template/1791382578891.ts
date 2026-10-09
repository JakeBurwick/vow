import { parse } from "https://deno.land/std@0.208.0/json/mod.ts";

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === false) return false;
  if (value === 0) return false;
  if (value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === "object" && Object.keys(value).length === 0) return false;
  return true;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    // Check if it's an integer
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === "string") return value;
  throw new Error("not printable");
}

function getValue(obj: unknown, name: string): unknown {
  if (typeof obj !== "object" || obj === null) return undefined;
  return (obj as Record<string, unknown>)[name];
}

interface ParseState {
  template: string;
  pos: number;
  data: unknown;
  contextStack: unknown[];
}

function parseTemplate(state: ParseState): string {
  let result = "";

  while (state.pos < state.template.length) {
    const idx = state.template.indexOf("{{", state.pos);

    if (idx === -1) {
      result += state.template.slice(state.pos);
      state.pos = state.template.length;
      break;
    }

    result += state.template.slice(state.pos, idx);
    state.pos = idx + 2;

    // Find closing }}
    const closeIdx = state.template.indexOf("}}", state.pos);
    if (closeIdx === -1) {
      throw new Error("unclosed tag");
    }

    const tagContent = state.template.slice(state.pos, closeIdx).trim();
    state.pos = closeIdx + 2;

    if (tagContent.startsWith("#if ")) {
      const name = tagContent.slice(4).trim();
      const current = state.contextStack[state.contextStack.length - 1];
      const value = getValue(current, name);

      if (isTruthy(value)) {
        const innerResult = parseTemplate(state);
        result += innerResult;
      } else {
        // Skip until {{/if}}
        let depth = 1;
        while (depth > 0 && state.pos < state.template.length) {
          const nextIdx = state.template.indexOf("{{", state.pos);
          if (nextIdx === -1) throw new Error("unclosed if");

          state.pos = nextIdx + 2;
          const closeIdx = state.template.indexOf("}}", state.pos);
          if (closeIdx === -1) throw new Error("unclosed if");

          const innerTag = state.template.slice(state.pos, closeIdx).trim();
          state.pos = closeIdx + 2;

          if (innerTag.startsWith("#if ")) depth++;
          else if (innerTag === "/if") depth--;
        }
      }
    } else if (tagContent.startsWith("#each ")) {
      const name = tagContent.slice(6).trim();
      const current = state.contextStack[state.contextStack.length - 1];
      const value = getValue(current, name);

      if (!Array.isArray(value)) {
        if (value === undefined) {
          // Skip the body
          let depth = 1;
          while (depth > 0 && state.pos < state.template.length) {
            const nextIdx = state.template.indexOf("{{", state.pos);
            if (nextIdx === -1) throw new Error("unclosed each");

            state.pos = nextIdx + 2;
            const closeIdx = state.template.indexOf("}}", state.pos);
            if (closeIdx === -1) throw new Error("unclosed each");

            const innerTag = state.template.slice(state.pos, closeIdx).trim();
            state.pos = closeIdx + 2;

            if (innerTag.startsWith("#each ")) depth++;
            else if (innerTag === "/each") depth--;
          }
        } else {
          throw new Error("not a list: " + name);
        }
      } else {
        for (const item of value) {
          state.contextStack.push(item);
          const innerResult = parseTemplate(state);
          result += innerResult;
          state.contextStack.pop();
        }
      }
    } else if (tagContent === "/if") {
      return result;
    } else if (tagContent === "/each") {
      return result;
    } else if (tagContent === ".") {
      const current = state.contextStack[state.contextStack.length - 1];
      result += formatValue(current);
    } else {
      // Simple variable
      const current = state.contextStack[state.contextStack.length - 1];
      const value = getValue(current, tagContent);
      result += formatValue(value);
    }
  }

  return result;
}

// Main
const template = Deno.args[0];
const dataStr = Deno.args[1];

if (!template || !dataStr) {
  console.error("Missing arguments");
  Deno.exit(1);
}

try {
  const data = JSON.parse(dataStr);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    console.log("error: bad data");
    Deno.exit(0);
  }

  const state: ParseState = {
    template,
    pos: 0,
    data,
    contextStack: [data],
  };

  const result = parseTemplate(state);
  console.log(result);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message === "bad data") {
    console.log("error: bad data");
  } else if (message === "unclosed if") {
    console.log("error: unclosed if");
  } else if (message === "unclosed each") {
    console.log("error: unclosed each");
  } else if (message === "unexpected /if") {
    console.log("error: unexpected /if");
  } else if (message === "unexpected /each") {
    console.log("error: unexpected /each");
  } else if (message.startsWith("not a list: ")) {
    console.log("error: " + message);
  } else if (message === "not printable") {
    console.log("error: not printable");
  } else {
    console.log("error: " + message);
  }
}
