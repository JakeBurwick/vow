// Parse CSV and execute SQL-like query
const csvArg = Deno.args[0];
const queryArg = Deno.args[1];

// Parse CSV
const lines = csvArg.split('\n').filter((line) => line.length > 0);
if (lines.length === 0) {
  console.log('error: bad query');
  Deno.exit(0);
}

const header = lines[0].split(',');
const headerSet = new Set(header);
const rows = lines.slice(1).map((line) => line.split(','));

// Parse query
const queryTokens = queryArg.split(' ');
let idx = 0;

// Parse SELECT
if (idx >= queryTokens.length || queryTokens[idx] !== 'SELECT') {
  console.log('error: bad query');
  Deno.exit(0);
}
idx++;

if (idx >= queryTokens.length) {
  console.log('error: bad query');
  Deno.exit(0);
}

const selectCols = queryTokens[idx].split(',');
for (const col of selectCols) {
  if (!headerSet.has(col)) {
    console.log(`error: unknown column ${col}`);
    Deno.exit(0);
  }
}
idx++;

// Parse optional WHERE
let whereCol: string | null = null;
let whereOp: string | null = null;
let whereValue: string | null = null;

if (idx < queryTokens.length && queryTokens[idx] === 'WHERE') {
  idx++;
  if (idx >= queryTokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  whereCol = queryTokens[idx];
  if (!headerSet.has(whereCol)) {
    console.log(`error: unknown column ${whereCol}`);
    Deno.exit(0);
  }
  idx++;

  if (idx >= queryTokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  whereOp = queryTokens[idx];
  if (!['=', '!=', '<', '>', '<=', '>='].includes(whereOp)) {
    console.log('error: bad query');
    Deno.exit(0);
  }
  idx++;

  if (idx >= queryTokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  whereValue = queryTokens[idx];
  idx++;
}

// Parse optional ORDER BY
let orderCol: string | null = null;
let orderDesc = false;

if (idx < queryTokens.length && queryTokens[idx] === 'ORDER') {
  idx++;
  if (idx >= queryTokens.length || queryTokens[idx] !== 'BY') {
    console.log('error: bad query');
    Deno.exit(0);
  }
  idx++;

  if (idx >= queryTokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  orderCol = queryTokens[idx];
  if (!headerSet.has(orderCol)) {
    console.log(`error: unknown column ${orderCol}`);
    Deno.exit(0);
  }
  idx++;

  if (idx < queryTokens.length && queryTokens[idx] === 'DESC') {
    orderDesc = true;
    idx++;
  }
}

// Parse optional LIMIT
let limit: number | null = null;

if (idx < queryTokens.length && queryTokens[idx] === 'LIMIT') {
  idx++;
  if (idx >= queryTokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  const limitStr = queryTokens[idx];
  const limitNum = parseInt(limitStr, 10);
  if (isNaN(limitNum) || limitNum.toString() !== limitStr) {
    console.log('error: bad query');
    Deno.exit(0);
  }
  limit = limitNum;
  idx++;
}

// Check for extra tokens
if (idx !== queryTokens.length) {
  console.log('error: bad query');
  Deno.exit(0);
}

// Apply WHERE filter
let filtered = rows;
if (whereCol !== null && whereOp !== null && whereValue !== null) {
  const colIdx = header.indexOf(whereCol);
  filtered = rows.filter((row) => {
    const cellValue = row[colIdx];
    const cellNum = parseFloat(cellValue);
    const whereNum = parseFloat(whereValue!);
    const cellIsNum = !isNaN(cellNum) && cellValue.trim() !== '';
    const whereIsNum = !isNaN(whereNum) && whereValue!.trim() !== '';

    if (cellIsNum && whereIsNum) {
      // Numeric comparison
      switch (whereOp) {
        case '=':
          return cellNum === whereNum;
        case '!=':
          return cellNum !== whereNum;
        case '<':
          return cellNum < whereNum;
        case '>':
          return cellNum > whereNum;
        case '<=':
          return cellNum <= whereNum;
        case '>=':
          return cellNum >= whereNum;
        default:
          return false;
      }
    } else {
      // String comparison
      if (whereOp !== '=' && whereOp !== '!=') {
        console.log('error: bad comparison');
        Deno.exit(0);
      }
      if (whereOp === '=') {
        return cellValue === whereValue;
      } else {
        return cellValue !== whereValue;
      }
    }
  });
}

// Apply ORDER BY
if (orderCol !== null) {
  const colIdx = header.indexOf(orderCol);
  const isNumeric = filtered.every((row) => {
    const val = row[colIdx];
    const num = parseFloat(val);
    return !isNaN(num) && val.trim() !== '';
  });

  filtered.sort((a, b) => {
    const aVal = a[colIdx];
    const bVal = b[colIdx];

    if (isNumeric) {
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      return orderDesc ? bNum - aNum : aNum - bNum;
    } else {
      if (orderDesc) {
        return bVal.localeCompare(aVal);
      } else {
        return aVal.localeCompare(bVal);
      }
    }
  });
}

// Apply LIMIT
if (limit !== null) {
  filtered = filtered.slice(0, limit);
}

// Output results
const selectColIndices = selectCols.map((col) => header.indexOf(col));
console.log(selectCols.join(','));
for (const row of filtered) {
  const values = selectColIndices.map((idx) => row[idx]);
  console.log(values.join(','));
}
