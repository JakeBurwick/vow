const text = Deno.args[0];
const width = parseInt(Deno.args[1], 10);

if (isNaN(width) || width <= 0) {
  console.log('error: bad width');
  process.exit(1);
}

const words = text.split(/\s+/);
let line = '';
let lineNum = 1;

for (const word of words) {
  if (word.length > width) {
    console.log(`${lineNum}: ${word}`);
    line = word;
    lineNum++;
  } else if (line.length + word.length + 1 > width) {
    console.log(`${lineNum}: ${line}`);
    line = word;
    lineNum++;
  } else {
    if (line) {
      line += ' ';
    }
    line += word;
  }
}

if (line) {
  console.log(`${lineNum}: ${line}`);
}
