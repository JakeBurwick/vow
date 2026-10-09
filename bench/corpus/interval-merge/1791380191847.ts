const input = Deno.args[0] || "";

if (!input) {
  console.log("");
  Deno.exit(0);
}

const pieces = input.split(",");
const intervals: [number, number][] = [];

for (const piece of pieces) {
  const match = piece.match(/^(\d+)-(\d+)$/);

  if (!match) {
    console.log(`error: bad interval ${piece}`);
    Deno.exit(0);
  }

  const a = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);

  if (a > b) {
    console.log(`error: bad interval ${piece}`);
    Deno.exit(0);
  }

  intervals.push([a, b]);
}

// Sort intervals by start position
intervals.sort((x, y) => x[0] - y[0]);

// Merge overlapping or touching intervals
const merged: [number, number][] = [];

for (const [start, end] of intervals) {
  if (merged.length === 0) {
    merged.push([start, end]);
  } else {
    const [prevStart, prevEnd] = merged[merged.length - 1];
    // Merge if they overlap or touch (next starts at most 1 after previous ends)
    if (start <= prevEnd + 1) {
      merged[merged.length - 1][1] = Math.max(prevEnd, end);
    } else {
      merged.push([start, end]);
    }
  }
}

// Output
const result = merged.map(([a, b]) => `${a}-${b}`).join(",");
console.log(result);
