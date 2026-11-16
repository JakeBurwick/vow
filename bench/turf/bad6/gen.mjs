// Bad-data bench, held-out set 6 (2026-11-16): three fresh happy-path-only tickets, built the same
// way as bench/turf/bad through bad5, with about half the traps being logic problems in well-formed data.
// Expected outputs come from refs/<id>.py; verify.mjs cross-checks refs/<id>.ts and .vow and proves all
// three refs are loud on every bad check.
//   node bench/turf/bad6/gen.mjs   -> writes tasks.js
import { writeFileSync } from 'node:fs';
import { runOne, isLoud } from '../bad/lib.mjs';
const REFS = new URL('./refs', import.meta.url).pathname;
const H = (trap, stdin) => ({ stdin, trap });
const B = (trap, stdin) => ({ stdin, trap, bad: true });

// ---------- factory-runs (CSV, Python's turf) ----------
const factorySpec = `Production runs.

Standard input is a CSV export from another system. The first line is the header \`machine,day,start,end,made,scrapped\`. Every other line is one production run: the machine's name (like M1 or Press-4), the day of the run (YYYY-MM-DD), its start and end times (HH:MM on a 24-hour clock), the number of parts it made and how many of those parts were scrapped. A run starts and ends on the same day, and ends after it starts. A machine does one run at a time, though a run can start at the minute the machine's previous run ends. The scrapped parts are some of the parts made. No field contains a comma or a quote. Lines end with \\n.

A run's minutes are its end time minus its start time, and its good parts are its parts made minus its parts scrapped.

Output:
- one line per machine, in machine order by Unicode code point: \`MACHINE RUNS MINUTES GOOD\`: its number of runs, their total minutes and their total good parts;
- then \`scrap P%\`: the parts scrapped as a percentage of the parts made, over all runs, with exactly 2 decimals, rounded half up (1 of 8 is 12.50%, 1 of 800 is 0.13%);
- then \`busiest MACHINE MINUTES\`: the machine with the most minutes (if several share them, the first of them in Unicode code point order).

Example: standard input
machine,day,start,end,made,scrapped
M1,2026-03-02,06:00,08:30,300,12
Press-4,2026-03-02,06:15,07:00,90,0
M1,2026-03-02,08:30,10:00,200,8
prints
M1 2 240 480
Press-4 1 45 90
scrap 3.39%
busiest M1 240`;

const FHDR = 'machine,day,start,end,made,scrapped\n';
const fac = (...rows) => FHDR + rows.map((r) => r + '\n').join('');
const FGOOD = ['M1,2026-03-02,06:00,08:30,300,12', 'Press-4,2026-03-02,06:15,07:00,90,0', 'M1,2026-03-02,08:30,10:00,200,8'];
const fWith = (row) => fac(FGOOD[0], row, FGOOD[2]);
const factoryChecks = [
  fac(...FGOOD),
  fac('L7,2026-01-15,13:00,13:45,60,3'),
  fac('A,2026-05-04,07:00,09:00,120,30', 'B,2026-05-04,07:00,08:00,50,0', 'A,2026-05-05,07:00,07:30,10,10', 'B,2026-05-04,09:15,10:15,40,2'),
];
const factoryHidden = [
  H('single one-minute run, no scrap', fac('Solo,2026-07-01,10:00,10:01,1,0')),
  H('machine order by code point', fac('m1,2026-03-02,06:00,07:00,10,1', 'M1,2026-03-02,06:00,06:30,10,0', 'M10,2026-03-02,06:00,06:10,10,0', 'M2,2026-03-02,06:00,06:20,10,0', 'Ärm,2026-03-02,06:00,06:05,10,0', 'Z,2026-03-02,06:00,06:01,10,0')),
  H('scrap rate 2.675% rounds half up (not exact in binary)', fac('R1,2026-04-01,06:00,12:00,4000,107')),
  H('busiest tie broken by code point', fac('b,2026-03-02,06:00,07:00,5,0', 'B,2026-03-02,08:00,09:00,5,0', 'É,2026-03-02,06:00,07:00,5,0', 'a,2026-03-02,06:00,06:59,5,0')),
  H('back-to-back runs, same hours on another day and on another machine', fac('M1,2026-03-02,06:00,08:00,10,0', 'M1,2026-03-02,08:00,09:00,10,0', 'M1,2026-03-03,06:00,08:00,10,0', 'M2,2026-03-02,07:00,08:00,10,0')),
  H('every part of a run scrapped; 5 of 800 is 0.625%', fac('X,2026-03-02,08:00,09:00,5,5', 'Y,2026-03-02,08:00,08:20,795,0')),
  H('machine names with spaces and non-ASCII, no final newline', FHDR + 'Presse Nr 2,2026-03-02,06:00,07:30,40,1\n冲床3,2026-03-02,06:00,06:45,12,0\nFräse,2026-03-02,22:00,23:30,9,2'),
  H('a run from 00:00 to 23:59, large counts', fac('Big,2026-12-31,00:00,23:59,123456789,1234567', 'Big,2026-01-01,00:00,00:01,1,0', 'Tiny,2026-12-31,12:00,12:30,3,0')),
  H('runs of one machine listed out of time order', fac('K,2026-03-02,14:00,15:00,50,5', 'K,2026-03-02,09:00,10:00,7,0', 'K,2026-03-01,23:00,23:59,10,0', 'J,2026-03-02,09:30,14:30,1,1')),
  B('parts made with a letter O for a zero (3O0)', fac('M1,2026-03-02,06:00,08:30,3O0,12', FGOOD[1], FGOOD[2])),
  B('scrapped empty', fWith('Press-4,2026-03-02,06:15,07:00,90,')),
  B('impossible end time 07:75', fWith('Press-4,2026-03-02,06:15,07:75,90,0')),
  B('row with 5 fields (scrapped missing)', fWith('Press-4,2026-03-02,06:15,07:00,90')),
  B('thousands separator (1,204) makes 7 fields', fWith('Press-4,2026-03-02,06:15,07:00,1,204,0')),
  B('header only, no busiest machine', FHDR),
  B('empty input, no header and no busiest machine', ''),
  B('run ends before it starts', fWith('Press-4,2026-03-02,07:00,06:15,90,0')),
  B('more parts scrapped than made', fWith('Press-4,2026-03-02,06:15,07:00,90,95')),
  B('two runs of one machine overlap', fac(FGOOD[0], FGOOD[1], 'M1,2026-03-02,08:00,10:00,200,8')),
];

