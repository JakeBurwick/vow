const input = Deno.args[0];
const stack: string[] = [];
const pairs: { [key: string]: string } = {
  ')': '(',
  ']': '[',
  '}': '{'
};

for (const char of input) {
  if ('({['.includes(char)) {
    stack.push(char);
  } else if (')}]'.includes(char)) {
    if (stack.length === 0 || stack.pop() !== pairs[char]) {
      console.log('no');
      Deno.exit(0);
    }
  }
}

console.log(stack.length === 0 ? 'yes' : 'no');
