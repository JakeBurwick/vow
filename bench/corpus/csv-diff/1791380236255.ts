const oldCsv = Deno.args[0];
const newCsv = Deno.args[1];

// Parse CSV text into rows (filtering blank lines)
function parseCsv(csv: string): string[][] {
  return csv
    .split("\n")
    .filter(line => line.trim().length > 0)
    .map(line => line.split(","));
}

const oldRows = parseCsv(oldCsv);
const newRows = parseCsv(newCsv);

if (oldRows.length === 0 || newRows.length === 0) {
  console.log("error: headers differ");
  Deno.exit(0);
}

const oldHeader = oldRows[0];
const newHeader = newRows[0];

// Check if headers match
if (oldHeader.length !== newHeader.length || !oldHeader.every((v, i) => v === newHeader[i])) {
  console.log("error: headers differ");
  Deno.exit(0);
}

const header = oldHeader;
const keyColumnIndex = 0;

// Build maps of key -> row for both tables
const oldMap = new Map<string, string[]>();
for (let i = 1; i < oldRows.length; i++) {
  const key = oldRows[i][keyColumnIndex];
  oldMap.set(key, oldRows[i]);
}

const newMap = new Map<string, string[]>();
for (let i = 1; i < newRows.length; i++) {
  const key = newRows[i][keyColumnIndex];
  newMap.set(key, newRows[i]);
}

// Collect all keys and sort them
const allKeys = new Set<string>();
oldMap.forEach((_, key) => allKeys.add(key));
newMap.forEach((_, key) => allKeys.add(key));
const sortedKeys = Array.from(allKeys).sort();

const diffs: string[] = [];

for (const key of sortedKeys) {
  const oldRow = oldMap.get(key);
  const newRow = newMap.get(key);

  if (!oldRow) {
    // Key only in new table
    diffs.push(`+ ${key}`);
  } else if (!newRow) {
    // Key only in old table
    diffs.push(`- ${key}`);
  } else {
    // Key in both, check for column changes
    for (let colIdx = 1; colIdx < header.length; colIdx++) {
      const oldValue = oldRow[colIdx];
      const newValue = newRow[colIdx];
      if (oldValue !== newValue) {
        diffs.push(`~ ${key}: ${header[colIdx]} ${oldValue} -> ${newValue}`);
      }
    }
  }
}

if (diffs.length === 0) {
  console.log("no changes");
} else {
  diffs.forEach(diff => console.log(diff));
}
