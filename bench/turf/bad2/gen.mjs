// Bad-data bench, held-out set 2 (2026-10-20): three fresh happy-path-only tickets, built the same
// way as bench/turf/bad. Expected outputs come from refs/<id>.py; verify.mjs cross-checks
// refs/<id>.ts and .vow and proves all three refs are loud on every bad check.
//   node bench/turf/bad2/gen.mjs   -> writes tasks.js
import { writeFileSync } from 'node:fs';
import { runOne, isLoud } from '../bad/lib.mjs';
const REFS = new URL('./refs', import.meta.url).pathname;
const H = (trap, stdin) => ({ stdin, trap });
const B = (trap, stdin) => ({ stdin, trap, bad: true });

// ---------- inventory-restock (CSV, Python's turf) ----------
const invSpec = `Inventory restock.

Standard input is a CSV export from another system. The first line is the header \`sku,name,on_hand,reorder_at,unit_cost\`. Every other line is one product: its stock code, its name, the number of units on hand (a whole number), the reorder point (a whole number) and the cost of one unit in dollars with at most 2 decimals (like 12.50, 4 or 0.5). No field contains a comma or a quote. Lines end with \\n.

A product needs restocking when on_hand <= reorder_at. Its restock quantity is QTY = 2 x reorder_at - on_hand, and its restock cost is QTY x unit_cost, computed exactly in cents.

Output:
- one line per product that needs restocking, in sku order by Unicode code point: \`SKU QTY COST\`, where COST has exactly 2 decimals;
- then \`total X.XX\`: the restock cost of all those products, with exactly 2 decimals;
- then \`items N\`: the number of products that need restocking.

Example: standard input
sku,name,on_hand,reorder_at,unit_cost
B-200,Hex bolt,4,10,0.25
A-100,Washer,50,20,0.05
C-300,Bracket,10,10,3.50
prints
B-200 16 4.00
C-300 10 35.00
total 39.00
items 2`;

const IHDR = 'sku,name,on_hand,reorder_at,unit_cost\n';
const inv = (...rows) => IHDR + rows.map((r) => r + '\n').join('');
const IGOOD = ['B-200,Hex bolt,4,10,0.25', 'A-100,Washer,50,20,0.05', 'C-300,Bracket,10,10,3.50'];
const invChecks = [
  inv(...IGOOD),
  inv('K1,Tape,0,5,1.99', 'K2,Glue,6,5,2'),
  inv('Z9,Hinge,3,4,0.5', 'M4,Screw,1,8,0.07', 'M5,Nut,9,8,0.03'),
];
const invHidden = [
  H('single product', inv('P1,Pipe,2,3,12.75')),
  H('sku order by code point', inv('éa,A,1,1,1', 'b2,B,1,1,2', 'B2,C,1,1,3', 'a10,D,1,1,4', 'a9,E,1,1,5')),
  H('on_hand equal to reorder_at is restocked, one above is not', inv('S1,At,7,7,1.10', 'S2,Above,8,7,1.10', 'S3,Below,6,7,1.10')),
  H('reorder_at 0 and on_hand 0: qty 0, cost 0.00', inv('Z0,Retired,0,0,9.99', 'Z1,Live,1,2,0.01')),
  H('nothing needs restocking', inv('N1,Full,10,2,1.00', 'N2,Fuller,99,3,2.50')),
  H('cents summed exactly', inv(...Array.from({ length: 10 }, (_, i) => `c${i},Clip,0,1,0.10`), 'd,Dot,1,2,0.07', 'e,Eye,0,3,0.1')),
  H('large amounts', inv('BIG1,Crane,0,500000,99999.99', 'BIG2,Barge,1,499999,99999.99')),
  H('non-ASCII names with spaces, no final newline', IHDR + 'T-1,Tür Scharnier,1,2,3.5\nT-2,東京 ボルト,0,1,0.99'),
  H('leading zeros in counts', inv('L1,Lamp,007,010,1.5', 'L2,Lens,00,0001,2.05')),
];
invHidden.push(
  B('on_hand not a number (12a)', inv(IGOOD[0], 'A-100,Washer,12a,20,0.05', IGOOD[2])),
  B('on_hand empty', inv(IGOOD[0], 'A-100,Washer,,20,0.05', IGOOD[2])),
  B('on_hand Infinity', inv(IGOOD[0], 'A-100,Washer,Infinity,20,0.05', IGOOD[2])),
  B('reorder_at N/A', inv(IGOOD[0], 'A-100,Washer,5,N/A,0.05', IGOOD[2])),
  B('unit_cost empty on a product that needs restocking', inv(IGOOD[0], IGOOD[1], 'C-300,Bracket,10,10,')),
  B('unit_cost NaN on a product that needs restocking', inv(IGOOD[0], IGOOD[1], 'C-300,Bracket,10,10,NaN')),
  B('unit_cost 3.5.0 on a product that needs restocking', inv(IGOOD[0], IGOOD[1], 'C-300,Bracket,10,10,3.5.0')),
  B('row with 4 fields', inv(IGOOD[0], 'A-100,Washer,5,20', IGOOD[2])),
  B('header without reorder_at', 'sku,name,on_hand,unit_cost\nB-200,Hex bolt,4,0.25\nC-300,Bracket,10,3.50\n'),
  B('decimal comma splits unit_cost into 6 fields', inv(IGOOD[0], 'C-300,Bracket,10,10,3,50')),
);

