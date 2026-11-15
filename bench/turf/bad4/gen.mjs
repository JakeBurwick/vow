// Bad-data bench, held-out set 4 (2026-11-15): three fresh happy-path-only tickets, built the same
// way as bench/turf/bad, bad2 and bad3. Expected outputs come from refs/<id>.py; verify.mjs cross-checks
// refs/<id>.ts and .vow and proves all three refs are loud on every bad check.
//   node bench/turf/bad4/gen.mjs   -> writes tasks.js
import { writeFileSync } from 'node:fs';
import { runOne, isLoud } from '../bad/lib.mjs';
const REFS = new URL('./refs', import.meta.url).pathname;
const H = (trap, stdin) => ({ stdin, trap });
const B = (trap, stdin) => ({ stdin, trap, bad: true });

// ---------- parcel-postage (CSV, Python's turf) ----------
const parcelSpec = `Parcel postage.

Standard input is a CSV export from another system. The first line is the header \`parcel,dest,weight\`. Every other line is one parcel: its tracking id, its destination country code (like DE or US) and its weight in kilograms (a number with at most 3 decimals, like 2, 0.75 or 12.125). No field contains a comma or a quote. Lines end with \\n.

A parcel's postage is 4.00 plus 1.50 for every started kilogram: 0.75 kg costs 5.50, exactly 2 kg costs 7.00, 2.001 kg costs 8.50, and a parcel of 0 kg costs 4.00.

Output:
- one line per destination, in destination order by Unicode code point: \`DEST PARCELS WEIGHT POSTAGE\`, where PARCELS is its number of parcels, WEIGHT is their total weight with exactly 3 decimals and POSTAGE is their total postage with exactly 2 decimals;
- then \`total X.XX\`: the postage of every parcel, with exactly 2 decimals;
- then \`heaviest PARCEL\`: the tracking id of the heaviest parcel (if several share the weight, the first of them by id in Unicode code point order).

Example: standard input
parcel,dest,weight
P1,DE,0.75
P2,US,2
P3,DE,2.001
prints
DE 2 2.751 14.00
US 1 2.000 7.00
total 21.00
heaviest P3`;

const CHDR = 'parcel,dest,weight\n';
const par = (...rows) => CHDR + rows.map((r) => r + '\n').join('');
const CGOOD = ['P1,DE,0.75', 'P2,US,2', 'P3,DE,2.001'];
const parcelChecks = [
  par(...CGOOD),
  par('X1,FR,1.5'),
  par('A7,NL,0.5', 'B8,NL,3', 'C9,BE,10.25', 'D0,BE,0.999'),
];
const parcelHidden = [
  H('single parcel', par('Z9,FR,0.001')),
  H('dest order by code point', par('p1,de,1', 'p2,DE,1', 'p3,ÅL,1', 'p4,US,1', 'p5,U2,1')),
  H('started-kilogram boundaries', par('a,A,0', 'b,B,1', 'c,C,1.001', 'd,D,0.999', 'e,E,2.000', 'f,F,3.5')),
  H('heaviest tie broken by id code point', par('b7,X,5', 'B7,X,5', 'É1,Y,5', 'a,Y,4.999')),
  H('grams summed exactly', par(...Array.from({ length: 10 }, (_, i) => `g${i},SE,0.1`), 'h1,NO,0.001', 'h2,NO,0.002', 'h3,NO,0.333')),
  H('large weights', par('Big,CN,999.999', 'Bigger,CN,1500', 'Small,JP,0.5')),
  H('ids with spaces and non-ASCII, no final newline', CHDR + 'Paket Nr 1,DE,1.25\n包裹 2,CN,3\nColis No 3,FR,0.125'),
  H('leading and trailing zeros', par('L1,IT,007.500', 'L2,IT,01', 'L3,IT,2.100')),
  H('only zero-weight parcels', par('z2,NL,0', 'z1,NL,0')),
];
parcelHidden.push(
  B('weight not a number (2.5kg)', par(CGOOD[0], 'P2,US,2.5kg', CGOOD[2])),
  B('weight empty', par(CGOOD[0], 'P2,US,', CGOOD[2])),
  B('weight NaN', par(CGOOD[0], 'P2,US,NaN', CGOOD[2])),
  B('weight Infinity', par(CGOOD[0], 'P2,US,Infinity', CGOOD[2])),
  B('weight negative (-1.2)', par(CGOOD[0], 'P2,US,-1.2', CGOOD[2])),
  B('row with 2 fields', par(CGOOD[0], 'P2,US', CGOOD[2])),
  B('decimal comma splits weight into 4 fields', par(CGOOD[0], 'P2,US,2,5', CGOOD[2])),
  B('dest empty', par(CGOOD[0], 'P2,,2', CGOOD[2])),
  B('header without weight', 'parcel,dest\nP1,DE\nP2,US\n'),
  B('header only, no heaviest parcel', CHDR),
  B('empty input, no header and no heaviest parcel', ''),
);

