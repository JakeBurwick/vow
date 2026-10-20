// Bad-data bench, held-out set 3 (2026-10-20): three fresh happy-path-only tickets, built the same
// way as bench/turf/bad and bad2. Expected outputs come from refs/<id>.py; verify.mjs cross-checks
// refs/<id>.ts and .vow and proves all three refs are loud on every bad check.
//   node bench/turf/bad3/gen.mjs   -> writes tasks.js
import { writeFileSync } from 'node:fs';
import { runOne, isLoud } from '../bad/lib.mjs';
const REFS = new URL('./refs', import.meta.url).pathname;
const H = (trap, stdin) => ({ stdin, trap });
const B = (trap, stdin) => ({ stdin, trap, bad: true });

// ---------- payroll (CSV, Python's turf) ----------
const paySpec = `Payroll.

Standard input is a CSV export from another system. The first line is the header \`employee,dept,hours,rate\`. Every other line is one employee: their name, their department, the hours they worked (a number with at most 2 decimals, like 40, 37.5 or 12.25) and their hourly rate in dollars (a number with at most 2 decimals, like 25.50 or 19). No field contains a comma or a quote. Lines end with \\n.

An employee's pay is hours x rate, computed exactly and then rounded to the cent, halves rounded up (12.25 x 19.99 = 244.8775 pays 244.88, and 1.5 x 10.01 = 15.015 pays 15.02).

Output:
- one line per department, in department order by Unicode code point: \`DEPT TOTAL HEADCOUNT\`, where TOTAL is the sum of its employees' rounded pay with exactly 2 decimals and HEADCOUNT is its number of employees;
- then \`total X.XX\`: the sum of every employee's rounded pay, with exactly 2 decimals;
- then \`top EMPLOYEE\`: the employee with the highest rounded pay (if several share it, the first of them by name in Unicode code point order).

Example: standard input
employee,dept,hours,rate
Ana,Ops,40,25.50
Ben,Eng,37.5,48.10
Cal,Ops,12.25,19.99
prints
Eng 1803.75 1
Ops 1264.88 2
total 3068.63
top Ben`;

const PHDR = 'employee,dept,hours,rate\n';
const pay = (...rows) => PHDR + rows.map((r) => r + '\n').join('');
const PGOOD = ['Ana,Ops,40,25.50', 'Ben,Eng,37.5,48.10', 'Cal,Ops,12.25,19.99'];
const payChecks = [
  pay(...PGOOD),
  pay('Dee,Sales,8,15'),
  pay('Eli,Lab,10.5,30.25', 'Fay,Lab,20,12.10', 'Gus,Desk,0.25,99.99'),
];
const payHidden = [
  H('single employee', pay('Solo,Ops,1,0.01')),
  H('dept order by code point', pay('a,ops,1,1', 'b,Ops,1,2', 'c,Éclair,1,3', 'd,eng,1,4', 'e,Eng 2,1,5', 'f,Eng,1,6')),
  H('pay half up at exactly half a cent', pay('Hal,Ops,1.5,10.01', 'Ida,Ops,0.5,0.01', 'Jo,Eng,0.5,0.03', 'Ken,Eng,2.5,0.21')),
  H('top tie broken by name code point', pay('bob,X,10,10', 'Bob,Y,4,25', 'Émile,X,20,5', 'Zed,Y,99.99,0.01')),
  H('zero hours still counts in headcount', pay('Nil,Ops,0,25', 'One,Ops,0.01,0.01', 'Two,Lab,0,0')),
  H('cents summed exactly', pay(...Array.from({ length: 10 }, (_, i) => `w${i},Ops,0.1,1.01`), 'x,Eng,0.07,1', 'y,Eng,0.33,0.33')),
  H('large amounts', pay('Big,Exec,9999.99,9999.99', 'Bigger,Exec,8760,1234.56', 'Small,Ops,0.01,0.01')),
  H('non-ASCII names with spaces, no final newline', PHDR + 'José Ñúñez,Ventas,40,22.5\n李雷,研发,38.25,60\nMary Ann Lee,Ventas,12,18.75'),
  H('leading zeros and trailing zeros', pay('Lu,Ops,007.50,010.00', 'Mo,Ops,08,9.9', 'Ny,Ops,40.00,0.10')),
];
payHidden.push(
  B('hours not a number (40h)', pay(PGOOD[0], 'Ben,Eng,40h,48.10', PGOOD[2])),
  B('hours empty', pay(PGOOD[0], 'Ben,Eng,,48.10', PGOOD[2])),
  B('hours Infinity', pay(PGOOD[0], 'Ben,Eng,Infinity,48.10', PGOOD[2])),
  B('rate NaN', pay(PGOOD[0], 'Ben,Eng,37.5,NaN', PGOOD[2])),
  B('row with 3 fields', pay(PGOOD[0], 'Ben,Eng,37.5', PGOOD[2])),
  B('decimal comma splits rate into 5 fields', pay(PGOOD[0], 'Ben,Eng,37.5,48,10', PGOOD[2])),
  B('name with a comma splits the row into 5 fields', pay(PGOOD[0], 'Lee, Ben,Eng,37.5,48.10', PGOOD[2])),
  B('dept empty', pay(PGOOD[0], 'Ben,,37.5,48.10', PGOOD[2])),
  B('header without rate', 'employee,dept,hours\nAna,Ops,40\nBen,Eng,37.5\n'),
  B('header only, no top earner', PHDR),
  B('empty input, no header and no top earner', ''),
);

