const input = Deno.args[0];
const tokens = input.split(' ');
const stack: number[] = [];

for (const token of tokens) {
  if (token === '+' || token === '-' || token === '*' || token === '/') {
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
    const num = parseInt(token, 10);
    if (isNaN(num)) {
      console.log('error');
      Deno.exit(0);
    }
    stack.push(num);
  }
}

if (stack.length !== 1) {
  console.log('error');
  Deno.exit(0);
}

const result = stack[0];
console.log(Math.trunc(result));