// ---------- playlist-stats (JSON, TypeScript's turf) ----------
const playSpec = `Playlist stats.

Arg 1 is a JSON object exported from another system: {"playlists": [...]}. Each element of "playlists" is an object with "name" (a string) and "tracks" (an array). Each element of "tracks" is an object with "title" (a string), "artist" (a string) and "seconds" (the track's length, a whole number of seconds). The same track can be on several playlists.

Output:
- one line per playlist, in the order they appear: \`NAME TRACKS LENGTH\`, where TRACKS is its number of tracks and LENGTH is the total length of its tracks as H:MM:SS, hours not padded (0:07:23, 1:03:01, 112:00:05);
- then \`artist ARTIST N\`: the artist with the most tracks over all playlists, counting a track each time it appears, and that count (if several share it, the first of them in Unicode code point order);
- then \`longest TITLE\`: the title of the longest track (if several share the length, the first of them in the order they appear).

Example: arg 1 = {"playlists":[{"name":"Morning","tracks":[{"title":"Sunrise","artist":"Kai","seconds":245},{"title":"Coffee","artist":"Lumi","seconds":198}]},{"name":"Run","tracks":[{"title":"Sprint","artist":"Kai","seconds":180},{"title":"Long Road","artist":"Mora","seconds":3601}]}]} prints
Morning 2 0:07:23
Run 2 1:03:01
artist Kai 2
longest Long Road`;

