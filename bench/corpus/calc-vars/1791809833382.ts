class ExpressionEvaluator {
  private vars: Map<string, number> = new Map();
  private input: string = "";
  private pos: number = 0;

  evaluate(program: string): string {
    const lines = program.split("\n");

    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1];

      // Skip blank lines
      if (!line.trim()) continue;

      // Parse "name = expression"
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) {
        return `error line ${lineNum}: syntax`;
      }

      const nameStr = line.substring(0, eqIdx).trim();
      const exprStr = line.substring(eqIdx + 1).trim();

      // Validate name
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nameStr)) {
        return `error line ${lineNum}: syntax`;
      }

      // Evaluate expression
      try {
        this.input = exprStr;
        this.pos = 0;
        const value = this.parseExpression();

        // Check if we consumed all input
        if (this.pos < this.input.length) {
          return `error line ${lineNum}: syntax`;
        }

        this.vars.set(nameStr, value);
      } catch (e: unknown) {
        if (typeof e === "string") {
          return `error line ${lineNum}: ${e}`;
        }
        return `error line ${lineNum}: syntax`;
      }
    }

    // Output variables sorted by name
    const sorted = Array.from(this.vars.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    const result: string[] = [];
    for (const [name, value] of sorted) {
      result.push(`${name} = ${this.formatNumber(value)}`);
    }
    return result.join("\n");
  }

  private formatNumber(num: number): string {
    // Print whole numbers without decimal point
    if (Number.isInteger(num)) {
      return Math.floor(num).toString();
    }

    // Round to 10 significant digits
    const toPrecision = num.toPrecision(10);
    let parsed = parseFloat(toPrecision);

    // Remove trailing zeros after decimal point
    let str = parsed.toString();
    if (str.includes(".")) {
      str = str.replace(/\.?0+$/, "");
    }
    return str;
  }

  private parseExpression(): number {
    return this.parseAddSub();
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();

    while (true) {
      this.skipWhitespace();
      const ch = this.peekChar();
      if (ch !== "+" && ch !== "-") break;
      const op = this.nextChar();
      const right = this.parseMulDiv();
      if (op === "+") {
        left = left + right;
      } else {
        left = left - right;
      }
    }

    return left;
  }

  private parseMulDiv(): number {
    let left = this.parseUnary();

    while (true) {
      this.skipWhitespace();
      const ch = this.peekChar();
      if (ch !== "*" && ch !== "/") break;
      const op = this.nextChar();
      const right = this.parseUnary();
      if (op === "*") {
        left = left * right;
      } else {
        if (right === 0) {
          throw "division by zero";
        }
        left = left / right;
      }
    }

    return left;
  }

  private parseUnary(): number {
    this.skipWhitespace();

    if (this.peekChar() === "-") {
      this.nextChar();
      return -this.parseUnary();
    }

    if (this.peekChar() === "+") {
      this.nextChar();
      return this.parseUnary();
    }

    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();

    // Parentheses
    if (this.peekChar() === "(") {
      this.nextChar();
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.peekChar() !== ")") {
        throw "syntax";
      }
      this.nextChar();
      return value;
    }

    // Number
    if (this.isDigit(this.peekChar())) {
      return this.parseNumber();
    }

    // Variable
    if (this.isLetter(this.peekChar()) || this.peekChar() === "_") {
      return this.parseVariable();
    }

    throw "syntax";
  }

  private parseNumber(): number {
    let num = "";
    while (this.isDigit(this.peekChar())) {
      num += this.nextChar();
    }
    // Handle decimal point
    if (this.peekChar() === ".") {
      num += this.nextChar();
      while (this.isDigit(this.peekChar())) {
        num += this.nextChar();
      }
    }
    return parseFloat(num);
  }

  private parseVariable(): number {
    let name = "";
    while (this.isLetterOrDigit(this.peekChar()) || this.peekChar() === "_") {
      name += this.nextChar();
    }
    if (!this.vars.has(name)) {
      throw `unknown variable ${name}`;
    }
    return this.vars.get(name)!;
  }

  private peekChar(): string {
    if (this.pos >= this.input.length) return "";
    return this.input[this.pos];
  }

  private nextChar(): string {
    if (this.pos >= this.input.length) return "";
    return this.input[this.pos++];
  }

  private skipWhitespace(): void {
    while (this.peekChar() === " " || this.peekChar() === "\t") {
      this.nextChar();
    }
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isLetter(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
  }

  private isLetterOrDigit(ch: string): boolean {
    return this.isLetter(ch) || this.isDigit(ch);
  }
}

const input = Deno.args[0];
const evaluator = new ExpressionEvaluator();
console.log(evaluator.evaluate(input));