// ---------- order-merge (JSON, TypeScript's turf) ----------
const orderSpec = `Order merge.

Arg 1 is a JSON object exported from another system: {"orders": [...]}. Each element of "orders" is an object with "id" (a whole number), "customer" (a string) and "items" (an array). Each element of "items" is an object with "sku" (a string), "qty" (a whole number of units) and "price" (the price of one unit in dollars, a number with at most 2 decimals, like 4.5, 19.99 or 3). A customer can have several orders.

Per customer: ORDERS is their number of orders, ITEMS is the sum of qty over all items of all their orders, and SPENT is the sum of qty x price over those items, computed exactly in cents.

Output:
- one line per customer, in customer order by Unicode code point: \`CUSTOMER ORDERS ITEMS SPENT\`, where SPENT has exactly 2 decimals;
- then \`best SKU QTY\`: the sku with the largest total qty over all orders of all customers, and that total (if several share it, the first of them in Unicode code point order).

Example: arg 1 = {"orders":[{"id":1,"customer":"Kim","items":[{"sku":"PEN","qty":3,"price":1.25},{"sku":"PAD","qty":1,"price":4.5}]},{"id":2,"customer":"Ali","items":[{"sku":"PEN","qty":2,"price":1.25}]},{"id":3,"customer":"Kim","items":[{"sku":"INK","qty":4,"price":2.99}]}]} prints
Ali 1 2 2.50
Kim 2 8 20.21
best PEN 5`;

