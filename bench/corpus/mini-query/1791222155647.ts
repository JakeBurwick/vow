// mini-query: Parse CSV and execute SQL-like queries

try {
  const csv = Deno.args[0];
  const queryStr = Deno.args[1];

  // Parse CSV
  const lines = csv.split('\n').filter(line => line.length > 0);
  if (lines.length === 0) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  const header = lines[0].split(',');
  const rows = lines.slice(1).map(line => {
    const fields = line.split(',');
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = fields[i] || '';
    }
    return row;
  });

  // Parse query
  // SELECT <cols> [WHERE <col> <op> <val>] [ORDER BY <col> [DESC]] [LIMIT <n>]
  const selectMatch = queryStr.match(/^SELECT\s+([^\s]+)(?:\s|$)/i);
  if (!selectMatch) {
    console.log('error: bad query');
    Deno.exit(0);
  }

  const selectCols = selectMatch[1].split(',');

  // Check if all selected columns exist
  for (const col of selectCols) {
    if (!header.includes(col)) {
      console.log(`error: unknown column ${col}`);
      Deno.exit(0);
    }
  }

  let filteredRows = [...rows];

  // Parse WHERE clause
  const whereMatch = queryStr.match(/\sWHERE\s+(\S+)\s+(=|!=|<|>|<=|>=)\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
  if (whereMatch) {
    const whereCol = whereMatch[1];
    const op = whereMatch[2];
    const value = whereMatch[3];

    if (!header.includes(whereCol)) {
      console.log(`error: unknown column ${whereCol}`);
      Deno.exit(0);
    }

    // Determine if we're comparing numbers or strings
    const colValues = rows.map(r => r[whereCol]);
    const allNumeric = colValues.every(v => !isNaN(Number(v)));

    if (!allNumeric && !['=', '!='].includes(op)) {
      console.log('error: bad comparison');
      Deno.exit(0);
    }

    filteredRows = rows.filter(row => {
      const cellValue = row[whereCol];

      if (allNumeric) {
        const cellNum = Number(cellValue);
        const valNum = Number(value);

        switch (op) {
          case '=': return cellNum === valNum;
          case '!=': return cellNum !== valNum;
          case '<': return cellNum < valNum;
          case '>': return cellNum > valNum;
          case '<=': return cellNum <= valNum;
          case '>=': return cellNum >= valNum;
        }
      } else {
        switch (op) {
          case '=': return cellValue === value;
          case '!=': return cellValue !== value;
          default: return false;
        }
      }
    });
  }

  // Parse ORDER BY clause
  const orderMatch = queryStr.match(/\sORDER\s+BY\s+(\S+)(?:\s+(DESC))?/i);
  if (orderMatch) {
    const orderCol = orderMatch[1];
    const desc = orderMatch[2];

    if (!header.includes(orderCol)) {
      console.log(`error: unknown column ${orderCol}`);
      Deno.exit(0);
    }

    const colValues = filteredRows.map(r => r[orderCol]);
    const allNumeric = colValues.every(v => !isNaN(Number(v)));

    const originalIndexes = filteredRows.map((_, i) => i);

    filteredRows.sort((a, b) => {
      const aVal = a[orderCol];
      const bVal = b[orderCol];

      if (allNumeric) {
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        return desc ? bNum - aNum : aNum - bNum;
      } else {
        if (aVal < bVal) return desc ? 1 : -1;
        if (aVal > bVal) return desc ? -1 : 1;
        return 0;
      }
    });
  }

  // Parse LIMIT clause
  const limitMatch = queryStr.match(/\sLIMIT\s+(\d+)/i);
  let limit = Infinity;
  if (limitMatch) {
    limit = parseInt(limitMatch[1], 10);
    filteredRows = filteredRows.slice(0, limit);
  }

  // Output
  console.log(selectCols.join(','));

  for (const row of filteredRows) {
    const values = selectCols.map(col => row[col]);
    console.log(values.join(','));
  }

} catch (e) {
  console.log('error: bad query');
}
