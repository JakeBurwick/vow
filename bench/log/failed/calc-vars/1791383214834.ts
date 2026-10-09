const input = Deno.args[0];
const lines = input.split("\n");

const variables = new Map<string, number>();

function isValidName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) {
    return n.toString();
  }
  // Format with 10 significant digits, no trailing zeros
  const str = n.toPrecision(10);
  // Remove trailing zeros after decimal point
  return str.replace(/\.?0+$/, "");
}

class Parser {
  tokens: string[];
  pos: number = 0;

  constructor(expr: string) {
    // Tokenize
    this.tokens = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let num = "";
        while (i < expr.length && /[0-9]/.test(expr[i])) {
          num += expr[i];
          i++;
        }
        this.tokens.push(num);
      } else if (/[a-zA-Z_]/.test(ch)) {
        let name = "";
        while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
          name += expr[i];
          i++;
        }
        this.tokens.push(name);
      } else if ("+-*/()".includes(ch)) {
        this.tokens.push(ch);
        i++;
      } else {
        throw new Error("syntax");
      }
    }
  }

  peek(): string | undefined {
    return this.tokens[this.pos];
  }

  next(): string {
    return this.tokens[this.pos++];
  }

  parse(): number {
    return this.parseAddSub();
  }

  parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.next();
      const right = this.parseMulDiv();
      if (op === "+") {
        left = left + right;
      } else {
        left = left - right;
      }
    }
    return left;
  }

  parseMulDiv(): number {
    let left = this.parseUnary();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.next();
      const right = this.parseUnary();
      if (op === "*") {
        left = left * right;
      } else {
        if (right === 0) {
          throw new Error("division by zero");
        }
        left = left / right;
      }
    }
    return left;
  }

  parseUnary(): number {
    if (this.peek() === "-") {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary(): number {
    const token = this.peek();
    if (token === undefined) {
      throw new Error("syntax");
    }

    if (token === "(") {
      this.next();
      const val = this.parseAddSub();
      if (this.peek() !== ")") {
        throw new Error("syntax");
      }
      this.next();
      return val;
    }

    if (/^[0-9]+$/.test(token)) {
      this.next();
      return parseInt(token, 10);
    }

    if (/^[a-zA-Z_]/.test(token)) {
      const name = this.next();
      if (!variables.has(name)) {
        throw new Error(`unknown variable ${name}`);
      }
      return variables.get(name)!;
    }

    throw new Error("syntax");
  }
}

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const line = lines[lineNum - 1];

  // Skip blank lines
  if (line.trim().length === 0) {
    continue;
  }

  // Parse "name = expression"
  const eqIndex = line.indexOf("=");
  if (eqIndex === -1) {
    console.log(`error line ${lineNum}: syntax`);
    Deno.exit(0);
  }

  const name = line.substring(0, eqIndex).trim();
  const exprStr = line.substring(eqIndex + 1).trim();

  if (!isValidName(name)) {
    console.log(`error line ${lineNum}: syntax`);
    Deno.exit(0);
  }

  try {
    const parser = new Parser(exprStr);
    const value = parser.parse();

    // Check if all tokens were consumed
    if (parser.pos < parser.tokens.length) {
      console.log(`error line ${lineNum}: syntax`);
      Deno.exit(0);
    }

    variables.set(name, value);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.startsWith("unknown variable")) {
        const varName = e.message.replace("unknown variable ", "");
        console.log(`error line ${lineNum}: unknown variable ${varName}`);
      } else if (e.message === "division by zero") {
        console.log(`error line ${lineNum}: division by zero`);
      } else {
        console.log(`error line ${lineNum}: syntax`);
      }
    }
    Deno.exit(0);
  }
}

// Output all variables sorted by name
const sortedNames = Array.from(variables.keys()).sort();
for (const name of sortedNames) {
  const value = variables.get(name)!;
  console.log(`${name} = ${formatNumber(value)}`);
}