// ---------- grade-curve (JSON, TypeScript's turf) ----------
const gradeSpec = `Grade curve.

Arg 1 is a JSON object exported from another system: {"max": M, "students": [...]}. "max" is the highest possible score on one assignment (a whole number). Each element of "students" is an object with "name" (a string) and "scores" (an array of whole numbers, one per assignment).

A student's percent is the mean of their scores divided by max, times 100, computed exactly and rounded to 1 decimal, halves rounded up. Their letter comes from that rounded percent: A if it is at least 90.0, B if at least 80.0, C if at least 70.0, D if at least 60.0, otherwise F.

Output:
- one line per student: \`NAME PCT LETTER\`, where PCT is the rounded percent with exactly 1 decimal; ordered by rounded percent, highest first, and students with the same rounded percent by name in Unicode code point order;
- then \`class avg X.X\`: the mean of the students' rounded percents, rounded to 1 decimal, halves rounded up.

Example: arg 1 = {"max":50,"students":[{"name":"Ann","scores":[45,40]},{"name":"Bo","scores":[30,35,41]},{"name":"Cy","scores":[50]}]} prints
Cy 100.0 A
Ann 85.0 B
Bo 70.7 C
class avg 85.2`;

const st = (name, scores) => ({ name, scores });
const G = (max, ...students) => JSON.stringify({ max, students });
const GEX = [st('Ann', [45, 40]), st('Bo', [30, 35, 41]), st('Cy', [50])];
const gradeChecks = [
  [G(50, ...GEX)],
  [G(10, st('Dee', [7]))],
  [G(100, st('Eve', [59, 61]), st('Fin', [80, 79, 81]), st('Gil', [89]))],
];
const GH = (trap, a) => ({ args: [a], trap });
const GB = (trap, a) => ({ args: [a], trap, bad: true });
const gradeHidden = [
  GH('single student, single score', G(100, st('Solo', [73]))),
  GH('percent half up at .x5 (72.25)', G(100, st('Half', [70, 72, 73, 74]), st('Other', [10]))),
  GH('percent half up at .x5 (0.15)', G(2000, st('Tiny', [3]), st('Zero', [0]))),
  GH('letter boundaries on the rounded percent', G(2000, st('a90', [1799]), st('b80', [1600]), st('c79', [1599]), st('d60', [1200]), st('f59', [1199]), st('e70', [1400]), st('g', [1198]), st('h', [1598]))),
  GH('rounded-percent tie broken by code point', G(3, st('bob', [2]), st('Bob', [2]), st('Émile', [2]), st('Al', [2]))),
  GH('class avg half up at .x5', G(10, st('P', [9]), st('Q', [8]))),
  GH('max not 100, many scores', G(7, st('Kai', [7, 6, 5, 4, 3, 2, 1, 0]), st('Lu', [7, 7, 7, 6]))),
  GH('non-ASCII names with spaces', G(20, st('José Ñúñez', [17, 18]), st('李雷', [20]), st('Mary Ann Lee', [11, 12, 13]))),
  GH('whitespace and key order in JSON', '{\n  "students": [\n    {"scores": [8, 9], "name": "Ann"},\n    {"name": "Bo", "scores": [10]}\n  ],\n  "max": 10\n}'),
  GB('max 0', G(0, ...GEX)),
  GB('max missing', JSON.stringify({ students: GEX })),
  GB('no students, class avg of nothing', G(50)),
  GB('a student with no scores', G(50, GEX[0], st('Bo', []), GEX[2])),
  GB('a score is null', G(50, GEX[0], st('Bo', [30, null, 41]), GEX[2])),
  GB('a score is true', G(50, GEX[0], st('Bo', [30, true, 41]), GEX[2])),
  GB('name missing', JSON.stringify({ max: 50, students: [GEX[0], { scores: [30, 35, 41] }, GEX[2]] })),
  GB('scores missing', JSON.stringify({ max: 50, students: [GEX[0], { name: 'Bo' }, GEX[2]] })),
  GB('top level is an array, not an object', JSON.stringify(GEX)),
  GB('invalid JSON (cut off)', G(50, ...GEX).slice(0, -15)),
  GB('student element is null', '{"max":50,"students":[' + JSON.stringify(GEX[0]) + ',null,' + JSON.stringify(GEX[2]) + ']}'),
];

