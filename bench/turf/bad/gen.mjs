// Bad-data bench (2026-10-20): the specs describe only the happy path. Hidden checks mix exact
// happy-path checks with `bad: true` checks whose data makes every normal-looking answer wrong.
// Expected outputs come from refs/<id>.py; verify.mjs cross-checks refs/<id>.ts and .vow and
// proves all three refs are loud on every bad check.
//   node bench/turf/bad/gen.mjs   -> writes tasks.js
import { writeFileSync } from 'node:fs';
import { runOne, isLoud } from './lib.mjs';
const REFS = new URL('./refs', import.meta.url).pathname;

// ---------- sales-report (CSV, Python's turf) ----------
const salesSpec = `Sales report.

Standard input is a CSV export from another system. The first line is the header \`region,rep,units,unit_price\`. Every other line is one sale: the sales region, the rep's name, the number of units sold (a whole number) and the price of one unit in dollars with at most 2 decimals (like 12.50, 4 or 0.5). No field contains a comma or a quote. Lines end with \\n.

The revenue of a sale is units x unit_price, computed exactly in cents.

Output:
- one line per region, in region order by Unicode code point: \`REGION REVENUE\`, where REVENUE is the total revenue of that region's sales with exactly 2 decimals;
- then \`total X.XX\`: the revenue of all sales, with exactly 2 decimals;
- then \`avg units X.X\`: the mean number of units per sale line, rounded to 1 decimal, halves rounded up.

Example: standard input
region,rep,units,unit_price
east,Ann,3,2.50
west,Bo,1,10
east,Cy,2,0.25
prints
east 8.00
west 10.00
total 18.00
avg units 2.0`;

const HDR = 'region,rep,units,unit_price\n';
const csv = (...rows) => HDR + rows.map((r) => r + '\n').join('');
const GOOD = ['east,Ann,3,2.50', 'west,Bo,1,10', 'east,Cy,2,0.25'];
const salesChecks = [
  csv(...GOOD),
  csv('north,Dee,4,1.25', 'north,Eli,6,3'),
  csv('south,Fay,10,0.5', 'east,Gus,1,99.99', 'south,Hal,0,7.10'),
];
const H = (trap, stdin) => ({ stdin, trap });
const B = (trap, stdin) => ({ stdin, trap, bad: true });
const salesHidden = [
  H('single sale', csv('north,Ann,7,1.99')),
  H('region order by code point', csv('éire,A,1,1', 'east,B,1,2', 'Zone,C,1,3', 'East,D,1,4')),
  H('non-ASCII regions and names', csv('東京,李雷,2,3.5', 'Zürich,Jörg Müller,1,0.99', '東京,Ana María,1,1')),
  H('avg units half up at .x5 (0.25)', csv('a,A,1,1', 'a,B,0,1', 'a,C,0,1', 'a,D,0,1')),
  H('avg units half up at .x5 (0.15)', csv(...Array.from({ length: 20 }, (_, i) => `a,R${i},${i < 3 ? 1 : 0},2`))),
  H('cents summed exactly', csv(...Array.from({ length: 10 }, (_, i) => `x,R${i},1,0.10`), 'x,S,3,0.1', 'y,T,1,0.07')),
  H('large amounts', csv('big,A,1000000,99999.99', 'big,B,999999,99999.99')),
  H('no final newline', HDR + 'east,Ann,3,2.50\nwest,Bo,1,10'),
  H('regions interleaved', csv('b,A,1,1', 'a,B,2,2', 'c,C,3,3', 'a,D,4,4', 'b,E,5,5')),
  B('units not a number (12a)', csv('east,Ann,3,2.50', 'west,Bo,12a,10', 'east,Cy,2,0.25')),
  B('unit_price empty', csv('east,Ann,3,2.50', 'west,Bo,1,', 'east,Cy,2,0.25')),
  B('unit_price N/A', csv('east,Ann,3,2.50', 'west,Bo,1,N/A', 'east,Cy,2,0.25')),
  B('row with 3 fields', csv('east,Ann,3,2.50', 'west,Bo,1', 'east,Cy,2,0.25')),
  B('header without unit_price', 'region,rep,units\neast,Ann,3\nwest,Bo,1\n'),
  B('header only, mean of no rows', HDR),
  B('units is a dash', csv('east,Ann,3,2.50', 'west,Bo,-,10', 'east,Cy,2,0.25')),
  B('decimal comma splits price into 5 fields', csv('east,Ann,3,2,50', 'west,Bo,1,10')),
  B('unit_price NaN', csv('east,Ann,3,2.50', 'west,Bo,1,NaN')),
  B('units empty', csv('east,Ann,3,2.50', 'west,Bo,,10', 'east,Cy,2,0.25')),
];

