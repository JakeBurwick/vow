const oldCsv = Deno.args[0] || "";
const newCsv = Deno.args[1] || "";

// Parse CSV
function parseCSV(csv: string): {
  headers: string[];
  rows: Map<string, Record<string, string>>;
} {
  const lines = csv.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: new Map() };
  }

  const headers = lines[0].split(",");
  const rows = new Map<string, Record<string, string>>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const key = values[0];
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.set(key, row);
  }

  return { headers, rows };
}

const oldData = parseCSV(oldCsv);
const newData = parseCSV(newCsv);

// Check headers
if (oldData.headers.join(",") !== newData.headers.join(",")) {
  console.log("error: headers differ");
  Deno.exit(0);
}

const headers = oldData.headers;
const oldRows = oldData.rows;
const newRows = newData.rows;

// Collect all keys
const allKeys = new Set([...oldRows.keys(), ...newRows.keys()]);
const sortedKeys = Array.from(allKeys).sort();

const changes: string[] = [];

for (const key of sortedKeys) {
  const oldRow = oldRows.get(key);
  const newRow = newRows.get(key);

  if (!oldRow) {
    // Key only in new table
    changes.push(`+ ${key}`);
  } else if (!newRow) {
    // Key only in old table
    changes.push(`- ${key}`);
  } else {
    // Key in both, check for changes
    for (let i = 1; i < headers.length; i++) {
      const col = headers[i];
      const oldVal = oldRow[col] || "";
      const newVal = newRow[col] || "";
      if (oldVal !== newVal) {
        changes.push(`~ ${key}: ${col} ${oldVal} -> ${newVal}`);
      }
    }
  }
}

if (changes.length === 0) {
  console.log("no changes");
} else {
  for (const change of changes) {
    console.log(change);
  }
}
