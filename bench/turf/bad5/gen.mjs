// Bad-data bench, held-out set 5 (2026-11-15): three fresh happy-path-only tickets, built the same
// way as bench/turf/bad, bad2, bad3 and bad4. Expected outputs come from refs/<id>.py; verify.mjs cross-checks
// refs/<id>.ts and .vow and proves all three refs are loud on every bad check.
//   node bench/turf/bad5/gen.mjs   -> writes tasks.js
import { writeFileSync } from 'node:fs';
import { runOne, isLoud } from '../bad/lib.mjs';
const REFS = new URL('./refs', import.meta.url).pathname;
const H = (trap, stdin) => ({ stdin, trap });
const B = (trap, stdin) => ({ stdin, trap, bad: true });

// ---------- water-bills (CSV, Python's turf) ----------
const waterSpec = `Water bills.

Standard input is a CSV export from another system. The first line is the header \`account,zone,previous,current\`. Every other line is one household account: its account id, its billing zone (like N1 or S3), and its two meter readings in whole cubic metres, at the start (previous) and at the end (current) of the billing period. Meters show leading zeros, so a reading can look like 004512. There is one line per account. No field contains a comma or a quote. Lines end with \\n.

An account's usage is its current reading minus its previous reading. Its bill is a standing charge of 3.50, plus 1.20 per cubic metre for the first 10 cubic metres of usage, plus 2.05 per cubic metre above 10: a usage of 0 is billed 3.50, a usage of 10 is billed 15.50 and a usage of 12 is billed 19.60.

Output:
- one line per zone, in zone order by Unicode code point: \`ZONE ACCOUNTS USAGE BILLED\`, where ACCOUNTS is its number of accounts, USAGE is their total usage and BILLED is the total of their bills with exactly 2 decimals;
- then \`total X.XX\`: the bills of every account, with exactly 2 decimals;
- then \`highest ACCOUNT USAGE\`: the account with the highest usage (if several share it, the first of them by account id in Unicode code point order).

Example: standard input
account,zone,previous,current
A-100,N1,004512,004520
A-101,S2,000870,000885
A-102,N1,012001,012011
prints
N1 2 18 28.60
S2 1 15 25.75
total 54.35
highest A-101 15`;

const WHDR = 'account,zone,previous,current\n';
const wat = (...rows) => WHDR + rows.map((r) => r + '\n').join('');
const WGOOD = ['A-100,N1,004512,004520', 'A-101,S2,000870,000885', 'A-102,N1,012001,012011'];
const wWith = (row) => wat(WGOOD[0], row, WGOOD[2]);
const waterChecks = [
  wat(...WGOOD),
  wat('H-1,E4,1000,1012'),
  wat('K1,W1,0,5', 'K2,W1,100,130', 'K3,C2,50,60', 'K4,C2,7,7'),
];
const waterHidden = [
  H('single account, no usage', wat('Z9,X1,000123,000123')),
  H('zone order by code point', wat('a1,n1,0,1', 'a2,N1,0,1', 'a3,Ö1,0,1', 'a4,S10,0,1', 'a5,S2,0,1', 'a6,S1,0,1')),
  H('tier boundaries at 9, 10 and 11', wat('t1,A,0,1', 't2,B,0,9', 't3,C,0,10', 't4,D,0,11', 't5,E,0,20')),
  H('highest tie broken by account code point', wat('b7,X,10,40', 'B7,X,0,30', 'É1,Y,5,35', 'a,Y,0,29')),
  H('usages whose bills are not exact in binary', wat('c1,M,0,13', 'c2,M,0,23', 'c3,M,0,33', 'c4,M,0,3', 'c5,M,0,7')),
  H('large readings and usage', wat('Big,R1,000000001,100000001', 'Mid,R1,123456789,123457789', 'Low,R2,999999990,999999999')),
  H('account ids with spaces and non-ASCII, no final newline', WHDR + 'Haus Nr 1,DE,0100,0112\n水表 2,CN,5,30\nMaison 3,FR,0,0'),
  H('leading zeros and readings of zero', wat('L1,IT,000000,000000', 'L2,IT,0,000010', 'L3,IT,007,17')),
  H('every account uses nothing', wat('z2,NL,40,40', 'z1,NL,0,0')),
  B('reading with a letter O for a zero (00087O)', wWith('A-101,S2,00087O,000885')),
  B('current reading empty', wWith('A-101,S2,000870,')),
  B('current reading NaN', wWith('A-101,S2,000870,NaN')),
  B('current reading Infinity', wWith('A-101,S2,000870,Infinity')),
  B('current reading below previous', wWith('A-101,S2,000885,000870')),
  B('row with 3 fields', wWith('A-101,S2,000870')),
  B('thousands separator (1,204) makes 5 fields', wWith('A-101,S2,870,1,204')),
  B('zone empty', wWith('A-101,,000870,000885')),
  B('account listed twice with different readings', wat(...WGOOD, 'A-100,N1,004512,004530')),
  B('header without current', 'account,zone,previous\nA-100,N1,004512\nA-101,S2,000870\n'),
  B('header only, no highest usage', WHDR),
  B('empty input, no header and no highest usage', ''),
];