const tr = (title, artist, seconds) => ({ title, artist, seconds });
const pl = (name, ...tracks) => ({ name, tracks });
const P = (...playlists) => JSON.stringify({ playlists });
const PEX = [pl('Morning', tr('Sunrise', 'Kai', 245), tr('Coffee', 'Lumi', 198)), pl('Run', tr('Sprint', 'Kai', 180), tr('Long Road', 'Mora', 3601))];
const playChecks = [
  [P(...PEX)],
  [P(pl('Chill', tr('Rain', 'Nox', 312)))],
  [P(pl('Mix', tr('One', 'Ava', 100), tr('Two', 'Bo', 200)), pl('Best', tr('Two', 'Bo', 200), tr('Three', 'Ava', 59)))],
];
const PH = (trap, a) => ({ args: [a], trap });
const PB = (trap, a) => ({ args: [a], trap, bad: true });
// The example with the second playlist replaced by raw JSON text.
const exWith = (p2) => '{"playlists":[' + JSON.stringify(PEX[0]) + ',' + p2 + ']}';
const runWith = (t) => exWith('{"name":"Run","tracks":[{"title":"Sprint","artist":"Kai","seconds":180},' + t + ']}');
const playHidden = [
  PH('single playlist, single short track', P(pl('Solo', tr('Blip', 'X', 59)))),
  PH('hour boundaries and an empty playlist', P(pl('A', tr('a1', 'P', 3000), tr('a2', 'Q', 599)), pl('B', tr('b1', 'P', 3600)), pl('C'))),
  PH('artist tie broken by code point', P(pl('L', tr('t1', 'abba', 10), tr('t2', 'ABBA', 20), tr('t3', 'Émile', 30), tr('t4', 'Zed', 40)))),
  PH('same track on several playlists counts each time', P(pl('P1', tr('Hit', 'Lumi', 200), tr('K1', 'Kai', 100)), pl('P2', tr('Hit', 'Lumi', 200), tr('K2', 'Kai', 100)), pl('P3', tr('Hit', 'Lumi', 200)))),
  PH('longest tie: first in order of appearance', P(pl('First', tr('Zeta', 'A', 300), tr('Mid', 'B', 120)), pl('Second', tr('Alpha', 'C', 300), tr('Beta', 'C', 299)))),
  PH('playlists kept in input order, not sorted', P(pl('Zz', tr('z', 'Q', 1)), pl('Aa', tr('a', 'Q', 2)), pl('Mm', tr('m', 'R', 3)))),
  PH('total over 100 hours', P(pl('Marathon', tr('Endless', 'Drone', 360000), tr('Coda', 'Drone', 43205)), pl('Tiny', tr('Tick', 'Clock', 1)))),
  PH('non-ASCII names and titles with spaces', P(pl('Música para correr', tr('Canción de la noche', 'José Ñúñez', 240), tr('夜の歌', '李雷', 181)), pl('Café Mix', tr('Canción de la noche', 'José Ñúñez', 240)))),
  PH('whitespace, key order and a 0-second track', '{\n  "playlists": [\n    {"tracks": [{"seconds": 0, "artist": "Sil", "title": "Silence"}, {"artist": "Sil", "seconds": 61, "title": "Echo"}], "name": "Quiet"}\n  ]\n}'),
  PB('no playlists, no artist or longest track', P()),
  PB('playlists all empty, no tracks at all', P(pl('A'), pl('B'))),
  PB('top level is an array, not an object', JSON.stringify(PEX)),
  PB('invalid JSON (cut off)', P(...PEX).slice(0, -15)),
  PB('playlist name missing', exWith(JSON.stringify({ tracks: PEX[1].tracks }))),
  PB('tracks missing', exWith(JSON.stringify({ name: 'Run' }))),
  PB('track element is null', runWith('null')),
  PB('artist missing', runWith('{"title":"Long Road","seconds":3601}')),
  PB('title missing on the longest track', runWith('{"artist":"Mora","seconds":3601}')),
  PB('seconds is null', runWith('{"title":"Long Road","artist":"Mora","seconds":null}')),
  PB('seconds negative (-30)', runWith('{"title":"Long Road","artist":"Mora","seconds":-30}')),
  PB('seconds 1e999 (overflows to Infinity)', runWith('{"title":"Long Road","artist":"Mora","seconds":1e999}')),
];

// ---------- parking-log (text, both turfs) ----------
const parkSpec = `Parking garage.

Standard input is a log of gate events exported from another system, one event per line, like
2026-03-01 08:15 IN KA-1234
The 4 fields are separated by single spaces: the date (YYYY-MM-DD), the time (HH:MM, 24-hour), the event (IN when a car drives in, OUT when it drives out) and the car's plate (no spaces). Lines are in time order and end with \\n. The log starts with the garage empty, and a car that drives in drives out again before it next drives in.

A stay runs from a car's IN to its next OUT, and can cross midnight. It costs 2.50 for every started hour: a stay of 1 to 60 minutes costs 2.50, a stay of 61 minutes costs 5.00, and a stay of 0 minutes (in and out in the same minute) costs nothing.

Output:
- one line per plate, in plate order by Unicode code point: \`PLATE STAYS MINUTES FEE\`: its number of stays, their total minutes and their total cost with exactly 2 decimals;
- then \`total X.XX\`: the cost of all stays, with exactly 2 decimals;
- then \`longest PLATE MINUTES\`: the longest single stay (if several share it, the one that started first, and among those the first plate in Unicode code point order).

Example: standard input
2026-03-01 08:15 IN KA-1234
2026-03-01 08:40 IN B-77
2026-03-01 09:15 OUT KA-1234
2026-03-01 11:01 OUT B-77
2026-03-01 22:30 IN KA-1234
2026-03-02 00:10 OUT KA-1234
prints
B-77 1 141 7.50
KA-1234 2 160 7.50
total 15.00
longest B-77 141`;