const it = (sku, qty, price) => ({ sku, qty, price });
const od = (id, customer, ...items) => ({ id, customer, items });
const O = (...orders) => JSON.stringify({ orders });
const OEX = [od(1, 'Kim', it('PEN', 3, 1.25), it('PAD', 1, 4.5)), od(2, 'Ali', it('PEN', 2, 1.25)), od(3, 'Kim', it('INK', 4, 2.99))];
const orderChecks = [
  [O(...OEX)],
  [O(od(7, 'Zoe', it('MUG', 1, 8)))],
  [O(od(1, 'Bea', it('CAP', 2, 0.99)), od(2, 'Cal', it('CAP', 1, 0.99), it('HAT', 3, 12.5)), od(3, 'Bea', it('HAT', 1, 12.5)))],
];
const OH = (trap, a) => ({ args: [a], trap });
const OB = (trap, a) => ({ args: [a], trap, bad: true });
const exWith = (o2) => '{"orders":[' + JSON.stringify(OEX[0]) + ',' + o2 + ',' + JSON.stringify(OEX[2]) + ']}';
const orderHidden = [
  OH('single order, single item', O(od(1, 'Solo', it('A1', 1, 0.01)))),
  OH('customer order by code point', O(od(1, 'bo', it('X', 1, 1)), od(2, 'Bo', it('X', 1, 2)), od(3, 'Émile', it('X', 1, 3)), od(4, 'Al', it('X', 1, 4)), od(5, 'al', it('X', 1, 5)))),
  OH('one customer, many orders merged', O(od(10, 'Kim', it('A', 1, 1)), od(11, 'Kim', it('B', 2, 2)), od(12, 'Kim', it('A', 3, 3)), od(13, 'Kim', it('C', 1, 0.5)))),
  OH('best tie broken by sku code point', O(od(1, 'P', it('b-1', 3, 1), it('B-1', 3, 1)), od(2, 'Q', it('a10', 2, 1), it('a9', 1, 1), it('a10', 1, 1)))),
  OH('cents summed exactly', O(...Array.from({ length: 10 }, (_, i) => od(i + 1, 'Dot', it('D', 1, 0.1))), od(11, 'Eve', it('E', 3, 0.07), it('F', 1, 0.29)))),
  OH('whole and 1-decimal prices, a free item', O(od(1, 'Gil', it('G', 2, 3), it('H', 5, 0.5), it('FREE', 7, 0)))),
  OH('large amounts', O(od(1, 'Corp', it('CRANE', 1000, 99999.99), it('BOLT', 250000, 0.01)), od(2, 'Corp', it('CRANE', 1, 99999.99)))),
  OH('non-ASCII names with spaces', O(od(1, 'José Ñúñez', it('café', 2, 3.75)), od(2, '李雷', it('茶', 1, 12)), od(3, 'Mary Ann Lee', it('café', 1, 3.75)))),
  OH('whitespace and key order in JSON', '{\n  "orders": [\n    {"items": [{"price": 2.5, "qty": 2, "sku": "S"}], "customer": "Ann", "id": 9},\n    {"customer": "Bo", "id": 3, "items": [{"qty": 1, "sku": "T", "price": 10}]}\n  ]\n}'),
  OB('no orders, best sku of nothing', O()),
  OB('top level is an array, not an object', JSON.stringify(OEX)),
  OB('invalid JSON (cut off)', O(...OEX).slice(0, -12)),
  OB('order element is null', exWith('null')),
  OB('customer missing', exWith(JSON.stringify({ id: 2, items: [it('PEN', 2, 1.25)] }))),
  OB('items missing', exWith(JSON.stringify({ id: 2, customer: 'Ali' }))),
  OB('sku missing', exWith(JSON.stringify({ id: 2, customer: 'Ali', items: [{ qty: 2, price: 1.25 }] }))),
  OB('qty is null', exWith(JSON.stringify(od(2, 'Ali', it('PEN', null, 1.25))))),
  OB('qty is true', exWith(JSON.stringify(od(2, 'Ali', it('PEN', true, 1.25))))),
  OB('price missing', exWith(JSON.stringify({ id: 2, customer: 'Ali', items: [{ sku: 'PEN', qty: 2 }] }))),
  OB('price 1e999 (overflows to Infinity)', exWith('{"id":2,"customer":"Ali","items":[{"sku":"PEN","qty":2,"price":1e999}]}')),
  OB('price written NaN (not JSON)', exWith('{"id":2,"customer":"Ali","items":[{"sku":"PEN","qty":2,"price":NaN}]}')),
];