// ---------- clinic-day (JSON, TypeScript's turf) ----------
const clinicSpec = `Clinic day.

Arg 1 is a JSON object exported from another system: {"doctors": [...], "visits": [...]}. "doctors" is an array of the doctors' names (strings); each doctor is listed once. Each element of "visits" is an object with "patient" (the patient's name, a string), "doctor" (one of the names in "doctors") and three times of day as "HH:MM" strings on a 24-hour clock: "arrived" (when the patient arrived), "seen" (when the doctor started seeing them) and "left" (when they left). All visits are on the same day. A patient is seen at or after the time they arrive, and leaves after they are seen. A doctor sees one patient at a time: a doctor's next patient is seen at or after the time the previous one left.

A visit's wait is its seen time minus its arrived time, and its care time is its left time minus its seen time, in minutes.

Output:
- one line per doctor, in the order of "doctors": \`DOCTOR VISITS WAIT CARE\`: their number of visits, and the total wait and the total care time of those visits in minutes;
- then \`longest-wait PATIENT MINUTES\`: the visit with the longest wait (if several share it, the first of them by patient name in Unicode code point order);
- then \`last-out HH:MM\`: the latest left time of the day.

Example: arg 1 = {"doctors":["Okafor","Berg"],"visits":[{"patient":"Lee","doctor":"Berg","arrived":"08:50","seen":"09:05","left":"09:20"},{"patient":"Ruiz","doctor":"Okafor","arrived":"09:00","seen":"09:00","left":"09:30"},{"patient":"Kim","doctor":"Berg","arrived":"09:10","seen":"09:25","left":"09:40"}]} prints
Okafor 1 0 30
Berg 2 30 30
longest-wait Kim 15
last-out 09:40`;