// ---------- trip-log (text, both turfs) ----------
const tripSpec = `Trip log.

Standard input is a vehicle trip log exported from another system, one event per line, like
2026-03-04 08:15 start 12034.5
The 4 fields are separated by single spaces: the date (YYYY-MM-DD), the time (HH:MM, 24-hour), the word \`start\` or \`end\`, and the odometer reading in km (a number with at most 1 decimal, like 12034.5 or 12090). Lines are in time order and end with \\n. Each trip is a \`start\` line followed directly by its \`end\` line, on the same date. A day can have several trips.

The distance of a trip is its end reading minus its start reading, computed exactly. A day's distance is the sum of its trips' distances.

Output:
- one line per day that has trips, in date order: \`DATE KM\`: that day's distance in km with exactly 1 decimal;
- then \`total KM\`: the distance of all trips, with exactly 1 decimal;
- then \`longest DATE\`: the day with the largest distance (if several share it, the earliest of them).

Example: standard input
2026-03-04 08:15 start 12034.5
2026-03-04 09:02 end 12090
2026-03-05 07:40 start 12090
2026-03-05 08:10 end 12102.3
2026-03-05 17:30 start 12102.3
2026-03-05 18:05 end 12131.1
prints
2026-03-04 55.5
2026-03-05 41.1
total 96.6
longest 2026-03-04`;