// ---------- temp-readings (text, both turfs) ----------
const tempSpec = `Temperature readings.

Standard input is a log of temperature readings exported from another system, one reading per line, like
OSL 2026-01-05 06:00 -3.5
The 4 fields are separated by single spaces: the station code (no spaces), the date (YYYY-MM-DD), the time (HH:MM, 24-hour) and the temperature in degrees Celsius with 1 decimal (like -3.5, 0.4 or 21.0). Lines are in no particular order and end with \\n.

Output:
- one line per station, in station order by Unicode code point: \`STATION MIN MAX MEAN\`: its lowest reading, its highest reading and the mean of its readings, each with exactly 1 decimal. The mean is computed exactly and rounded to 1 decimal, halves rounded up toward the larger value (-2.25 becomes -2.2, 2.25 becomes 2.3). A value that is zero prints as 0.0, never -0.0;
- then \`coldest STATION DATE\`: the station and date of the lowest single reading (if several share it, the one with the earliest date, and among those the first station in Unicode code point order).

Example: standard input
OSL 2026-01-05 06:00 -3.5
BER 2026-01-05 06:00 1.2
OSL 2026-01-04 18:00 -7.0
OSL 2026-01-05 14:00 0.4
BER 2026-01-04 06:00 -7.0
prints
BER -7.0 1.2 -2.9
OSL -7.0 0.4 -3.4
coldest BER 2026-01-04`;

const R = (s, d, t, v) => `${s} ${d} ${t} ${v}\n`;
const rd = (...rows) => rows.map((r) => R(...r)).join('');
const TGOOD = [['OSL', '2026-01-05', '06:00', '-3.5'], ['BER', '2026-01-05', '06:00', '1.2'], ['OSL', '2026-01-04', '18:00', '-7.0'], ['OSL', '2026-01-05', '14:00', '0.4'], ['BER', '2026-01-04', '06:00', '-7.0']];
const tempChecks = [
  rd(...TGOOD),
  rd(['HEL', '2026-02-01', '12:00', '-12.3']),
  rd(['ROM', '2026-07-01', '13:00', '31.4'], ['ROM', '2026-07-02', '13:00', '29.9'], ['MAD', '2026-07-01', '13:00', '35.0'], ['MAD', '2026-07-02', '05:00', '18.2']),
];
const T1 = rd(TGOOD[0], TGOOD[1]); // good readings before each bad line
const tempHidden = [
  H('single reading', rd(['ONE', '2026-03-03', '03:03', '7.7'])),
  H('station order by code point', rd(['osl', '2026-01-01', '00:00', '1.0'], ['OSL', '2026-01-01', '00:00', '2.0'], ['ÅLE', '2026-01-01', '00:00', '3.0'], ['B2', '2026-01-01', '00:00', '4.0'], ['B10', '2026-01-01', '00:00', '5.0'])),
  H('mean half up at .x5, positive and negative', rd(['POS', '2026-05-01', '10:00', '2.0'], ['POS', '2026-05-01', '11:00', '2.5'], ['NEG', '2026-05-01', '10:00', '-2.0'], ['NEG', '2026-05-01', '11:00', '-2.5'])),
  H('mean that rounds to zero and a -0.0 reading print 0.0', rd(['ZA', '2026-06-01', '01:00', '-0.1'], ['ZA', '2026-06-01', '02:00', '0.0'], ['ZB', '2026-06-01', '01:00', '-0.0'], ['ZC', '2026-06-01', '01:00', '-0.3'], ['ZC', '2026-06-01', '02:00', '0.2'])),
  H('coldest tie: earliest date, then station', rd(['KIR', '2026-01-09', '06:00', '-20.5'], ['ABI', '2026-01-08', '23:00', '-20.5'], ['ABA', '2026-01-08', '01:00', '-20.5'], ['ABA', '2026-01-07', '01:00', '-20.4'])),
  H('tenths summed exactly over many readings', rd(...Array.from({ length: 10 }, (_, i) => ['T', '2026-04-01', `0${i}:00`, '0.1']), ['U', '2026-04-01', '00:00', '0.2'], ['U', '2026-04-01', '01:00', '0.1'], ['U', '2026-04-01', '02:00', '0.1'])),
  H('lines out of order, across year end and leap day', rd(['X', '2026-01-01', '00:00', '-1.0'], ['X', '2025-12-31', '23:59', '-1.0'], ['Y', '2024-02-29', '12:00', '-1.0'], ['X', '2025-12-31', '00:00', '5.5'])),
  H('extreme values', rd(['VOS', '1983-07-21', '05:00', '-89.2'], ['DV', '1913-07-10', '14:00', '56.7'], ['VOS', '1983-07-22', '05:00', '-80.0'])),
  H('no final newline', rd(['END', '2026-12-31', '23:00', '-0.5'], ['END', '2026-12-31', '23:30', '-1.5']).replace(/\n$/, '')),
  B('temp not a number (12a)', T1 + R('OSL', '2026-01-04', '18:00', '12a')),
  B('temp missing (3 fields)', T1 + 'OSL 2026-01-04 18:00\n'),
  B('temp empty (trailing space)', T1 + R('OSL', '2026-01-04', '18:00', '')),
  B('temp NaN', T1 + R('OSL', '2026-01-04', '18:00', 'NaN')),
  B('temp -Infinity', T1 + R('OSL', '2026-01-04', '18:00', '-Infinity')),
  B('temp N/A', T1 + R('OSL', '2026-01-04', '18:00', 'N/A')),
  B('decimal comma in temp', T1 + R('OSL', '2026-01-04', '18:00', '-7,0')),
  B('station with a space makes 5 fields', T1 + R('NEW YORK', '2026-01-04', '18:00', '-7.0')),
  B('impossible date 2026-02-30', T1 + R('OSL', '2026-02-30', '18:00', '-7.0')),
  B('date in another format (04/01/2026)', T1 + R('OSL', '04/01/2026', '18:00', '-7.0')),
  B('empty input, no coldest reading', ''),
];

