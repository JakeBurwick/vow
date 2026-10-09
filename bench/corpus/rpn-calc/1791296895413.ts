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

    if (token === '+') {
      stack.push(a + b);
    } else if (token === '-') {
      stack.push(a - b);
    } else if (token === '*') {
      stack.push(a * b);
    } else if (token === '/') {
      if (b === 0) {
        console.log('error');
        Deno.exit(0);
      }
      // Integer division
      stack.push(Math.floor(a / b));
    }
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

console.log(stack[0]);