const ev = (...rows) => rows.map((r) => r.join(' ') + '\n').join('');
const KGOOD = [['2026-03-01', '08:15', 'IN', 'KA-1234'], ['2026-03-01', '08:40', 'IN', 'B-77'], ['2026-03-01', '09:15', 'OUT', 'KA-1234'], ['2026-03-01', '11:01', 'OUT', 'B-77'], ['2026-03-01', '22:30', 'IN', 'KA-1234'], ['2026-03-02', '00:10', 'OUT', 'KA-1234']];
const parkChecks = [
  ev(...KGOOD),
  ev(['2026-05-10', '14:00', 'IN', 'M-1'], ['2026-05-10', '14:45', 'OUT', 'M-1']),
  ev(['2026-06-01', '07:00', 'IN', 'R-2'], ['2026-06-01', '07:30', 'IN', 'S-3'], ['2026-06-01', '09:00', 'OUT', 'R-2'], ['2026-06-01', '09:30', 'OUT', 'S-3'], ['2026-06-01', '12:00', 'IN', 'R-2'], ['2026-06-01', '12:20', 'OUT', 'R-2']),
];
// The example with line i replaced (or a line added) by raw text.
const kWith = (i, line) => KGOOD.map((r, j) => (j === i ? line : r.join(' ')) + '\n').join('');
const parkHidden = [
  H('single stay of 0 minutes is free', ev(['2026-07-01', '10:00', 'IN', 'X'], ['2026-07-01', '10:00', 'OUT', 'X'])),
  H('started-hour boundaries', ev(['2026-07-02', '08:00', 'IN', 'A'], ['2026-07-02', '08:00', 'IN', 'B'], ['2026-07-02', '08:00', 'IN', 'C'], ['2026-07-02', '08:00', 'IN', 'D'], ['2026-07-02', '08:00', 'IN', 'E'],
    ['2026-07-02', '08:01', 'OUT', 'A'], ['2026-07-02', '09:00', 'OUT', 'B'], ['2026-07-02', '09:01', 'OUT', 'C'], ['2026-07-02', '10:00', 'OUT', 'D'], ['2026-07-02', '10:01', 'OUT', 'E'])),
  H('across midnight, year end and leap day', ev(['2024-02-28', '23:00', 'IN', 'LEAP'], ['2024-03-01', '01:00', 'OUT', 'LEAP'], ['2025-12-31', '23:50', 'IN', 'NY'], ['2026-01-01', '00:20', 'OUT', 'NY'])),
  H('plate order by code point', ev(['2026-08-01', '09:00', 'IN', 'ka-1'], ['2026-08-01', '09:00', 'IN', 'KA-1'], ['2026-08-01', '09:00', 'IN', 'Å-1'], ['2026-08-01', '09:00', 'IN', 'B-10'], ['2026-08-01', '09:00', 'IN', 'B-9'],
    ['2026-08-01', '09:10', 'OUT', 'ka-1'], ['2026-08-01', '09:20', 'OUT', 'KA-1'], ['2026-08-01', '09:30', 'OUT', 'Å-1'], ['2026-08-01', '09:40', 'OUT', 'B-10'], ['2026-08-01', '09:50', 'OUT', 'B-9'])),
  H('one car, many stays', ev(...Array.from({ length: 5 }, (_, i) => [[`2026-09-0${i + 1}`, '08:00', 'IN', 'Q-5'], [`2026-09-0${i + 1}`, `08:${String(14 * i).padStart(2, '0')}`, 'OUT', 'Q-5']]).flat())),
  H('longest tie: started first, then plate', ev(['2026-10-01', '08:00', 'IN', 'Z1'], ['2026-10-01', '08:00', 'IN', 'A1'], ['2026-10-01', '09:00', 'IN', 'A0'], ['2026-10-01', '09:30', 'OUT', 'Z1'], ['2026-10-01', '09:30', 'OUT', 'A1'], ['2026-10-01', '10:30', 'OUT', 'A0'])),
  H('interleaved cars, events in the same minute', ev(['2026-10-02', '12:00', 'IN', 'C1'], ['2026-10-02', '12:00', 'IN', 'C2'], ['2026-10-02', '12:30', 'OUT', 'C1'], ['2026-10-02', '12:30', 'IN', 'C3'], ['2026-10-02', '12:30', 'IN', 'C1'], ['2026-10-02', '13:00', 'OUT', 'C2'], ['2026-10-02', '13:00', 'OUT', 'C3'], ['2026-10-02', '14:59', 'OUT', 'C1'])),
  H('multi-day stay', ev(['2026-04-01', '06:00', 'IN', 'LONG-1'], ['2026-04-01', '06:30', 'IN', 'SHORT'], ['2026-04-01', '06:31', 'OUT', 'SHORT'], ['2026-04-04', '06:00', 'OUT', 'LONG-1'])),
  H('no final newline', ev(['2026-12-31', '23:00', 'IN', 'END'], ['2026-12-31', '23:59', 'OUT', 'END']).replace(/\n$/, '')),
  B('time 09:75 does not exist', kWith(2, '2026-03-01 09:75 OUT KA-1234')),
  B('impossible date 2026-02-30', kWith(5, '2026-02-30 00:10 OUT KA-1234')),
  B('date in another format (03/02/2026)', kWith(5, '03/02/2026 00:10 OUT KA-1234')),
  B('event missing (3 fields)', kWith(3, '2026-03-01 11:01 B-77')),
  B('OUT with no IN before it', kWith(1, '2026-03-01 08:40 OUT B-77')),
  B('IN twice without an OUT between', kWith(2, '2026-03-01 09:15 IN KA-1234')),
  B('OUT earlier than its IN', kWith(3, '2026-03-01 08:20 OUT B-77')),
  B('plate with a space makes 5 fields', ev(...KGOOD.slice(0, 1), ['2026-03-01', '08:40', 'IN', 'B 77'], ...KGOOD.slice(2, 3), ['2026-03-01', '11:01', 'OUT', 'B 77'], ...KGOOD.slice(4))),
  B('plate empty (trailing space)', kWith(1, '2026-03-01 08:40 IN ')),
  B('line cut off mid-way (last line, no newline)', ev(...KGOOD.slice(0, 5)) + '2026-03-02 00:1'),
  B('empty input, no longest stay', ''),
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
  { id: 'parcel-postage', name: 'Parcels, weight and postage per destination and heaviest parcel from a CSV export', arena: 'csv', spec: parcelSpec, input: 'standard input', checks: fill('parcel-postage', parcelChecks), hidden: fill('parcel-postage', parcelHidden, true) },
  { id: 'playlist-stats', name: 'Tracks and length per playlist, top artist and longest track from a JSON export', arena: 'json', spec: playSpec, input: 'its first command-line argument', checks: fill('playlist-stats', playChecks), hidden: fill('playlist-stats', playHidden, true) },
  { id: 'parking-log', name: 'Stays, minutes and fees per plate and longest stay from a garage gate log', arena: 'text', spec: parkSpec, input: 'standard input', checks: fill('parking-log', parkChecks), hidden: fill('parking-log', parkHidden, true) },
];
const body = `// GENERATED by gen.mjs. Bad-data held-out set 4; happy expects from refs/<id>.py, cross-checked against
// refs/<id>.ts and refs/<id>.vow by verify.mjs. Checks with bad: true have no expect. Do not hand-edit.\n` +
  `export const BAD_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./tasks.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(`${t.id.padEnd(17)} visible ${t.checks.length}  hidden happy ${t.hidden.filter((c) => !c.bad).length}  hidden bad ${t.hidden.filter((c) => c.bad).length}`);