// ---------- auction-results (JSON, TypeScript's turf) ----------
const auctionSpec = `Auction results.

Arg 1 is a JSON object exported from another system: {"lots": [...]}. Each element of "lots" is an object with "lot" (the lot's id, a string), "reserve" (the lowest price the seller accepts, a number of euros with at most 2 decimals) and "bids" (an array, in the order the bids were placed). Each element of "bids" is an object with "bidder" (a string) and "amount" (a number of euros with at most 2 decimals). Each bid on a lot is higher than the bid before it.

A lot is sold when it has bids and its highest bid is at least its reserve: it goes to that bid's bidder for that bid's amount. Otherwise it is unsold.

Output:
- one line per lot, in the order they appear: \`LOT BIDS sold BIDDER PRICE\` for a sold lot or \`LOT BIDS unsold\` for an unsold one, where BIDS is its number of bids and PRICE has exactly 2 decimals;
- then \`revenue X.XX\`: the total price of the sold lots, with exactly 2 decimals;
- then \`busiest BIDDER N\`: the bidder who placed the most bids over all lots, and that count (if several share it, the first of them in Unicode code point order).

Example: arg 1 = {"lots":[{"lot":"L1","reserve":100,"bids":[{"bidder":"ana","amount":80},{"bidder":"ben","amount":95.5},{"bidder":"ana","amount":120}]},{"lot":"L2","reserve":50,"bids":[{"bidder":"ben","amount":40}]},{"lot":"L3","reserve":0,"bids":[]}]} prints
L1 3 sold ana 120.00
L2 1 unsold
L3 0 unsold
revenue 120.00
busiest ana 2`;