const vis = (patient, doctor, arrived, seen, left) => ({ patient, doctor, arrived, seen, left });
const C = (doctors, ...visits) => JSON.stringify({ doctors, visits });
const CDOC = ['Okafor', 'Berg'];
const CEX = [vis('Lee', 'Berg', '08:50', '09:05', '09:20'), vis('Ruiz', 'Okafor', '09:00', '09:00', '09:30'), vis('Kim', 'Berg', '09:10', '09:25', '09:40')];
const clinicChecks = [
  [C(CDOC, ...CEX)],
  [C(['Haas'], vis('Ito', 'Haas', '14:00', '14:20', '14:45'))],
  [C(['Ng', 'Diaz', 'Abe'], vis('p1', 'Diaz', '08:00', '08:10', '08:30'), vis('p2', 'Ng', '08:05', '08:05', '08:50'), vis('p3', 'Diaz', '08:15', '08:30', '09:00'), vis('p4', 'Abe', '10:00', '11:30', '11:31'))],
];
const CH = (trap, a) => ({ args: [a], trap });
const CB = (trap, a) => ({ args: [a], trap, bad: true });
// The example with visit i replaced by raw JSON text.
const cWith = (i, raw) => '{"doctors":["Okafor","Berg"],"visits":[' + CEX.map((v, j) => (j === i ? raw : JSON.stringify(v))).join(',') + ']}';
const clinicHidden = [
  CH('single visit with no wait', C(['Solo'], vis('Pat', 'Solo', '07:00', '07:00', '07:01'))),
  CH('doctors kept in list order, doctors with no visits', C(['Zhou', 'Adams', 'Mira'], vis('a', 'Adams', '09:00', '09:10', '09:20'))),
  CH('longest-wait tie broken by code point', C(['D'], vis('anna', 'D', '08:00', '08:30', '08:40'), vis('Anna', 'D', '08:10', '08:40', '08:50'), vis('Émile', 'D', '08:20', '08:50', '09:00'), vis('Zoe', 'D', '08:35', '09:00', '09:05'))),
  CH('next patient seen the minute the previous one left', C(['Ray'], vis('x', 'Ray', '10:00', '10:00', '10:15'), vis('y', 'Ray', '10:05', '10:15', '10:30'), vis('z', 'Ray', '10:06', '10:30', '10:31'))),
  CH('visits not listed in the order they were seen', C(['Ray', 'Sol'], vis('late', 'Ray', '11:00', '11:00', '11:30'), vis('early', 'Ray', '08:00', '09:00', '10:00'), vis('mid', 'Sol', '10:00', '10:05', '10:10'), vis('first', 'Sol', '07:00', '07:05', '07:30'))),
  CH('times at 00:00 and 23:59', C(['Night'], vis('n1', 'Night', '00:00', '00:00', '00:45'), vis('n2', 'Night', '23:00', '23:30', '23:59'))),
  CH('whitespace and key order', '{\n  "visits": [\n    {"left": "13:00", "seen": "12:40", "arrived": "12:00", "doctor": "Lind", "patient": "Ole"}\n  ],\n  "doctors": [ "Lind", "Berg" ]\n}'),
  CH('last-out is not from the last listed visit', C(['A', 'B'], vis('long', 'A', '08:00', '08:00', '17:15'), vis('short', 'B', '09:00', '09:05', '09:10'))),
  CH('waits of more than an hour, non-ASCII names', C(['Ødegård', '李'], vis('Søren', 'Ødegård', '08:05', '10:00', '10:20'), vis('王', '李', '06:59', '08:01', '09:02'), vis('Ana', '李', '09:00', '09:02', '09:03'))),
  CB('no visits, there is no longest wait', C(CDOC)),
  CB('top level is an array, not an object', JSON.stringify(CEX)),
  CB('invalid JSON (cut off)', C(CDOC, ...CEX).slice(0, -20)),
  CB('seen time missing', cWith(2, '{"patient":"Kim","doctor":"Berg","arrived":"09:10","left":"09:40"}')),
  CB('impossible time 09:65', cWith(2, '{"patient":"Kim","doctor":"Berg","arrived":"09:10","seen":"09:65","left":"09:40"}')),
  CB('time as a number (930), not an HH:MM string', cWith(1, '{"patient":"Ruiz","doctor":"Okafor","arrived":"09:00","seen":930,"left":"09:30"}')),
  CB('patient seen before arriving', cWith(1, '{"patient":"Ruiz","doctor":"Okafor","arrived":"09:00","seen":"08:45","left":"09:30"}')),
  CB('patient leaves before being seen', cWith(1, '{"patient":"Ruiz","doctor":"Okafor","arrived":"09:00","seen":"09:00","left":"08:30"}')),
  CB('a doctor sees two patients at once', cWith(2, '{"patient":"Kim","doctor":"Berg","arrived":"09:10","seen":"09:15","left":"09:40"}')),
  CB('visit with a doctor not in the doctors list', cWith(1, '{"patient":"Ruiz","doctor":"Novak","arrived":"09:00","seen":"09:00","left":"09:30"}')),
];

