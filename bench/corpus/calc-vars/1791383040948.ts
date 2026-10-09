const input = Deno.args[0];
const lines = input.split('\n');

const variables = new Map<string, number>();

// Lexer
interface Token {
  type: 'NUMBER' | 'VARIABLE' | 'PLUS' | 'MINUS' | 'TIMES' | 'DIVIDE' | 'LPAREN' | 'RPAREN' | 'EOF';
  value: string;
}

class Lexer {
  private text: string;
  private pos: number;

  constructor(text: string) {
    this.text = text;
    this.pos = 0;
  }

  private skipWhitespace() {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) {
      this.pos++;
    }
  }

  nextToken(): Token {
    this.skipWhitespace();

    if (this.pos >= this.text.length) {
      return { type: 'EOF', value: '' };
    }

    const ch = this.text[this.pos];

    // Numbers (non-negative decimal)
    if (/\d/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.text.length && /[\d.]/.test(this.text[this.pos])) {
        this.pos++;
      }
      return { type: 'NUMBER', value: this.text.substring(start, this.pos) };
    }

    // Variables
    if (/[a-zA-Z_]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.text.length && /[a-zA-Z0-9_]/.test(this.text[this.pos])) {
        this.pos++;
      }
      return { type: 'VARIABLE', value: this.text.substring(start, this.pos) };
    }

    // Operators and parentheses
    if (ch === '+') {
      this.pos++;
      return { type: 'PLUS', value: '+' };
    }
    if (ch === '-') {
      this.pos++;
      return { type: 'MINUS', value: '-' };
    }
    if (ch === '*') {
      this.pos++;
      return { type: 'TIMES', value: '*' };
    }
    if (ch === '/') {
      this.pos++;
      return { type: 'DIVIDE', value: '/' };
    }
    if (ch === '(') {
      this.pos++;
      return { type: 'LPAREN', value: '(' };
    }
    if (ch === ')') {
      this.pos++;
      return { type: 'RPAREN', value: ')' };
    }

    throw new Error('Invalid character');
  }
}

// Parser with proper precedence
class Parser {
  private lexer: Lexer;
  private currentToken: Token;

  constructor(text: string) {
    this.lexer = new Lexer(text);
    this.currentToken = this.lexer.nextToken();
  }

  private advance() {
    this.currentToken = this.lexer.nextToken();
  }

  // Parse expression: handles + and - (lowest precedence)
  private parseExpression(): number {
    let result = this.parseTerm();

    while (this.currentToken.type === 'PLUS' || this.currentToken.type === 'MINUS') {
      const op = this.currentToken.type;
      this.advance();
      const right = this.parseTerm();
      if (op === 'PLUS') {
        result = result + right;
      } else {
        result = result - right;
      }
    }

    return result;
  }

  // Parse term: handles * and / (medium precedence)
  private parseTerm(): number {
    let result = this.parseUnary();

    while (this.currentToken.type === 'TIMES' || this.currentToken.type === 'DIVIDE') {
      const op = this.currentToken.type;
      this.advance();
      const right = this.parseUnary();
      if (op === 'TIMES') {
        result = result * right;
      } else {
        if (right === 0) {
          throw new Error('Division by zero');
        }
        result = result / right;
      }
    }

    return result;
  }

  // Parse unary: handles unary minus (tight binding)
  private parseUnary(): number {
    if (this.currentToken.type === 'MINUS') {
      this.advance();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  // Parse primary: handles numbers, variables, and parenthesized expressions
  private parsePrimary(): number {
    if (this.currentToken.type === 'NUMBER') {
      const value = parseFloat(this.currentToken.value);
      this.advance();
      return value;
    }

    if (this.currentToken.type === 'VARIABLE') {
      const name = this.currentToken.value;
      if (!variables.has(name)) {
        throw new Error(`UnknownVar:${name}`);
      }
      this.advance();
      return variables.get(name)!;
    }

    if (this.currentToken.type === 'LPAREN') {
      this.advance();
      const result = this.parseExpression();
      if (this.currentToken.type !== 'RPAREN') {
        throw new Error('Syntax');
      }
      this.advance();
      return result;
    }

    throw new Error('Syntax');
  }

  parse(): number {
    const result = this.parseExpression();
    if (this.currentToken.type !== 'EOF') {
      throw new Error('Syntax');
    }
    return result;
  }
}

// Process lines
for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const line = lines[lineNum - 1];

  // Skip blank lines
  if (line.trim() === '') {
    continue;
  }

  // Find assignment operator
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) {
    console.log(`error line ${lineNum}: syntax`);
    Deno.exit(0);
  }

  const nameStr = line.substring(0, eqIndex).trim();
  const exprStr = line.substring(eqIndex + 1).trim();

  // Validate variable name format
  if (!nameStr || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nameStr)) {
    console.log(`error line ${lineNum}: syntax`);
    Deno.exit(0);
  }

  try {
    const parser = new Parser(exprStr);
    const value = parser.parse();
    variables.set(nameStr, value);
  } catch (e) {
    const errorMsg = String(e.message || e);
    if (errorMsg.startsWith('UnknownVar:')) {
      const varName = errorMsg.substring(11);
      console.log(`error line ${lineNum}: unknown variable ${varName}`);
    } else if (errorMsg.includes('Division by zero')) {
      console.log(`error line ${lineNum}: division by zero`);
    } else {
      console.log(`error line ${lineNum}: syntax`);
    }
    Deno.exit(0);
  }
}

// Format and output variables in sorted order
function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }

  // Round to 10 significant digits
  let str = value.toPrecision(10);

  // Remove trailing zeros after decimal point
  str = str.replace(/\.?0+$/, '');

  // Handle scientific notation - convert back if needed
  if (str.includes('e')) {
    const num = parseFloat(str);
    str = num.toPrecision(10).replace(/\.?0+$/, '');
  }

  return str;
}

const sortedNames = Array.from(variables.keys()).sort();
for (const name of sortedNames) {
  const value = variables.get(name)!;
  const formatted = formatNumber(value);
  console.log(`${name} = ${formatted}`);
}
