const csv = Deno.args[0];
const queryStr = Deno.args[1];

interface Row {
  [key: string]: string;
}

// Parse CSV
const lines = csv.split('\n').filter(line => line.length > 0);
if (lines.length === 0) {
  console.log('error: bad query');
  Deno.exit(0);
}

const headers = lines[0].split(',');
const rows: Row[] = [];

for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',');
  const row: Row = {};
  for (let j = 0; j < headers.length; j++) {
    row[headers[j]] = values[j] || '';
  }
  rows.push(row);
}

// Helper to check if a string is numeric
function isNumeric(s: string): boolean {
  const num = parseFloat(s);
  return !isNaN(num) && s.trim() !== '';
}

// Parse query
const parts = queryStr.split(' ');
let idx = 0;

// Parse SELECT
if (idx >= parts.length || parts[idx] !== 'SELECT') {
  console.log('error: bad query');
  Deno.exit(0);
}
idx++;

if (idx >= parts.length) {
  console.log('error: bad query');
  Deno.exit(0);
}

const selectCols = parts[idx].split(',');
idx++;

// Validate select columns exist
for (const col of selectCols) {
  if (!headers.includes(col)) {
    console.log(`error: unknown column ${col}`);
    Deno.exit(0);
  }
}

let filteredRows = [...rows];

// Parse WHERE clause (optional)
let whereCol: string | null = null;
let whereOp: string | null = null;
let whereValue: string | null = null;

if (idx < parts.length && parts[idx] === 'WHERE') {
  idx++;
  if (idx + 2 >= parts.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  whereCol = parts[idx];
  whereOp = parts[idx + 1];
  whereValue = parts[idx + 2];
  idx += 3;

  if (!headers.includes(whereCol)) {
    console.log(`error: unknown column ${whereCol}`);
    Deno.exit(0);
  }

  // Validate operator
  if (!['=', '!=', '<', '>', '<=', '>='].includes(whereOp)) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  // Apply WHERE filter
  filteredRows = filteredRows.filter(row => {
    const cellValue = row[whereCol!];
    const cellNum = parseFloat(cellValue);
    const valueNum = parseFloat(whereValue!);

    const cellIsNum = isNumeric(cellValue);
    const valueIsNum = isNumeric(whereValue!);

    if (cellIsNum && valueIsNum) {
      // Numeric comparison
      switch (whereOp) {
        case '=': return cellNum === valueNum;
        case '!=': return cellNum !== valueNum;
        case '<': return cellNum < valueNum;
        case '>': return cellNum > valueNum;
        case '<=': return cellNum <= valueNum;
        case '>=': return cellNum >= valueNum;
      }
    } else {
      // String comparison
      if (whereOp !== '=' && whereOp !== '!=') {
        console.log('error: bad comparison');
        Deno.exit(0);
      }
      if (whereOp === '=') return cellValue === whereValue;
      if (whereOp === '!=') return cellValue !== whereValue;
    }
    return false;
  });
}

// Parse ORDER BY clause (optional)
let orderByCol: string | null = null;
let orderByDesc = false;

if (idx < parts.length && parts[idx] === 'ORDER') {
  idx++;
  if (idx >= parts.length || parts[idx] !== 'BY') {
    console.log('error: bad query');
    Deno.exit(0);
  }
  idx++;

  if (idx >= parts.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  orderByCol = parts[idx];
  idx++;

  if (!headers.includes(orderByCol)) {
    console.log(`error: unknown column ${orderByCol}`);
    Deno.exit(0);
  }

  if (idx < parts.length && parts[idx] === 'DESC') {
    orderByDesc = true;
    idx++;
  }

  // Apply ORDER BY
  const colValues = filteredRows.map(row => row[orderByCol!]);
  const allNumeric = colValues.every(v => isNumeric(v));

  if (allNumeric) {
    filteredRows.sort((a, b) => {
      const aNum = parseFloat(a[orderByCol!]);
      const bNum = parseFloat(b[orderByCol!]);
      return orderByDesc ? bNum - aNum : aNum - bNum;
    });
  } else {
    filteredRows.sort((a, b) => {
      const aVal = a[orderByCol!];
      const bVal = b[orderByCol!];
      if (aVal < bVal) return orderByDesc ? 1 : -1;
      if (aVal > bVal) return orderByDesc ? -1 : 1;
      return 0;
    });
  }
}

// Parse LIMIT clause (optional)
let limit: number | null = null;

if (idx < parts.length && parts[idx] === 'LIMIT') {
  idx++;
  if (idx >= parts.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  const limitValue = parts[idx];
  if (!/^\d+$/.test(limitValue)) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  limit = parseInt(limitValue);
  idx++;
}

// Check if there are extra tokens
if (idx < parts.length) {
  console.log('error: bad query');
  Deno.exit(0);
}

// Apply LIMIT
if (limit !== null) {
  filteredRows = filteredRows.slice(0, limit);
}

// Output
console.log(selectCols.join(','));
for (const row of filteredRows) {
  const values = selectCols.map(col => row[col]);
  console.log(values.join(','));
}