// ---------- helpdesk-log (text, both turfs) ----------
const helpSpec = `Help desk log.

Standard input is a ticket log exported from another system, one event per line, like
2026-03-02T09:20 T-101 assigned ana
The fields are separated by single spaces: the time (YYYY-MM-DDTHH:MM, UTC), the ticket id, and the event, which is \`opened\`, \`assigned AGENT\` or \`closed\`. Ticket ids and agent names have no spaces. Lines are in time order (several lines can share a time) and end with \\n.

Each ticket is opened once, before anything else happens to it. While it is open it can be assigned to an agent, and reassigned to another agent any number of times. It is assigned before it is closed. It is closed at most once, and nothing happens to it after it is closed.

A closed ticket is credited to the agent it was last assigned to, and its time to close is the number of minutes from its opened line to its closed line.

Output:
- one line per agent named in the log, in agent order by Unicode code point: \`AGENT CLOSED MINUTES\`: the number of tickets credited to them and the total time to close of those tickets;
- then \`open N\`: the number of tickets still open at the end of the log;
- then \`slowest TICKET MINUTES\`: the closed ticket with the longest time to close (if several share it, the first of them by ticket id in Unicode code point order).

Example: standard input
2026-03-02T09:15 T-101 opened
2026-03-02T09:20 T-101 assigned ana
2026-03-02T09:40 T-102 opened
2026-03-02T09:41 T-102 assigned ben
2026-03-02T10:05 T-102 assigned ana
2026-03-02T11:05 T-101 closed
2026-03-02T12:10 T-103 opened
2026-03-03T08:40 T-102 closed
prints
ana 2 1490
ben 0 0
open 1
slowest T-102 1380`;

