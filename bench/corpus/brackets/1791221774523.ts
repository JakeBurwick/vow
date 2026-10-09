const input = Deno.args[0];

const pairs: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{'
};

const stack: string[] = [];

for (const char of input) {
  if (char === '(' || char === '[' || char === '{') {
    stack.push(char);
  } else if (char === ')' || char === ']' || char === '}') {
    if (stack.length === 0 || stack[stack.length - 1] !== pairs[char]) {
      console.log('no');
      Deno.exit(0);
    }
    stack.pop();
  }
}

if (stack.length === 0) {
  console.log('yes');
} else {
  console.log('no');
}