const bid = (bidder, amount) => ({ bidder, amount });
const lot = (id, reserve, ...bids) => ({ lot: id, reserve, bids });
const A = (...lots) => JSON.stringify({ lots });
const AEX = [lot('L1', 100, bid('ana', 80), bid('ben', 95.5), bid('ana', 120)), lot('L2', 50, bid('ben', 40)), lot('L3', 0)];
const auctionChecks = [
  [A(...AEX)],
  [A(lot('V-7', 250, bid('kim', 300)))],
  [A(lot('A', 10.5, bid('lee', 5), bid('mo', 10.5)), lot('B', 20, bid('mo', 15), bid('lee', 19.99)))],
];
const AH = (trap, a) => ({ args: [a], trap });
const AB = (trap, a) => ({ args: [a], trap, bad: true });
// The example with lot i replaced by raw JSON text.
const aWith = (i, raw) => '{"lots":[' + AEX.map((l, j) => (j === i ? raw : JSON.stringify(l))).join(',') + ']}';
const L1bids = (last) => '{"lot":"L1","reserve":100,"bids":[{"bidder":"ana","amount":80},{"bidder":"ben","amount":95.5},' + last + ']}';
const L2with = (b) => '{"lot":"L2","reserve":50,"bids":[' + b + ']}';
const auctionHidden = [
  AH('single lot, bid exactly at the reserve', A(lot('S1', 75.25, bid('Ola', 75.25)))),
  AH('one cent below the reserve; a 0.00 bid on a 0 reserve', A(lot('C1', 20, bid('p', 19.99)), lot('C2', 0, bid('q', 0)))),
  AH('busiest tie broken by code point', A(lot('T', 1000, bid('ana', 1), bid('Ana', 2), bid('Émile', 3), bid('zed', 4)), lot('U', 1000, bid('zed', 1), bid('Émile', 2), bid('Ana', 3), bid('ana', 4)))),
  AH('prices whose sum is not exact in binary', A(lot('F1', 0, bid('x', 0.1)), lot('F2', 0, bid('y', 0.2)), lot('F3', 19.99, bid('x', 19.99)), lot('F4', 19.99, bid('y', 19.99)), lot('F5', 19.99, bid('z', 19.99)))),
  AH('lots kept in input order, non-ASCII ids', A(lot('Zz', 1, bid('m', 2)), lot('Ära-3', 1, bid('m', 3)), lot('Aa', 1, bid('n', 4)), lot('拍品9', 1, bid('n', 5)))),
  AH('large prices', A(lot('Villa', 1000000, bid('Fund A', 999999.99), bid('Fund B', 1234567.89)), lot('Boat', 0, bid('Fund A', 0.11)))),
  AH('a bidder raising their own bid', A(lot('R', 500, bid('kai', 100), bid('kai', 200), bid('lu', 300), bid('kai', 550)))),
  AH('whitespace, key order and whole-euro amounts', '{\n  "lots": [\n    {"bids": [{"amount": 7, "bidder": "Bo"}, {"bidder": "Cy", "amount": 95.5}], "reserve": 90, "lot": "W1"},\n    {"reserve": 12.3, "lot": "W2", "bids": []}\n  ]\n}'),
  AH('every lot unsold, but there are bids', A(lot('N1', 500, bid('ida', 100), bid('jo', 200)), lot('N2', 80, bid('jo', 79.99)))),
  AB('no lots, no busiest bidder', A()),
  AB('every lot has no bids, no busiest bidder', A(lot('L1', 10), lot('L2', 0))),
  AB('top level is an array, not an object', JSON.stringify(AEX)),
  AB('invalid JSON (cut off)', A(...AEX).slice(0, -15)),
  AB('lot id missing', aWith(1, '{"reserve":50,"bids":[{"bidder":"ben","amount":40}]}')),
  AB('bids missing', aWith(1, '{"lot":"L2","reserve":50}')),
  AB('bid element is null', aWith(1, L2with('null'))),
  AB('bidder missing on the winning bid', aWith(0, L1bids('{"amount":120}'))),
  AB('amount missing on the winning bid', aWith(0, L1bids('{"bidder":"ana"}'))),
  AB('amount is null', aWith(1, L2with('{"bidder":"ben","amount":null}'))),
  AB('amount is true', aWith(1, L2with('{"bidder":"ben","amount":true}'))),
  AB('bid lower than the bid before it', aWith(0, '{"lot":"L1","reserve":100,"bids":[{"bidder":"ana","amount":80},{"bidder":"ana","amount":120},{"bidder":"ben","amount":95.5}]}')),
];

// ---------- league-table (text, both turfs) ----------
const leagueSpec = `League table.

Standard input is a list of match results exported from another system, one match per line, like
3 Ajax 2-1 PSV
The 4 fields are separated by single spaces: the matchday (a whole number), the home team, the score (the home team's goals, a hyphen and the away team's goals; goals are whole numbers) and the away team. Team names have no spaces. Lines are in matchday order and end with \\n. A team plays at most once per matchday.

A win is worth 3 points, a draw 1 and a loss 0.

Output:
- one line per team, in team order by Unicode code point: \`TEAM P W D L GF GA PTS\`: its matches played, won, drawn and lost, its goals for and against, and its points;
- then \`leader TEAM PTS\`: the team with the most points (if several share them, the one with the largest goal difference, GF minus GA; if that is shared too, the first of them in Unicode code point order);
- then \`matchdays N\`: the number of different matchdays in the list.

Example: standard input
1 Ajax 2-1 PSV
1 Feyenoord 0-0 Twente
2 PSV 3-0 Feyenoord
2 Twente 1-1 Ajax
prints
Ajax 2 1 1 0 3 2 4
Feyenoord 2 0 1 1 0 3 1
PSV 2 1 0 1 4 2 3
Twente 2 0 2 0 1 1 2
leader Ajax 4
matchdays 2`;

