const text = Deno.args[0];
const widthStr = Deno.args[1];

// Validate width
if (!/^\d+$/.test(widthStr)) {
  console.log("error: bad width");
  Deno.exit(0);
}

const width = parseInt(widthStr, 10);
if (width <= 0) {
  console.log("error: bad width");
  Deno.exit(0);
}

// Split text into words on runs of whitespace
const words = text.split(/\s+/).filter(word => word.length > 0);

if (words.length === 0) {
  // Text with no words prints nothing
  Deno.exit(0);
}

const lines: string[] = [];
let currentLine = "";

for (const word of words) {
  if (currentLine.length === 0) {
    // First word on the line
    currentLine = word;
  } else if (currentLine.length + 1 + word.length <= width) {
    // Word fits with a space
    currentLine += " " + word;
  } else {
    // Word doesn't fit, start a new line
    lines.push(currentLine);
    currentLine = word;
  }
}

if (currentLine.length > 0) {
  lines.push(currentLine);
}

// Print each line
lines.forEach((line, idx) => {
  console.log(`${idx + 1}: ${line}`);
});
