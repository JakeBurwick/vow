const text = Deno.args[0];
const widthStr = Deno.args[1];

// Validate width
if (!/^\d+$/.test(widthStr)) {
  console.log('error: bad width');
  Deno.exit(0);
}

const width = parseInt(widthStr, 10);
if (width <= 0) {
  console.log('error: bad width');
  Deno.exit(0);
}

// Split text into words
const words = text.split(/\s+/).filter(word => word.length > 0);

if (words.length === 0) {
  Deno.exit(0);
}

const lines: string[] = [];
let currentLine = '';

for (const word of words) {
  if (currentLine === '') {
    // Start a new line
    currentLine = word;
  } else if ((currentLine + ' ' + word).length <= width) {
    // Add word to current line
    currentLine += ' ' + word;
  } else {
    // Word doesn't fit, save current line and start new one
    lines.push(currentLine);
    currentLine = word;
  }
}

// Add last line if not empty
if (currentLine !== '') {
  lines.push(currentLine);
}

// Print lines with numbers
for (let i = 0; i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
