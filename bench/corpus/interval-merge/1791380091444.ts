const arg = Deno.args[0] ?? "";

if (arg === "") {
  console.log("");
  Deno.exit(0);
}

// Parse intervals
const pieces = arg.split(",");
const intervals: [number, number][] = [];

for (const piece of pieces) {
  // Validate format: "a-b"
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

// Sort intervals by start
intervals.sort((x, y) => x[0] - y[0]);

// Merge intervals
const merged: [number, number][] = [];

for (const [start, end] of intervals) {
  if (merged.length === 0) {
    merged.push([start, end]);
  } else {
    const [lastStart, lastEnd] = merged[merged.length - 1];
    // Touching means next one starts at most 1 after previous one ends
    if (start <= lastEnd + 1) {
      // Merge
      merged[merged.length - 1] = [lastStart, Math.max(lastEnd, end)];
    } else {
      merged.push([start, end]);
    }
  }
}

// Output
const result = merged.map(([a, b]) => `${a}-${b}`).join(",");
console.log(result);
