const input = Deno.args[0];
const stack: string[] = [];

const pairs: { [key: string]: string } = {
  ')': '(',
  ']': '[',
  '}': '{'
};

const openBrackets = new Set(['(', '[', '{']);
const closeBrackets = new Set([')', ']', '}']);

for (const char of input) {
  if (openBrackets.has(char)) {
    stack.push(char);
  } else if (closeBrackets.has(char)) {
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
