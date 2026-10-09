const text = Deno.args[0] || "";
const widthStr = Deno.args[1] || "";

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

// Split text into words
const words = text.split(/\s+/).filter((word) => word.length > 0);

if (words.length === 0) {
  Deno.exit(0);
}

// Fill lines greedily
const lines: string[] = [];
let currentLine: string[] = [];
let currentLength = 0;

for (const word of words) {
  // Calculate length if we add this word
  const spaceNeeded = currentLine.length > 0 ? 1 : 0; // space before word
  const newLength = currentLength + spaceNeeded + word.length;

  if (newLength <= width) {
    // Word fits on current line
    currentLine.push(word);
    currentLength = newLength;
  } else {
    // Word doesn't fit, start new line
    if (currentLine.length > 0) {
      lines.push(currentLine.join(" "));
    }
    currentLine = [word];
    currentLength = word.length;
  }
}

// Add final line
if (currentLine.length > 0) {
  lines.push(currentLine.join(" "));
}

// Output
for (let i = 0; i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
