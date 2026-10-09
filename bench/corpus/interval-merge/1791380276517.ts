const arg = Deno.args[0] || "";

if (!arg) {
  console.log("");
  Deno.exit(0);
}

const pieces = arg.split(",");
const intervals: [number, number][] = [];

// Parse and validate intervals
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

// Sort by start, then by end
intervals.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

// Merge overlapping/touching intervals
const merged: [number, number][] = [];
for (const [start, end] of intervals) {
  if (merged.length === 0) {
    merged.push([start, end]);
  } else {
    const [lastStart, lastEnd] = merged[merged.length - 1];
    // Touching means next starts at most 1 after previous ends
    if (start <= lastEnd + 1) {
      merged[merged.length - 1] = [lastStart, Math.max(lastEnd, end)];
    } else {
      merged.push([start, end]);
    }
  }
}

// Format output
const result = merged.map(([a, b]) => `${a}-${b}`).join(",");
console.log(result);