const trip = (...trips) => trips.map(([d, a, b, t1 = '08:00', t2 = '09:00']) => `${d} ${t1} start ${a}\n${d} ${t2} end ${b}\n`).join('');
const TGOOD = [['2026-03-04', '12034.5', '12090', '08:15', '09:02'], ['2026-03-05', '12090', '12102.3', '07:40', '08:10'], ['2026-03-05', '12102.3', '12131.1', '17:30', '18:05']];
const tripChecks = [
  trip(...TGOOD),
  trip(['2026-01-10', '500', '512.4']),
  trip(['2026-02-01', '100.1', '200.2'], ['2026-02-02', '200.2', '250'], ['2026-02-03', '250', '300.1']),
];
const TH = (trap, stdin) => ({ stdin, trap });
const TB = (trap, stdin) => ({ stdin, trap, bad: true });
const L = (d, t, e, o) => `${d} ${t} ${e} ${o}\n`;
const T2 = trip(TGOOD[0]); // one good day before each bad line
const tripHidden = [
  TH('single trip', trip(['2026-06-01', '42', '42.7'])),
  TH('longest tie goes to the earliest day', trip(['2026-04-01', '0', '5', '08:00', '08:30'], ['2026-04-01', '5', '10', '12:00', '12:45'], ['2026-04-02', '10', '20'], ['2026-04-03', '20', '29.9'])),
  TH('zero-km trip', trip(['2026-05-05', '777.7', '777.7'], ['2026-05-06', '777.7', '778'])),
  TH('tenths summed exactly', trip(...Array.from({ length: 10 }, (_, i) => ['2026-07-01', `${i}.1`, `${i}.2`, `0${i}:00`, `0${i}:30`]), ['2026-07-02', '0.3', '0.6'])),
  TH('across month and year ends, leap day', trip(['2024-02-29', '1000', '1010.5'], ['2025-12-31', '5000', '5003.3'], ['2026-01-01', '5003.3', '5010'])),
  TH('large readings', trip(['2026-08-08', '999000.1', '999999.9'], ['2026-08-09', '999999.9', '1000500'])),
  TH('midnight and 23:59 times', trip(['2026-09-09', '1', '2', '00:00', '00:30'], ['2026-09-09', '2', '3.5', '23:00', '23:59'])),
  TH('no final newline', trip(['2026-10-10', '10.5', '20']).replace(/\n$/, '')),
  TH('whole and 1-decimal readings mixed', trip(['2026-11-01', '12034', '12090.9'], ['2026-11-02', '12090.9', '12091'])),
  TB('end without a start', T2 + L('2026-03-05', '08:10', 'end', '12102.3')),
  TB('two starts in a row', T2 + L('2026-03-05', '07:40', 'start', '12090') + L('2026-03-05', '07:45', 'start', '12095') + L('2026-03-05', '08:10', 'end', '12102.3')),
  TB('end reading below the start', T2 + trip(['2026-03-05', '12102.3', '12090'])),
  TB('impossible date 2026-04-31', T2 + trip(['2026-04-31', '12090', '12102.3'])),
  TB('odometer not a number (12a34)', T2 + L('2026-03-05', '07:40', 'start', '12090') + L('2026-03-05', '08:10', 'end', '12a34')),
  TB('line missing the odometer', T2 + L('2026-03-05', '07:40', 'start', '12090') + L('2026-03-05', '08:10', 'end', '').replace(/ \n$/, '\n')),
  TB('odometer NaN', T2 + L('2026-03-05', '07:40', 'start', 'NaN') + L('2026-03-05', '08:10', 'end', '12102.3')),
  TB('odometer Infinity', T2 + L('2026-03-05', '07:40', 'start', '12090') + L('2026-03-05', '08:10', 'end', 'Infinity')),
  TB('decimal comma in odometer', T2 + L('2026-03-05', '07:40', 'start', '12090') + L('2026-03-05', '08:10', 'end', '12102,3')),
  TB('event word "stop"', T2 + L('2026-03-05', '07:40', 'start', '12090') + L('2026-03-05', '08:10', 'stop', '12102.3')),
  TB('empty input, no longest day', ''),
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
  { id: 'inventory-restock', name: 'Restock list and cost from an inventory CSV export', arena: 'csv', spec: invSpec, input: 'standard input', checks: fill('inventory-restock', invChecks), hidden: fill('inventory-restock', invHidden, true) },
  { id: 'grade-curve', name: 'Percent, letter and class average from a JSON gradebook', arena: 'json', spec: gradeSpec, input: 'its first command-line argument', checks: fill('grade-curve', gradeChecks), hidden: fill('grade-curve', gradeHidden, true) },
  { id: 'trip-log', name: 'Km per day, total and longest day from an odometer log', arena: 'text', spec: tripSpec, input: 'standard input', checks: fill('trip-log', tripChecks), hidden: fill('trip-log', tripHidden, true) },
];
const body = `// GENERATED by gen.mjs. Bad-data held-out set 2; happy expects from refs/<id>.py, cross-checked against
// refs/<id>.ts and refs/<id>.vow by verify.mjs. Checks with bad: true have no expect. Do not hand-edit.\n` +
  `export const BAD_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./tasks.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(`${t.id.padEnd(17)} visible ${t.checks.length}  hidden happy ${t.hidden.filter((c) => !c.bad).length}  hidden bad ${t.hidden.filter((c) => c.bad).length}`);