function fill(id, list, hidden) {
  return list.map((c) => {
    const chk = Array.isArray(c) ? { args: c } : typeof c === 'string' ? { args: [], stdin: c } : { args: c.args ?? [], ...(c.stdin !== undefined ? { stdin: c.stdin } : {}) };
    const res = runOne(`${REFS}/${id}.py`, chk);
    if (c.bad) {
      if (!isLoud(res)) throw new Error(`${id} [${c.trap}]: py ref is not loud: ${JSON.stringify(res)}`);
      return { ...chk, trap: c.trap, bad: true };
    }
    if (res.code !== 0) throw new Error(`${id} [${c.trap ?? 'visible'}]: py ref failed on a happy check: ${res.stderr}`);
    const r = { ...chk, expect: res.stdout.replace(/\n+$/, '') };
    if (hidden) r.trap = c.trap;
    return r;
  });
}
const tasks = [
  { id: 'payroll', name: 'Pay per department, total and top earner from a payroll CSV export', arena: 'csv', spec: paySpec, input: 'standard input', checks: fill('payroll', payChecks), hidden: fill('payroll', payHidden, true) },
  { id: 'order-merge', name: 'Orders, items and spend per customer and best sku from a JSON order export', arena: 'json', spec: orderSpec, input: 'its first command-line argument', checks: fill('order-merge', orderChecks), hidden: fill('order-merge', orderHidden, true) },
  { id: 'temp-readings', name: 'Min, max and mean per station and coldest reading from a temperature log', arena: 'text', spec: tempSpec, input: 'standard input', checks: fill('temp-readings', tempChecks), hidden: fill('temp-readings', tempHidden, true) },
];
const body = `// GENERATED by gen.mjs. Bad-data held-out set 3; happy expects from refs/<id>.py, cross-checked against
// refs/<id>.ts and refs/<id>.vow by verify.mjs. Checks with bad: true have no expect. Do not hand-edit.\n` +
  `export const BAD_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./tasks.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(`${t.id.padEnd(17)} visible ${t.checks.length}  hidden happy ${t.hidden.filter((c) => !c.bad).length}  hidden bad ${t.hidden.filter((c) => c.bad).length}`);
