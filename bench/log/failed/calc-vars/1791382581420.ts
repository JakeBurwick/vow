interface Token {
  type: string;
  value: string | number;
}

class Lexer {
  private input: string;
  private pos: number = 0;

  constructor(input: string) {
    this.input = input;
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }

  private advance(): string {
    return this.input[this.pos++] || '';
  }

  private skipWhitespace() {
    while (/\s/.test(this.peek()) && this.peek() !== '\n') {
      this.advance();
    }
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();

      const ch = this.peek();

      if (!ch) break;

      if (/\d/.test(ch)) {
        let num = '';
        while (/\d/.test(this.peek())) {
          num += this.advance();
        }
        tokens.push({ type: 'NUMBER', value: parseInt(num, 10) });
      } else if (/[a-zA-Z_]/.test(ch)) {
        let name = '';
        while (/[a-zA-Z0-9_]/.test(this.peek())) {
          name += this.advance();
        }
        tokens.push({ type: 'VARIABLE', value: name });
      } else if (ch === '+') {
        this.advance();
        tokens.push({ type: 'PLUS', value: '+' });
      } else if (ch === '-') {
        this.advance();
        tokens.push({ type: 'MINUS', value: '-' });
      } else if (ch === '*') {
        this.advance();
        tokens.push({ type: 'MULTIPLY', value: '*' });
      } else if (ch === '/') {
        this.advance();
        tokens.push({ type: 'DIVIDE', value: '/' });
      } else if (ch === '(') {
        this.advance();
        tokens.push({ type: 'LPAREN', value: '(' });
      } else if (ch === ')') {
        this.advance();
        tokens.push({ type: 'RPAREN', value: ')' });
      } else if (ch === '=') {
        this.advance();
        tokens.push({ type: 'ASSIGN', value: '=' });
      } else {
        throw new Error('Syntax error: unexpected character');
      }
    }

    return tokens;
  }
}

class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private variables: Map<string, number>;

  constructor(tokens: Token[], variables: Map<string, number>) {
    this.tokens = tokens;
    this.variables = variables;
  }

  private peek(): Token | null {
    return this.tokens[this.pos] || null;
  }

  private advance(): Token | null {
    return this.tokens[this.pos++] || null;
  }

  parseExpression(): number {
    return this.parseAdditive();
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();

    while (this.peek() && (this.peek()!.type === 'PLUS' || this.peek()!.type === 'MINUS')) {
      const op = this.advance()!;
      const right = this.parseMultiplicative();
      if (op.type === 'PLUS') {
        left = left + right;
      } else {
        left = left - right;
      }
    }

    return left;
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary();

    while (this.peek() && (this.peek()!.type === 'MULTIPLY' || this.peek()!.type === 'DIVIDE')) {
      const op = this.advance()!;
      const right = this.parseUnary();
      if (op.type === 'MULTIPLY') {
        left = left * right;
      } else {
        if (right === 0) {
          throw new Error('Division by zero');
        }
        left = left / right;
      }
    }

    return left;
  }

  private parseUnary(): number {
    if (this.peek() && this.peek()!.type === 'MINUS') {
      this.advance();
      return -this.parseUnary();
    }

    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.peek();

    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    if (token.type === 'NUMBER') {
      this.advance();
      return token.value as number;
    }

    if (token.type === 'VARIABLE') {
      this.advance();
      const name = token.value as string;
      if (!this.variables.has(name)) {
        throw new Error(`Unknown variable: ${name}`);
      }
      return this.variables.get(name)!;
    }

    if (token.type === 'LPAREN') {
      this.advance();
      const result = this.parseExpression();
      if (!this.peek() || this.peek()!.type !== 'RPAREN') {
        throw new Error('Expected )');
      }
      this.advance();
      return result;
    }

    throw new Error('Syntax error');
  }
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toString();
  }

  // Round to 10 significant digits
  const str = num.toPrecision(10);
  const value = parseFloat(str);

  // Convert to string and handle trailing zeros
  let result = value.toString();

  // If still contains decimals, ensure no trailing zeros
  if (result.includes('.')) {
    result = result.replace(/0+$/, '');
    result = result.replace(/\.$/, '');
  }

  return result;
}

// Main program
const input = Deno.args[0];
const lines = input.split('\n');
const variables = new Map<string, number>();

for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const line = lines[lineNum - 1];

  // Skip blank lines
  if (line.trim() === '') {
    continue;
  }

  // Parse assignment
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) {
    console.log(`error line ${lineNum}: syntax`);
    Deno.exit(0);
  }

  const nameStr = line.substring(0, eqIndex).trim();
  const exprStr = line.substring(eqIndex + 1).trim();

  // Validate name
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nameStr)) {
    console.log(`error line ${lineNum}: syntax`);
    Deno.exit(0);
  }

  // Tokenize and parse expression
  try {
    const lexer = new Lexer(exprStr);
    const tokens = lexer.tokenize();

    if (tokens.length === 0) {
      console.log(`error line ${lineNum}: syntax`);
      Deno.exit(0);
    }

    const parser = new Parser(tokens, variables);
    const value = parser.parseExpression();

    // Check if all tokens were consumed
    if (parser['pos'] < parser['tokens'].length) {
      console.log(`error line ${lineNum}: syntax`);
      Deno.exit(0);
    }

    variables.set(nameStr, value);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('Unknown variable')) {
      const varName = msg.match(/Unknown variable: (\w+)/)?.[1] || 'unknown';
      console.log(`error line ${lineNum}: unknown variable ${varName}`);
    } else if (msg.includes('Division by zero')) {
      console.log(`error line ${lineNum}: division by zero`);
    } else {
      console.log(`error line ${lineNum}: syntax`);
    }
    Deno.exit(0);
  }
}

// Sort variables by name and print
const sorted = Array.from(variables.entries()).sort((a, b) => a[0].localeCompare(b[0]));

for (const [name, value] of sorted) {
  const formatted = formatNumber(value);
  console.log(`${name} = ${formatted}`);
}