// ---------- user-stats (JSON, TypeScript's turf) ----------
const usersSpec = `User stats.

Arg 1 is a JSON array exported from another system. Each element is a user object with these fields: "id" (a whole number), "name" (a string), "age" (a whole number), "plan" (a string) and "signup" (the signup date, a string "YYYY-MM-DD").

Output:
- one line per plan, in plan order by Unicode code point: \`PLAN COUNT AVGAGE\`: the number of users on that plan and their mean age, rounded to 1 decimal, halves rounded up;
- then \`oldest ID NAME\`: the id and name of the user with the highest age (if several share it, the one with the smallest id);
- then one line per month that has signups, in month order: \`YYYY-MM N\`: the number of users who signed up in that month.

Example: arg 1 = [{"id":1,"name":"Ann","age":31,"plan":"pro","signup":"2026-03-14"},{"id":2,"name":"Bo","age":40,"plan":"free","signup":"2026-03-02"},{"id":3,"name":"Cy","age":28,"plan":"pro","signup":"2026-01-30"}] prints
free 1 40.0
pro 2 29.5
oldest 2 Bo
2026-01 1
2026-03 2`;

const u = (id, name, age, plan, signup) => ({ id, name, age, plan, signup });
const J = (...us) => JSON.stringify(us);
const EX = [u(1, 'Ann', 31, 'pro', '2026-03-14'), u(2, 'Bo', 40, 'free', '2026-03-02'), u(3, 'Cy', 28, 'pro', '2026-01-30')];
const usersChecks = [
  [J(...EX)],
  [J(u(5, 'Dee', 52, 'team', '2025-11-09'))],
  [J(u(4, 'Eve', 33, 'free', '2026-02-01'), u(2, 'Fin', 33, 'free', '2026-02-27'), u(7, 'Gil', 19, 'pro', '2026-04-05'))],
];
const UH = (trap, a) => ({ args: [a], trap });
const UB = (trap, a) => ({ args: [a], trap, bad: true });
const without = (o, k) => { const c = { ...o }; delete c[k]; return c; };
const BASE = [u(1, 'Ann', 31, 'pro', '2026-03-14'), u(2, 'Bo', 40, 'free', '2026-03-02'), u(3, 'Cy', 28, 'pro', '2026-01-30')];
const usersHidden = [
  UH('single user', J(u(1, 'Ann', 31, 'pro', '2026-03-14'))),
  UH('oldest tie broken by numeric id, not text', J(u(10, 'Ten', 50, 'pro', '2026-01-01'), u(9, 'Nine', 50, 'pro', '2026-01-02'), u(100, 'Hundred', 50, 'free', '2026-01-03'))),
  UH('plan order by code point, non-ASCII names', J(u(1, 'José Ñúñez', 30, 'élite', '2026-05-05'), u(2, '李雷', 41, 'basic', '2026-05-06'), u(3, 'Zoë 😀', 22, 'Pro', '2026-06-01'))),
  UH('mean age half up at .x5 (22.25)', J(u(1, 'A', 22, 'p', '2026-01-01'), u(2, 'B', 22, 'p', '2026-01-01'), u(3, 'C', 22, 'p', '2026-01-01'), u(4, 'D', 23, 'p', '2026-01-01'))),
  UH('mean age half up at .x5 (0.15)', J(...Array.from({ length: 20 }, (_, i) => u(i + 1, `K${i + 1}`, i < 3 ? 1 : 0, 'kids', '2026-07-07')))),
  UH('id past 2^53 printed exactly', '[{"id":9007199254740993,"name":"Big","age":70,"plan":"pro","signup":"2026-01-01"},{"id":5,"name":"Small","age":20,"plan":"pro","signup":"2026-01-02"}]'),
  UH('months across years, leap day', J(u(1, 'A', 30, 'p', '2025-12-31'), u(2, 'B', 31, 'p', '2026-01-01'), u(3, 'C', 32, 'q', '2024-02-29'), u(4, 'D', 33, 'q', '2025-12-01'))),
  UH('whitespace and key order in JSON', '[\n  {"signup": "2026-03-14", "plan": "pro", "age": 31, "name": "Ann", "id": 1},\n  {"name": "Bo", "id": 2, "age": 40, "signup": "2026-03-02", "plan": "free"}\n]'),
  UH('names with spaces, mean x.5', J(u(1, 'Mary Ann Lee', 20, 'free', '2026-08-08'), u(2, 'Jo Bo', 21, 'free', '2026-08-09'))),
  UB('age missing', J(BASE[0], without(BASE[1], 'age'), BASE[2])),
  UB('age null', J(BASE[0], { ...BASE[1], age: null }, BASE[2])),
  UB('plan missing', J(BASE[0], BASE[1], without(BASE[2], 'plan'))),
  UB('top level is an object, not an array', JSON.stringify({ users: BASE })),
  UB('invalid JSON (cut off)', J(...BASE).slice(0, -20)),
  UB('empty array, no oldest user', '[]'),
  UB('signup month 13', J(BASE[0], { ...BASE[1], signup: '2026-13-01' }, BASE[2])),
  UB('signup missing', J(BASE[0], BASE[1], without(BASE[2], 'signup'))),
  UB('name missing on the oldest user', J(BASE[0], without(BASE[1], 'name'), BASE[2])),
  UB('array element is null', '[' + JSON.stringify(BASE[0]) + ',null,' + JSON.stringify(BASE[2]) + ']'),
  UB('id missing on the oldest user', J(BASE[0], without(BASE[1], 'id'), BASE[2])),
];

