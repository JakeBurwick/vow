const input = Deno.args[0];
const tokens = input.split(' ');
const stack: number[] = [];

const operators = new Set(['+', '-', '*', '/']);

for (const token of tokens) {
  if (operators.has(token)) {
    // Pop two operands
    if (stack.length < 2) {
      console.log('error');
      Deno.exit(0);
    }

    const b = stack.pop()!;
    const a = stack.pop()!;

    let result: number;

    switch (token) {
      case '+':
        result = a + b;
        break;
      case '-':
        result = a - b;
        break;
      case '*':
        result = a * b;
        break;
      case '/':
        if (b === 0) {
          console.log('error');
          Deno.exit(0);
        }
        result = a / b;
        break;
      default:
        console.log('error');
        Deno.exit(0);
    }

    stack.push(result);
  } else {
    // Try to parse as a number
    const num = parseInt(token, 10);
    if (isNaN(num) || token !== String(num)) {
      console.log('error');
      Deno.exit(0);
    }
    stack.push(num);
  }
}

// At the end, there should be exactly one value on the stack
if (stack.length !== 1) {
  console.log('error');
  Deno.exit(0);
}

// Print as integer with no decimal point
console.log(Math.floor(stack[0]));