const mt = (...rows) => rows.map((r) => r + '\n').join('');
const LGOOD = ['1 Ajax 2-1 PSV', '1 Feyenoord 0-0 Twente', '2 PSV 3-0 Feyenoord', '2 Twente 1-1 Ajax'];
const lWith = (i, line) => mt(...LGOOD.map((r, j) => (j === i ? line : r)));
const leagueChecks = [
  mt(...LGOOD),
  mt('1 Utrecht 1-0 Heracles'),
  mt('1 A 1-0 B', '1 C 2-2 D', '2 B 3-1 C', '2 D 0-1 A', '3 A 0-0 C', '3 B 2-0 D'),
];
const leagueHidden = [
  H('single goalless draw', mt('1 Home 0-0 Away')),
  H('team order by code point', mt('1 ajax 1-0 Ajax', '1 Åtvid 2-2 B10', '2 B9 0-1 ajax', '2 Ajax 3-0 Åtvid', '3 B10 1-0 B9')),
  H('leader tie on points broken by goal difference', mt('1 Kappa 1-0 Lima', '1 Mike 5-0 Nova', '2 Lima 1-0 Mike', '2 Nova 0-1 Kappa', '3 Kappa 0-2 Mike', '3 Lima 1-1 Nova')),
  H('leader tie on points and goal difference broken by code point', mt('1 Zulu 2-0 Yank', '1 Echo 2-0 Xray', '2 Yank 0-0 Xray', '2 Zulu 0-1 Echo', '3 Zulu 1-0 Xray', '3 Echo 0-1 Yank')),
  H('double-digit scores', mt('1 Goals 10-9 Leaky', '2 Leaky 12-0 Goals', '3 Goals 0-0 Leaky')),
  H('matchdays with gaps and many matches each', mt('1 A 1-0 B', '1 C 0-1 D', '1 E 2-2 F', '4 B 1-1 C', '4 D 0-3 E', '4 F 1-0 A', '17 A 2-1 E', '17 C 0-0 F')),
  H('a team that loses every match', mt('1 Top 3-0 Bottom', '2 Bottom 0-1 Mid', '3 Mid 0-4 Top', '4 Bottom 1-2 Top', '5 Mid 2-2 Top')),
  H('non-ASCII team names, no final newline', mt('1 Málaga 1-0 Köln', '1 Ζήτα 2-2 Ελλάς', '2 Köln 3-1 Ζήτα', '2 Ελλάς 0-1 Málaga').replace(/\n$/, '')),
  H('home and away legs, double-digit matchdays', mt('9 Rot 1-0 Blau', '10 Blau 2-0 Rot', '11 Rot 1-1 Gelb', '12 Gelb 0-2 Blau', '13 Gelb 1-0 Rot', '14 Blau 1-1 Gelb')),
  B('goals with a letter l for a one (3-l)', lWith(2, '2 PSV 3-l Feyenoord')),
  B('goals not whole (2.5-1)', lWith(0, '1 Ajax 2.5-1 PSV')),
  B('score without a hyphen (21)', lWith(0, '1 Ajax 21 PSV')),
  B('away team missing (3 fields)', lWith(3, '2 Twente 1-1')),
  B('team name with a space makes 5 fields', lWith(1, '1 Go Ahead 0-0 Twente')),
  B('score with spaces (2 - 1) makes 6 fields', lWith(0, '1 Ajax 2 - 1 PSV')),
  B('matchday not a number (2b)', lWith(2, '2b PSV 3-0 Feyenoord')),
  B('a team plays itself', lWith(1, '1 Feyenoord 0-0 Feyenoord')),
  B('a team plays twice on one matchday', lWith(3, '2 Twente 1-1 PSV')),
  B('line cut off mid-way (last line, no newline)', mt(...LGOOD.slice(0, 3)) + '2 Twe'),
  B('empty input, no leader', ''),
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
  { id: 'water-bills', name: 'Accounts, usage and billed amount per zone and highest usage from a CSV export', arena: 'csv', spec: waterSpec, input: 'standard input', checks: fill('water-bills', waterChecks), hidden: fill('water-bills', waterHidden, true) },
  { id: 'auction-results', name: 'Bids and outcome per lot, revenue and busiest bidder from a JSON export', arena: 'json', spec: auctionSpec, input: 'its first command-line argument', checks: fill('auction-results', auctionChecks), hidden: fill('auction-results', auctionHidden, true) },
  { id: 'league-table', name: 'Played, won, drawn, lost, goals and points per team, leader and matchdays from a results list', arena: 'text', spec: leagueSpec, input: 'standard input', checks: fill('league-table', leagueChecks), hidden: fill('league-table', leagueHidden, true) },
];
const body = `// GENERATED by gen.mjs. Bad-data held-out set 5; happy expects from refs/<id>.py, cross-checked against
// refs/<id>.ts and refs/<id>.vow by verify.mjs. Checks with bad: true have no expect. Do not hand-edit.\n` +
  `export const BAD_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./tasks.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(`${t.id.padEnd(17)} visible ${t.checks.length}  hidden happy ${t.hidden.filter((c) => !c.bad).length}  hidden bad ${t.hidden.filter((c) => c.bad).length}`);
