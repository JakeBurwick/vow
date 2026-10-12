const input = Deno.args[0];
const lines = input.split('\n');

const variables: Map<string, number> = new Map();

interface Expression {
  type: 'number' | 'variable' | 'unary' | 'binary';
  value?: number;
  name?: string;
  operator?: string;
  left?: Expression;
  right?: Expression;
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) {
      i++;
    } else if (/[+\-*/()=]/.test(expr[i])) {
      tokens.push(expr[i]);
      i++;
    } else if (/\d/.test(expr[i])) {
      let num = '';
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push(num);
    } else if (/[a-zA-Z_]/.test(expr[i])) {
      let name = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      tokens.push(name);
    } else {
      i++;
    }
  }
  return tokens;
}

function isNumber(s: string): boolean {
  return /^(\d+\.?\d*|\.\d+)$/.test(s);
}

function isVariableName(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

class Parser {
  tokens: string[];
  pos: number = 0;

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  peek(): string | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  consume(): string | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos++] : null;
  }

  parse(): Expression {
    const expr = this.parseExpression();
    if (this.pos !== this.tokens.length) {
      throw new Error('syntax');
    }
    return expr;
  }

  parseExpression(): Expression {
    return this.parseAdditive();
  }

  parseAdditive(): Expression {
    let left = this.parseMultiplicative();

    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume() as string;
      const right = this.parseMultiplicative();
      left = {
        type: 'binary',
        operator: op,
        left,
        right
      };
    }

    return left;
  }

  parseMultiplicative(): Expression {
    let left = this.parseUnary();

    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.consume() as string;
      const right = this.parseUnary();
      left = {
        type: 'binary',
        operator: op,
        left,
        right
      };
    }

    return left;
  }

  parseUnary(): Expression {
    if (this.peek() === '-') {
      this.consume();
      const expr = this.parseUnary();
      return {
        type: 'unary',
        operator: '-',
        right: expr
      };
    }

    return this.parsePrimary();
  }

  parsePrimary(): Expression {
    const token = this.peek();

    if (token === '(') {
      this.consume();
      const expr = this.parseExpression();
      if (this.consume() !== ')') {
        throw new Error('syntax');
      }
      return expr;
    }

    if (token === null) {
      throw new Error('syntax');
    }

    if (isNumber(token)) {
      this.consume();
      return {
        type: 'number',
        value: parseFloat(token)
      };
    }

    if (isVariableName(token)) {
      this.consume();
      return {
        type: 'variable',
        name: token
      };
    }

    throw new Error('syntax');
  }
}

function evaluate(expr: Expression, vars: Map<string, number>): number {
  if (expr.type === 'number') {
    return expr.value!;
  } else if (expr.type === 'variable') {
    const val = vars.get(expr.name!);
    if (val === undefined) {
      throw new Error(`unknown variable ${expr.name}`);
    }
    return val;
  } else if (expr.type === 'unary') {
    const right = evaluate(expr.right!, vars);
    return -right;
  } else if (expr.type === 'binary') {
    const left = evaluate(expr.left!, vars);
    const right = evaluate(expr.right!, vars);

    switch (expr.operator) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        if (right === 0) {
          throw new Error('division by zero');
        }
        return left / right;
    }
  }

  throw new Error('syntax');
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toString();
  }

  // Round to 10 significant digits using toPrecision
  const str = num.toPrecision(10);
  let result = parseFloat(str).toString();

  // Remove trailing zeros after decimal point
  if (result.includes('.')) {
    result = result.replace(/\.?0+$/, '');
  }

  return result;
}

// Process lines
for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
  const line = lines[lineNum - 1];

  // Ignore blank lines
  if (line.trim() === '') {
    continue;
  }

  // Parse assignment
  const assignmentMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
  if (!assignmentMatch) {
    console.log(`error line ${lineNum}: syntax`);
    Deno.exit(0);
  }

  const varName = assignmentMatch[1];
  const exprStr = assignmentMatch[2];

  try {
    const tokens = tokenize(exprStr);
    const parser = new Parser(tokens);
    const expr = parser.parse();
    const value = evaluate(expr, variables);
    variables.set(varName, value);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.startsWith('unknown variable')) {
        const match = e.message.match(/unknown variable (.+)/);
        console.log(`error line ${lineNum}: unknown variable ${match?.[1]}`);
      } else if (e.message === 'division by zero') {
        console.log(`error line ${lineNum}: division by zero`);
      } else {
        console.log(`error line ${lineNum}: syntax`);
      }
    } else {
      console.log(`error line ${lineNum}: syntax`);
    }
    Deno.exit(0);
  }
}

// Print variables sorted by name
const sorted = Array.from(variables.entries()).sort((a, b) => a[0].localeCompare(b[0]));
for (const [name, value] of sorted) {
  console.log(`${name} = ${formatNumber(value)}`);
}
