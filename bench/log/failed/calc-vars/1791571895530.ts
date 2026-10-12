import { Deno } from 'deno';

const lines = Deno.args.slice(1).map(line => line.trim());

const variables: { [key: string]: number } = {};

function tokenize(expression: string): string[] {
  const tokens = [];
  let currentToken = '';
  for (const char of expression) {
    if (char.match(/^[a-zA-Z0-9_]+$/)) {
      currentToken += char;
    } else if (currentToken) {
      tokens.push(currentToken);
      currentToken = '';
    }
    if (char === '(' || char === ')') {
      tokens.push(char);
    }
  }
  if (currentToken) {
    tokens.push(currentToken);
  }
  return tokens;
}

function parseExpression(tokens: string[]): number {
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
  const operatorPrecedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
  const operatorStack: string[] = [];
  const outputQueue: string[] = [];
  for (const token of tokens) {
    if (token.match(/^[a-zA-Z0-9_]+$/)) {
      outputQueue.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop() as string);
      }
      operatorStack.pop();
    } else if (token.match(/^[+*/^-]/)) {
      while (operatorStack.length > 0 && operatorPrecedence[token] <= operatorPrecedence[operatorStack[operatorStack.length - 1]]) {
        outputQueue.push(operatorStack.pop() as string);
      }
      operatorStack.push(token);
    }
  }
  while (operatorStack.length > 0) {
    outputQueue.push(operatorStack.pop() as string);
  }
  const output = [];
  for (const token of outputQueue) {
    if (token.match(/^[a-zA-Z0-9_]+$/)) {
      output.push(parseFloat(variables[token] || 0));
    } else if (token === '+') {
      output.push(output.pop() as number + output.pop() as number);
    } else if (token === '-') {
      output.push(output.pop() as number - output.pop() as number);
    } else if (token === '*') {
      output.push(output.pop() as number * output.pop() as number);
    } else if (token === '/') {
      if (output.pop() as number === 0) {
        throw new Error(`division by zero`);
      }
      output.push(output.pop() as number / output.pop() as number);
    } else if (token === '^') {
      output.push(Math.pow(output.pop() as number, output.pop() as number));
    }
  }
  return output[0];
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line) {
    const [name, expression] = line.split(' = ');
    if (!variables[name]) {
      variables[name] = parseExpression(tokenize(expression));
    } else {
      const value = parseExpression(tokenize(expression));
      if (value !== variables[name]) {
        console.log(`error line ${i + 1}: syntax`);
        Deno.exit(1);
      }
      variables[name] = value;
    }
  }
}

const sortedVariables = Object.keys(variables).sort();
for (const name of sortedVariables) {
  console.log(`${name} = ${variables[name].toFixed(10g)}`);
}
