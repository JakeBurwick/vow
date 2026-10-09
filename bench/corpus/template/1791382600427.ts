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
  contextStack: unknown[];
}

function parseUntil(
  state: ParseState,
  until: string | null
): { result: string; type: string | null } {
  let result = "";

  while (state.pos < state.template.length) {
    const idx = state.template.indexOf("{{", state.pos);

    if (idx === -1) {
      // End of template
      if (until !== null) {
        throw new Error("unclosed " + until);
      }
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
        const inner = parseUntil(state, "if");
        result += inner.result;
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
          // Skip the body - find matching /each
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
        // We need to collect the template body and repeat it
        const bodyStart = state.pos;
        let depth = 1;
        let bodyEnd = bodyStart;

        while (depth > 0 && state.pos < state.template.length) {
          const nextIdx = state.template.indexOf("{{", state.pos);
          if (nextIdx === -1) throw new Error("unclosed each");

          state.pos = nextIdx + 2;
          const closeIdx = state.template.indexOf("}}", state.pos);
          if (closeIdx === -1) throw new Error("unclosed each");

          const innerTag = state.template.slice(state.pos, closeIdx).trim();

          if (innerTag.startsWith("#each ")) depth++;
          else if (innerTag === "/each") {
            depth--;
            if (depth === 0) bodyEnd = nextIdx;
          }

          state.pos = closeIdx + 2;
        }

        const body = state.template.slice(bodyStart, bodyEnd);

        for (const item of value) {
          state.contextStack.push(item);
          const bodyState: ParseState = {
            template: body,
            pos: 0,
            contextStack: state.contextStack,
          };
          const inner = parseUntil(bodyState, null);
          result += inner.result;
          state.contextStack.pop();
        }
      }
    } else if (tagContent === "/if") {
      if (until === "if") {
        return { result, type: "if" };
      } else {
        throw new Error("unexpected /if");
      }
    } else if (tagContent === "/each") {
      if (until === "each") {
        return { result, type: "each" };
      } else {
        throw new Error("unexpected /each");
      }
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

  if (until !== null) {
    throw new Error("unclosed " + until);
  }

  return { result, type: null };
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
    contextStack: [data],
  };

  const result = parseUntil(state, null);
  console.log(result.result);
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
