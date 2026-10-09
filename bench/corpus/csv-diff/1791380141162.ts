const oldCsv = Deno.args[0];
const newCsv = Deno.args[1];

function parseCsv(csv: string): { header: string[], rows: Map<string, Map<string, string>> } {
  const lines = csv.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) {
    return { header: [], rows: new Map() };
  }

  const header = lines[0].split(',');
  const rows = new Map<string, Map<string, string>>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const key = cols[0];
    const rowMap = new Map<string, string>();
    for (let j = 0; j < header.length; j++) {
      rowMap.set(header[j], cols[j] || '');
    }
    rows.set(key, rowMap);
  }

  return { header, rows };
}

const oldData = parseCsv(oldCsv);
const newData = parseCsv(newCsv);

// Check if headers differ
if (oldData.header.join(',') !== newData.header.join(',')) {
  console.log('error: headers differ');
  Deno.exit(0);
}

const header = oldData.header;
const oldRows = oldData.rows;
const newRows = newData.rows;

const allKeys = new Set([...oldRows.keys(), ...newRows.keys()]);
const sortedKeys = Array.from(allKeys).sort();

const changes: string[] = [];

for (const key of sortedKeys) {
  const oldRow = oldRows.get(key);
  const newRow = newRows.get(key);

  if (!oldRow && newRow) {
    changes.push(`+ ${key}`);
  } else if (oldRow && !newRow) {
    changes.push(`- ${key}`);
  } else if (oldRow && newRow) {
    // Check for column changes (skip the first column which is the key)
    for (let i = 1; i < header.length; i++) {
      const colName = header[i];
      const oldVal = oldRow.get(colName) || '';
      const newVal = newRow.get(colName) || '';
      if (oldVal !== newVal) {
        changes.push(`~ ${key}: ${colName} ${oldVal} -> ${newVal}`);
      }
    }
  }
}

if (changes.length === 0) {
  console.log('no changes');
} else {
  for (const change of changes) {
    console.log(change);
  }
}