// ---------- latency (log text, both turfs) ----------
const latSpec = `Latency report.

Standard input is a web server access log exported from another system, one request per line, like
2026-10-01T10:00:00Z GET /api/users 200 120ms
The 5 fields are separated by single spaces: the time (UTC), the HTTP method, the request path, the HTTP status code, and the response time as a whole number of milliseconds followed by \`ms\`. Lines end with \\n.

Output:
- one line per path, in path order by Unicode code point: \`PATH COUNT MEAN MAX\`: the number of requests for that path, their mean response time in ms rounded to 1 decimal (halves rounded up), and their largest response time in ms;
- then \`p95 N\`: the 95th percentile of all response times by the nearest-rank method: sort all response times from smallest to largest and take the one at position ceil(0.95 x n), counting from 1, where n is the number of requests;
- then \`errors N\`: the number of requests whose status is 500 or higher.

Example: standard input
2026-10-01T10:00:00Z GET /api/users 200 120ms
2026-10-01T10:00:01Z GET /api/users 503 80ms
2026-10-01T10:00:02Z POST /api/orders 201 45ms
prints
/api/orders 1 45.0 45
/api/users 2 100.0 120
p95 120
errors 1`;

const ts = (i) => `2026-10-01T10:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`;
const log = (...rows) => rows.map((r, i) => (Array.isArray(r) ? `${ts(i)} ${r[3] ?? 'GET'} ${r[0]} ${r[1]} ${r[2]}ms` : r) + '\n').join('');
const LGOOD = [['/api/users', 200, 120], ['/api/users', 503, 80], ['/api/orders', 201, 45, 'POST']];
const latChecks = [
  log(...LGOOD),
  log(['/health', 200, 3]),
  log(['/a', 200, 10], ['/b', 404, 30], ['/a', 500, 20], ['/b', 200, 31], ['/a', 200, 11, 'PUT']),
];
const LH = (trap, stdin) => ({ stdin, trap });
const LB = (trap, stdin) => ({ stdin, trap, bad: true });
const shuffled = (n) => Array.from({ length: n }, (_, i) => ((i * 13) % n) + 1);
const latHidden = [
  LH('single request', log(['/x', 200, 42])),
  LH('path order by code point', log(['/é', 200, 1], ['/api', 200, 2], ['/API', 200, 3], ['/api/x', 200, 4], ['/Z', 200, 5])),
  LH('mean half up at .x5 (0.25)', log(['/p', 200, 1], ['/p', 200, 0], ['/p', 200, 0], ['/p', 200, 0])),
  LH('mean half up at .x5 (0.15)', log(...Array.from({ length: 20 }, (_, i) => ['/q', 200, i < 3 ? 1 : 0]))),
  LH('p95 of 20 is the 19th', log(...shuffled(20).map((d) => ['/r', 200, d]))),
  LH('p95 of 21 is the 20th', log(...shuffled(21).map((d) => ['/r', 200, d * 10]))),
  LH('status 499 is not counted, 500-599 are', log(['/s', 499, 1], ['/s', 500, 2], ['/s', 503, 3], ['/s', 599, 4], ['/s', 200, 5])),
  LH('non-ASCII path, no final newline', log(['/café/😀', 200, 9], ['/café/😀', 201, 10]).replace(/\n$/, '')),
  LH('max and large values', log(['/slow', 200, 120000], ['/slow', 200, 5], ['/fast', 200, 1])),
  LB('response time "timeout"', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/orders 504 timeout')),
  LB('response time "-"', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/orders 200 -')),
  LB('line missing the path field', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET 200 33ms')),
  LB('status "abc"', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/orders abc 33ms')),
  LB('truncated line', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/ord')),
  LB('empty input, p95 of nothing', ''),
  LB('response time "12.5.3ms"', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/orders 200 12.5.3ms')),
  LB('negative response time', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/orders 200 -5ms')),
  LB('response time "NaNms"', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/orders 200 NaNms')),
  LB('response time with no number ("ms")', log(...LGOOD.slice(0, 2), '2026-10-01T10:00:05Z GET /api/orders 200 ms')),
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
  { id: 'sales-report', name: 'Revenue per region from a CSV export', arena: 'csv', spec: salesSpec, input: 'standard input', checks: fill('sales-report', salesChecks), hidden: fill('sales-report', salesHidden, true) },
  { id: 'user-stats', name: 'Plan, age and signup stats from a JSON export', arena: 'json', spec: usersSpec, input: 'its first command-line argument', checks: fill('user-stats', usersChecks), hidden: fill('user-stats', usersHidden, true) },
  { id: 'latency', name: 'Per-path latency, p95 and 5xx count from an access log', arena: 'text', spec: latSpec, input: 'standard input', checks: fill('latency', latChecks), hidden: fill('latency', latHidden, true) },
];
const body = `// GENERATED by gen.mjs. Bad-data tasks; happy expects from refs/<id>.py, cross-checked against
// refs/<id>.ts and refs/<id>.vow by verify.mjs. Checks with bad: true have no expect. Do not hand-edit.\n` +
  `export const BAD_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./tasks.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(`${t.id.padEnd(13)} visible ${t.checks.length}  hidden happy ${t.hidden.filter((c) => !c.bad).length}  hidden bad ${t.hidden.filter((c) => c.bad).length}`);