const hl = (...rows) => rows.map((r) => r + '\n').join('');
const HGOOD = ['2026-03-02T09:15 T-101 opened', '2026-03-02T09:20 T-101 assigned ana', '2026-03-02T09:40 T-102 opened', '2026-03-02T09:41 T-102 assigned ben', '2026-03-02T10:05 T-102 assigned ana', '2026-03-02T11:05 T-101 closed', '2026-03-02T12:10 T-103 opened', '2026-03-03T08:40 T-102 closed'];
const hWith = (i, line) => hl(...HGOOD.map((r, j) => (j === i ? line : r)));
const hIns = (i, ...extra) => hl(...HGOOD.slice(0, i + 1), ...extra, ...HGOOD.slice(i + 1));
const helpChecks = [
  hl(...HGOOD),
  hl('2026-05-01T08:00 Q-1 opened', '2026-05-01T08:05 Q-1 assigned zoe', '2026-05-01T09:00 Q-1 closed'),
  hl('2026-04-10T10:00 A opened', '2026-04-10T10:00 B opened', '2026-04-10T10:30 A assigned lu', '2026-04-10T10:45 B assigned lu', '2026-04-10T11:00 C opened', '2026-04-10T11:10 C assigned max', '2026-04-10T12:00 B closed', '2026-04-10T12:30 A assigned max', '2026-04-10T13:00 A closed'),
];
const helpHidden = [
  H('ticket opened, assigned and closed in one minute', hl('2026-06-01T10:00 A-1 opened', '2026-06-01T10:00 A-1 assigned kim', '2026-06-01T10:00 A-1 closed')),
  H('agent order by code point, agents with nothing closed', hl('2026-03-02T08:00 X1 opened', '2026-03-02T08:01 X1 assigned bo', '2026-03-02T08:02 X1 assigned Bo', '2026-03-02T08:03 X1 assigned Ève', '2026-03-02T08:04 X1 assigned zed', '2026-03-02T08:05 X1 assigned Zed', '2026-03-02T08:30 X1 closed')),
  H('reassigned several times, credited to the last agent', hl('2026-03-02T09:00 R opened', '2026-03-02T09:05 R assigned amy', '2026-03-02T09:10 R assigned raj', '2026-03-02T09:15 R assigned amy', '2026-03-02T10:00 R closed', '2026-03-02T10:00 S opened', '2026-03-02T10:01 S assigned raj', '2026-03-02T10:31 S closed')),
  H('slowest tie broken by ticket id code point', hl('2026-03-02T09:00 T-9 opened', '2026-03-02T09:00 T-10 opened', '2026-03-02T09:00 t-1 opened', '2026-03-02T09:01 T-9 assigned a', '2026-03-02T09:01 T-10 assigned a', '2026-03-02T09:01 t-1 assigned b', '2026-03-02T10:00 T-9 closed', '2026-03-02T10:00 T-10 closed', '2026-03-02T10:00 t-1 closed')),
  H('across a leap day and a month boundary', hl('2028-02-28T23:30 L-1 opened', '2028-02-28T23:31 L-1 assigned noa', '2028-03-01T00:10 L-1 closed')),
  H('across a year boundary, several tickets left open', hl('2026-12-31T23:00 Y-1 opened', '2026-12-31T23:10 Y-2 opened', '2026-12-31T23:20 Y-2 assigned eli', '2026-12-31T23:50 Y-3 opened', '2026-12-31T23:55 Y-3 assigned eli', '2027-01-01T00:20 Y-3 closed', '2027-01-01T00:30 Y-4 opened')),
  H('non-ASCII agents and ticket ids, no final newline', hl('2026-03-02T09:00 Ärende-1 opened', '2026-03-02T09:05 Ärende-1 assigned Jürgen', '2026-03-02T09:06 票-2 opened', '2026-03-02T09:07 票-2 assigned 王芳', '2026-03-02T09:30 票-2 closed', '2026-03-02T09:45 Ärende-1 closed').replace(/\n$/, '')),
  H('many lines sharing one time', hl('2026-03-02T12:00 M1 opened', '2026-03-02T12:00 M2 opened', '2026-03-02T12:00 M1 assigned ivo', '2026-03-02T12:00 M2 assigned ivo', '2026-03-02T12:00 M1 closed', '2026-03-02T12:45 M2 closed')),
  H('a ticket open for weeks', hl('2026-01-01T00:00 W opened', '2026-01-05T08:00 W assigned pat', '2026-03-15T12:34 W closed', '2026-03-15T12:35 V opened')),
  B('impossible date (2026-03-32)', hWith(7, '2026-03-32T08:40 T-102 closed')),
  B('assigned with no agent (3 fields)', hWith(3, '2026-03-02T09:41 T-102 assigned')),
  B('last line cut off mid-way (no newline)', hl(...HGOOD.slice(0, 7)) + '2026-03-03T08:40 T-1'),
  B('empty input, no slowest ticket', ''),
  B('no ticket is closed, no slowest ticket', hl('2026-03-02T09:15 T-101 opened', '2026-03-02T09:20 T-101 assigned ana')),
  B('events on a ticket that was never opened', hIns(5, '2026-03-02T11:30 T-104 assigned ben', '2026-03-02T11:45 T-104 closed')),
  B('a ticket opened twice', hIns(4, '2026-03-02T10:30 T-101 opened')),
  B('a ticket closed twice', hl(...HGOOD, '2026-03-03T09:00 T-101 closed')),
  B('assigned after it was closed', hIns(5, '2026-03-02T11:30 T-101 assigned ben')),
  B('closed without being assigned', hIns(6, '2026-03-02T12:30 T-103 closed')),
  B('a line earlier than the line before it (closed before it was opened)', hWith(5, '2026-03-02T09:10 T-101 closed')),
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
  { id: 'factory-runs', name: 'Runs, minutes and good parts per machine, scrap rate and busiest machine from a CSV export', arena: 'csv', spec: factorySpec, input: 'standard input', checks: fill('factory-runs', factoryChecks), hidden: fill('factory-runs', factoryHidden, true) },
  { id: 'clinic-day', name: 'Visits, wait and care minutes per doctor, longest wait and last patient out from a JSON export', arena: 'json', spec: clinicSpec, input: 'its first command-line argument', checks: fill('clinic-day', clinicChecks), hidden: fill('clinic-day', clinicHidden, true) },
  { id: 'helpdesk-log', name: 'Tickets closed and minutes per agent, open tickets and slowest ticket from a ticket log', arena: 'text', spec: helpSpec, input: 'standard input', checks: fill('helpdesk-log', helpChecks), hidden: fill('helpdesk-log', helpHidden, true) },
];
const body = `// GENERATED by gen.mjs. Bad-data held-out set 6; happy expects from refs/<id>.py, cross-checked against
// refs/<id>.ts and refs/<id>.vow by verify.mjs. Checks with bad: true have no expect. Do not hand-edit.\n` +
  `export const BAD_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./tasks.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(`${t.id.padEnd(17)} visible ${t.checks.length}  hidden happy ${t.hidden.filter((c) => !c.bad).length}  hidden bad ${t.hidden.filter((c) => c.bad).length}`);
