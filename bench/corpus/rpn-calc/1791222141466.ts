const input = Deno.args[0];
const tokens = input.split(' ');
const stack: number[] = [];

for (const token of tokens) {
  if (['+', '-', '*', '/'].includes(token)) {
    if (stack.length < 2) {
      console.log('error');
      Deno.exit(0);
    }
    const b = stack.pop()!;
    const a = stack.pop()!;
    let result: number;
    if (token === '+') result = a + b;
    else if (token === '-') result = a - b;
    else if (token === '*') result = a * b;
    else if (token === '/') {
      if (b === 0) {
        console.log('error');
        Deno.exit(0);
      }
      result = Math.trunc(a / b);
    }
    stack.push(result!);
  } else if (/^-?\d+$/.test(token)) {
    stack.push(parseInt(token, 10));
  } else {
    console.log('error');
    Deno.exit(0);
  }
}

if (stack.length !== 1) {
  console.log('error');
} else {
  console.log(Math.floor(stack[0]));
}
