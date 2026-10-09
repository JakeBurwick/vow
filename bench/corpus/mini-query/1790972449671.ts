const csv = Deno.args[0];
const query = Deno.args[1];

// Parse CSV
const lines = csv.split('\n');
if (lines.length === 0 || !lines[0]) {
  console.log('error: bad query');
  Deno.exit(0);
}

const header = lines[0].split(',');
const rows = lines.slice(1).map(line => {
  if (!line) return null;
  return line.split(',');
}).filter(r => r !== null) as string[][];

// Parse query
const tokens = query.split(' ');
let idx = 0;

// Expect SELECT
if (idx >= tokens.length || tokens[idx] !== 'SELECT') {
  console.log('error: bad query');
  Deno.exit(0);
}
idx++;

// Get column list (no spaces in the list)
if (idx >= tokens.length) {
  console.log('error: bad query');
  Deno.exit(0);
}
const colList = tokens[idx].split(',');
idx++;

// Validate columns exist
const colIndices: number[] = [];
for (const col of colList) {
  const i = header.indexOf(col);
  if (i === -1) {
    console.log(`error: unknown column ${col}`);
    Deno.exit(0);
  }
  colIndices.push(i);
}

// Optional WHERE clause
let whereFunc = (row: string[]) => true;
if (idx < tokens.length && tokens[idx] === 'WHERE') {
  idx++;

  if (idx + 2 >= tokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  const colName = tokens[idx];
  const op = tokens[idx + 1];
  const value = tokens[idx + 2];
  idx += 3;

  const colIdx = header.indexOf(colName);
  if (colIdx === -1) {
    console.log(`error: unknown column ${colName}`);
    Deno.exit(0);
  }

  const validOps = ['=', '!=', '<', '>', '<=', '>='];
  if (!validOps.includes(op)) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  whereFunc = (row: string[]) => {
    const cellValue = row[colIdx];
    const numCell = parseFloat(cellValue);
    const numValue = parseFloat(value);
    const isNumCell = !isNaN(numCell);
    const isNumValue = !isNaN(numValue);

    // If both are numbers, compare numerically
    if (isNumCell && isNumValue) {
      switch (op) {
        case '=': return numCell === numValue;
        case '!=': return numCell !== numValue;
        case '<': return numCell < numValue;
        case '>': return numCell > numValue;
        case '<=': return numCell <= numValue;
        case '>=': return numCell >= numValue;
      }
    } else {
      // String comparison - only = and != allowed
      if (op !== '=' && op !== '!=') {
        console.log('error: bad comparison');
        Deno.exit(0);
      }
      const strCell = cellValue;
      const strValue = value;
      switch (op) {
        case '=': return strCell === strValue;
        case '!=': return strCell !== strValue;
      }
    }
    return false;
  };
}

// Optional ORDER BY clause
let sortFunc: ((a: string[], b: string[]) => number) | null = null;
if (idx < tokens.length && tokens[idx] === 'ORDER') {
  idx++;

  if (idx >= tokens.length || tokens[idx] !== 'BY') {
    console.log('error: bad query');
    Deno.exit(0);
  }
  idx++;

  if (idx >= tokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  const sortCol = tokens[idx];
  idx++;

  const sortColIdx = header.indexOf(sortCol);
  if (sortColIdx === -1) {
    console.log(`error: unknown column ${sortCol}`);
    Deno.exit(0);
  }

  let desc = false;
  if (idx < tokens.length && tokens[idx] === 'DESC') {
    desc = true;
    idx++;
  }

  // Check if all values in the column are numbers
  const allNumbers = rows.every(row => {
    const val = row[sortColIdx];
    return !isNaN(parseFloat(val));
  });

  if (allNumbers) {
    sortFunc = (a: string[], b: string[]) => {
      const numA = parseFloat(a[sortColIdx]);
      const numB = parseFloat(b[sortColIdx]);
      const cmp = numA - numB;
      return desc ? -cmp : cmp;
    };
  } else {
    sortFunc = (a: string[], b: string[]) => {
      const strA = a[sortColIdx];
      const strB = b[sortColIdx];
      const cmp = strA.localeCompare(strB);
      return desc ? -cmp : cmp;
    };
  }
}

// Optional LIMIT clause
let limit = -1;
if (idx < tokens.length && tokens[idx] === 'LIMIT') {
  idx++;

  if (idx >= tokens.length) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  const limitStr = tokens[idx];
  const limitNum = parseInt(limitStr, 10);
  if (isNaN(limitNum)) {
    console.log('error: bad query');
    Deno.exit(0);
  }
  limit = limitNum;
  idx++;
}

// Check for extra tokens
if (idx < tokens.length) {
  console.log('error: bad query');
  Deno.exit(0);
}

// Filter rows by WHERE clause
let filtered = rows.filter(whereFunc);

// Sort if needed
if (sortFunc) {
  filtered.sort(sortFunc);
}

// Apply LIMIT if needed
if (limit >= 0) {
  filtered = filtered.slice(0, limit);
}

// Output
const selectedCols = colList.join(',');
console.log(selectedCols);

for (const row of filtered) {
  const values = colIndices.map(i => row[i]).join(',');
  console.log(values);
}
