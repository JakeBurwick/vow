const input = Deno.args[0];
const lines = input.split("\n");

const variables = new Map<string, number>();

function formatNumber(n: number): string {
  if (Number.isInteger(n)) {
    return Math.floor(n).toString();
  }
  // Round to 10 significant digits
  const str = n.toPrecision(10);
  // Remove trailing zeros after decimal point
  const result = str.replace(/\.?0+$/, "");
  return result;
}

function isValidName(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/i.test(name);
}

class Parser {
  tokens: string[] = [];
  pos = 0;

  constructor(expr: string) {
    // Tokenize
    let i = 0;
    while (i < expr.length) {
      if (/\s/.test(expr[i])) {
        i++;
      } else if (/[0-9]/.test(expr[i])) {
        let num = "";
        while (i < expr.length && /[0-9]/.test(expr[i])) {
          num += expr[i];
          i++;
        }
        if (i < expr.length && expr[i] === ".") {
          num += ".";
          i++;
          while (i < expr.length && /[0-9]/.test(expr[i])) {
            num += expr[i];
            i++;
          }
        }
        this.tokens.push(num);
      } else if (/[a-z_]/i.test(expr[i])) {
        let name = "";
        while (i < expr.length && /[a-z0-9_]/i.test(expr[i])) {
          name += expr[i];
          i++;
        }
        this.tokens.push(name);
      } else if ("+-*/()".includes(expr[i])) {
        this.tokens.push(expr[i]);
        i++;
      } else {
        throw new Error("syntax");
      }
    }
  }

  peek(): string | undefined {
    return this.tokens[this.pos];
  }

  consume(): string | undefined {
    return this.tokens[this.pos++];
  }

  parseExpression(): number {
    return this.parseAddSub();
  }

  parseAddSub(): number {
    let left = this.parseMulDiv();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.consume();
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
      const op = this.consume();
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
      this.consume();
      return -this.parseUnary();
    }
    if (this.peek() === "+") {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary(): number {
    const token = this.peek();
    if (!token) {
      throw new Error("syntax");
    }

    if (token === "(") {
      this.consume();
      const value = this.parseExpression();
      if (this.consume() !== ")") {
        throw new Error("syntax");
      }
      return value;
    }

    if (/^[0-9]+(\.[0-9]+)?$/.test(token)) {
      this.consume();
      return parseFloat(token);
    }

    if (/^[a-z_]/i.test(token)) {
      const name = this.consume()!;
      if (!variables.has(name)) {
        throw new Error(`unknown variable ${name}`);
      }
      return variables.get(name)!;
    }

    throw new Error("syntax");
  }
}

// Process lines
for (let lineNum = 0; lineNum < lines.length; lineNum++) {
  const line = lines[lineNum];

  // Skip blank lines
  if (line.trim().length === 0) {
    continue;
  }

  // Parse "name = expression"
  const eqIndex = line.indexOf("=");
  if (eqIndex === -1) {
    console.log(`error line ${lineNum + 1}: syntax`);
    Deno.exit(0);
  }

  const nameStr = line.substring(0, eqIndex).trim();
  const exprStr = line.substring(eqIndex + 1).trim();

  if (!isValidName(nameStr)) {
    console.log(`error line ${lineNum + 1}: syntax`);
    Deno.exit(0);
  }

  try {
    const parser = new Parser(exprStr);
    const value = parser.parseExpression();
    if (parser.pos < parser.tokens.length) {
      throw new Error("syntax");
    }
    variables.set(nameStr, value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "syntax";
    if (msg === "division by zero") {
      console.log(`error line ${lineNum + 1}: division by zero`);
    } else if (msg.startsWith("unknown variable")) {
      const varName = msg.substring("unknown variable ".length);
      console.log(`error line ${lineNum + 1}: unknown variable ${varName}`);
    } else {
      console.log(`error line ${lineNum + 1}: syntax`);
    }
    Deno.exit(0);
  }
}

// Print variables sorted by name
const sortedNames = Array.from(variables.keys()).sort();
for (const name of sortedNames) {
  const value = variables.get(name)!;
  console.log(`${name} = ${formatNumber(value)}`);
}
