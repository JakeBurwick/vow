// Fresh held-out home-turf tasks (2026-10-19), written after Vow's turf fixes so none of them was
// tuned for: config-merge (JSON, TypeScript's turf), timesheet and word-report (text, Python's turf).
// Expected outputs come from refs/<id>.py; verify.mjs cross-checks the .ts and .vow refs.
//   node bench/turf/gen-fresh.mjs   -> writes fresh.js
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const REFS = new URL('./refs', import.meta.url).pathname;

const mergeSpec = `Config merge.

Arg 1 is the base config and arg 2 is the override, each as JSON text. If either one is not valid JSON, print exactly \`error: bad json\` and nothing else. If both are valid JSON but either one is not a JSON object, print exactly \`error: not an object\` and nothing else.

Merge the override into the base, key by key:
- a key only in the base is kept as it is;
- if the override's value for a key is null, that key is removed from the result (if the base doesn't have it, nothing happens);
- if the override's value is an object, the result for that key is the base's value merged with it by these same rules when the base's value is also an object, and otherwise an empty object merged with it (so nulls inside it are dropped too);
- any other override value (string, number, true/false, array) replaces the base's value, or is added if the base has no such key. Arrays are never merged, and values inside arrays are copied unchanged.
If a JSON object has the same key more than once, the last one counts.

Print the merged config as one line of compact JSON (no spaces outside strings):
- object keys sorted by Unicode code point at every level; arrays keep their order;
- strings escaped as in standard JSON: \\" \\\\ \\b \\f \\n \\r \\t, any other character below U+0020 as \\u00XX with lowercase hex, and every other character (including all non-ASCII text) written as itself;
- a number that is a whole number is written as plain digits with no decimal point or exponent, exactly (1.0, 1e2 and 100 all print as 100, -0 prints as 0, and a long id like 12345678901234567890 prints with all its digits); any other number is written as the shortest decimal that reads back as the same 64-bit float, without an exponent (0.1, 2.25). Inputs never contain a non-whole number smaller than 0.0001 or larger than 10^15 in absolute value, and every whole number written with a "." or exponent is below 10^15.

Example: arg 1 = {"db":{"host":"a","port":5432},"debug":true,"tags":["x"]} and arg 2 = {"db":{"port":6000,"user":"me"},"debug":null,"tags":["y","z"]} print
{"db":{"host":"a","port":6000,"user":"me"},"tags":["y","z"]}`;

const mergeChecks = [
  ['{"db":{"host":"a","port":5432},"debug":true,"tags":["x"]}', '{"db":{"port":6000,"user":"me"},"debug":null,"tags":["y","z"]}'],
  ['{"b":1,"a":{"y":2,"x":1}}', '{}'],
  ['{"a":{"b":1}}', '{"a":5}'],
  ['{"a":5}', '{"a":{"b":1,"c":null}}'],
  ['{"a":1', '{}'],
  ['[1,2]', '{}'],
  ['{"name":"x"}', '{"name":"line\\nbreak \\"q\\""}'],
];
const M = (trap, a, b) => ({ args: [a, b], trap });
const mergeHidden = [
  M('non-ASCII written as itself', '{"city":"Zürich"}', '{"greet":"こんにちは"}'),
  M('emoji written as itself', '{}', '{"icon":"😀"}'),
  M('escaped non-ASCII input written plain', '{"a":"\\u00e9"}', '{}'),
  M('key sort by code point, astral vs U+FF5E', '{"😀":1,"～":2,"a":3}', '{}'),
  M('key sort by code point, nested', '{"x":{"𝒜":1,"￿":2}}', '{}'),
  M('key sort uppercase before lowercase', '{"b":1,"B":2,"a":3,"_":4}', '{}'),
  M('key sort numeric-looking keys as text', '{"10":1,"9":2,"a":3,"1":4}', '{"2":5}'),
  M('__proto__ key from override', '{"a":1}', '{"__proto__":{"x":1}}'),
  M('__proto__ key in base', '{"__proto__":5,"b":1}', '{"b":2}'),
  M('constructor key', '{"constructor":"c"}', '{"toString":"t"}'),
  M('hasOwnProperty key', '{"hasOwnProperty":1}', '{"hasOwnProperty":2}'),
  M('1.0 prints as 1', '{"a":1.0}', '{}'),
  M('exponent whole number', '{"a":1e2,"b":2.5E1}', '{}'),
  M('-0 prints as 0', '{"a":-0,"b":-0.0}', '{}'),
  M('decimal kept shortest', '{"a":0.1,"b":2.50,"c":123456.789}', '{}'),
  M('big id exact', '{"id":12345678901234567890}', '{}'),
  M('big negative id exact', '{"id":-98765432109876543210}', '{"x":1}'),
  M('decimal with 12 places kept', '{"a":0.123456789012,"b":1.0000000001}', '{}'),
  M('float sum not involved, 0.30000000000000004', '{"a":0.30000000000000004}', '{}'),
  M('duplicate key last wins', '{"a":1,"a":2}', '{}'),
  M('duplicate key in override, null last', '{"a":1}', '{"a":3,"a":null}'),
  M('duplicate key in override, null first', '{"a":1}', '{"a":null,"a":3}'),
  M('null override for missing key', '{"a":1}', '{"b":null}'),
  M('null inside new object dropped', '{}', '{"a":{"b":null,"c":{"d":null}}}'),
  M('null inside array kept', '{"a":[1]}', '{"a":[null,{"b":null}]}'),
  M('array not merged', '{"a":[1,2,3]}', '{"a":[9]}'),
  M('object replaces array', '{"a":[1,2]}', '{"a":{"0":"x"}}'),
  M('array replaces object', '{"a":{"b":1}}', '{"a":[]}'),
  M('base null kept', '{"a":null,"b":1}', '{}'),
  M('deep merge three levels', '{"a":{"b":{"c":1,"d":2}}}', '{"a":{"b":{"d":null,"e":3}}}'),
  M('empty override object keeps base object', '{"a":{"b":1}}', '{"a":{}}'),
  M('false and 0 replace', '{"a":true,"b":5,"c":"x"}', '{"a":false,"b":0,"c":""}'),
  M('control chars escaped', '{"a":"\\u0001\\b\\f\\t\\u001f"}', '{}'),
  M('DEL and U+2028 left as is', '{"a":"\\u007f\\u2028"}', '{}'),
  M('slash not escaped', '{"a":"\\/path/x"}', '{}'),
  M('whitespace around JSON', ' \n{"a":1}\t', ' {} '),
  M('top-level string', '"x"', '{}'),
  M('top-level null', '{}', 'null'),
  M('bad json before not-object', '[1]', '{bad}'),
  M('NaN is not JSON', '{"a":NaN}', '{}'),
  M('trailing comma is not JSON', '{"a":1,}', '{}'),
  M('single quotes are not JSON', "{'a':1}", '{}'),
  M('empty text is not JSON', '', '{}'),
];

const tsSpec = `Timesheet.

Standard input has one shift per line: \`name,start,end\`. Lines end with \\n or \\r\\n. A line that is empty or only spaces and tabs is skipped. Each of the 3 comma-separated fields may have spaces or tabs around it, which are ignored; the name must not be empty.

start and end are timestamps written \`YYYY-MM-DDTHH:MM\` or \`YYYY-MM-DDTHH:MM:SS\` (exactly those digit counts, a capital T), optionally followed by \`Z\` or by a UTC offset \`+HH:MM\` / \`-HH:MM\`. A timestamp with no Z and no offset is in UTC. The date must be a real calendar date, the hour 00-23, minutes and seconds 00-59, and an offset at most 23:59.

At the first line that breaks any of these rules, or whose end is not later than its start, print exactly \`error: line N\` and nothing else, where N is that line's 1-based number (skipped lines count).

Names are matched exactly (case-sensitive). A person's shifts can overlap; time covered by more than one of that person's shifts is counted once.

Output: one line per person, in name order by Unicode code point: \`NAME H:MM\`, that person's worked time with leftover seconds dropped (H is not zero-padded and can be more than 24; MM is 2 digits). Then \`total H:MM\` for everyone's worked seconds added up, then leftover seconds dropped. With no shifts, print just \`total 0:00\`.

Example: standard input
ana,2026-03-02T09:00,2026-03-02T12:30
bo,2026-03-02T08:00:00Z,2026-03-02T10:00:30+00:00
ana,2026-03-02T12:00,2026-03-02T13:00
prints
ana 4:00
bo 2:00
total 6:00`;

const tsChecks = [
  'ana,2026-03-02T09:00,2026-03-02T12:30\nbo,2026-03-02T08:00:00Z,2026-03-02T10:00:30+00:00\nana,2026-03-02T12:00,2026-03-02T13:00\n',
  'cy,2026-03-02T22:00,2026-03-03T06:15\n',
  '',
  'ana,2026-03-02T09:00,2026-03-02T09:00\n',
  'ana,2026-03-02T09:00\n',
  '\nana,2026-03-02T09:00,2026-03-02T10:00\nbo,yesterday,2026-03-02T10:00\n',
];
const T = (trap, stdin) => ({ stdin, trap });
const tsHidden = [
  T('no zone is UTC, vs Z', 'a,2026-03-02T09:00,2026-03-02T10:00Z\n'),
  T('no zone is UTC, vs offset', 'a,2026-03-02T09:00,2026-03-02T09:30+01:00\n'),
  T('no zone across a US DST change', 'a,2026-03-08T01:30,2026-03-08T03:30\n'),
  T('no zone across an EU DST change', 'a,2026-10-25T00:30,2026-10-25T02:30\n'),
  T('offset +05:30', 'a,2026-03-02T09:00+05:30,2026-03-02T05:00Z\n'),
  T('offset -03:00', 'a,2026-03-02T09:00-03:00,2026-03-02T13:00Z\n'),
  T('offset on end only, end before start', 'a,2026-03-02T09:00,2026-03-02T09:30+02:00\n'),
  T('start and end in different zones', 'a,2026-03-02T23:00-05:00,2026-03-03T06:00+01:00\n'),
  T('offset +14:00', 'a,2026-03-02T14:00+14:00,2026-03-02T01:00Z\n'),
  T('seconds summed before dropping', 'a,2026-03-02T09:00:40,2026-03-02T09:01:00\na,2026-03-02T10:00:00,2026-03-02T10:00:50\n'),
  T('total drops seconds after summing', 'a,2026-03-02T09:00:00,2026-03-02T09:00:40\nb,2026-03-02T09:00:00,2026-03-02T09:00:40\n'),
  T('overlap counted once', 'a,2026-03-02T09:00,2026-03-02T12:00\na,2026-03-02T10:00,2026-03-02T11:00\n'),
  T('overlap given out of order', 'a,2026-03-02T13:00,2026-03-02T15:00\na,2026-03-02T09:00,2026-03-02T14:00\n'),
  T('touching shifts', 'a,2026-03-02T09:00,2026-03-02T10:00\na,2026-03-02T10:00,2026-03-02T11:00\n'),
  T('overlap only within one person', 'a,2026-03-02T09:00,2026-03-02T10:00\nb,2026-03-02T09:00,2026-03-02T10:00\n'),
  T('chain of overlaps', 'a,2026-03-02T09:00,2026-03-02T10:00\na,2026-03-02T09:30,2026-03-02T11:00\na,2026-03-02T10:30,2026-03-02T12:00\na,2026-03-02T15:00,2026-03-02T15:10\n'),
  T('overlap across zones', 'a,2026-03-02T09:00Z,2026-03-02T11:00Z\na,2026-03-02T11:00+01:00,2026-03-02T13:00+01:00\n'),
  T('hours past 24', 'a,2026-03-01T00:00,2026-03-03T01:05\n'),
  T('names case-sensitive', 'Ana,2026-03-02T09:00,2026-03-02T10:00\nana,2026-03-02T09:00,2026-03-02T10:00\n'),
  T('name order by code point', 'émile,2026-03-02T09:00,2026-03-02T10:00\nzoe,2026-03-02T09:00,2026-03-02T10:00\nZed,2026-03-02T09:00,2026-03-02T10:00\n'),
  T('spaces and tabs around fields', ' ana \t,\t2026-03-02T09:00 , 2026-03-02T10:00\t\n'),
  T('CRLF lines', 'a,2026-03-02T09:00,2026-03-02T10:00\r\nb,2026-03-02T09:00,2026-03-02T09:45\r\n'),
  T('no final newline', 'a,2026-03-02T09:00,2026-03-02T10:00'),
  T('blank lines counted in numbering', 'a,2026-03-02T09:00,2026-03-02T10:00\n\n  \t\nb,bad,2026-03-02T10:00\n'),
  T('leap day 2028 valid', 'a,2028-02-29T09:00,2028-02-29T10:00\n'),
  T('Feb 29 2027 invalid', 'a,2027-02-29T09:00,2027-02-29T10:00\n'),
  T('April 31 invalid', 'a,2026-04-31T09:00,2026-04-31T10:00\n'),
  T('hour 24 invalid', 'a,2026-03-02T09:00,2026-03-02T24:00\n'),
  T('second 60 invalid', 'a,2026-03-02T09:00,2026-03-02T09:30:60\n'),
  T('space instead of T invalid', 'a,2026-03-02 09:00,2026-03-02T10:00\n'),
  T('lowercase t invalid', 'a,2026-03-02t09:00,2026-03-02T10:00\n'),
  T('hour only invalid', 'a,2026-03-02T09,2026-03-02T10:00\n'),
  T('basic format invalid', 'a,20260302T0900,2026-03-02T10:00\n'),
  T('fractional seconds invalid', 'a,2026-03-02T09:00:00.5,2026-03-02T10:00\n'),
  T('offset without colon invalid', 'a,2026-03-02T09:00+0100,2026-03-02T10:00\n'),
  T('lowercase z invalid', 'a,2026-03-02T09:00z,2026-03-02T10:00\n'),
  T('one-digit month invalid', 'a,2026-3-02T09:00,2026-03-02T10:00\n'),
  T('date only invalid', 'a,2026-03-02,2026-03-03\n'),
  T('empty name', ' ,2026-03-02T09:00,2026-03-02T10:00\n'),
  T('four fields', 'a,2026-03-02T09:00,2026-03-02T10:00,x\n'),
  T('error after good lines stops output', 'a,2026-03-02T09:00,2026-03-02T10:00\nb,2026-03-02T11:00,2026-03-02T10:00\n'),
  T('only blank lines', '\n \n\t\n'),
];

const wrSpec = `Word report.

Arg 1 is N, the number of words to show: plain digits, a whole number from 1 to 1000. Otherwise print exactly \`error: bad n\` and nothing else.

Standard input is UTF-8 text. Find its words:
- a word is a run of letters and digits in any script. A letter is any Unicode character whose general category is a letter (Lu, Ll, Lt, Lm, Lo); a digit is general category Nd. Other numeric characters such as ² or ½ are not digits;
- a combining mark (general category Mn, Mc or Me) continues the word it follows, so a letter followed by a combining accent stays one word;
- an apostrophe (' or ’) with a word character before it and a letter or digit right after it is part of the word ("don't", "o’clock"); it is written as ' in the output;
- every other character separates words, including _ and -.
Two words are the same word when they are equal after Unicode NFC normalization followed by lowercasing (full Unicode lowercase mapping). Each word is reported in that normalized lowercase form.

Output the N most frequent words (fewer if there are fewer words), most frequent first; words with the same count are in Unicode code point order. Each line is the word, then spaces so that every printed word takes the width of the longest printed word, counted in Unicode code points (characters), then one space, then the count. If the text has no words, print exactly \`no words\`.

Example: arg 1 = 3, standard input "The cat and the hat. THE end, and fin." prints
the 3
and 2
cat 1`;

const wrChecks = [
  [['3'], 'The cat and the hat. THE end, and fin.'],
  [['10'], 'one two two three three three'],
  [['2'], "It's what it's for: don't stop.\n"],
  [['5'], '... --- !!!'],
  [['0'], 'a'],
  [['x'], 'a'],
  [['4'], 'apple banana apple cherry banana apple date'],
];
const W = (trap, n, stdin) => ({ args: [n], stdin, trap });
const wrHidden = [
  W('accented letters are letters', '5', 'café naïve café résumé'),
  W('decomposed accent one word, same as composed', '5', 'café café CAFÉ'),
  W('combining mark width counted by code point after NFC', '5', 'éé ab'),
  W('mark with no precomposed form keeps width', '5', 'q̇ xyz'),
  W('curly apostrophe joins', '5', 'it’s it\'s IT’S'),
  W('leading and trailing apostrophes not part of word', '5', "'tis rock'n'roll' the dogs' bone"),
  W('double apostrophe splits', '5', "don''t"),
  W('apostrophe before a mark splits', '5', "a'́b"),
  W('underscore separates', '5', 'snake_case snake'),
  W('hyphen separates', '5', 'well-known well'),
  W('superscript two is not a digit', '5', 'x² x2 x'),
  W('fraction is not a digit', '5', '3½ 3'),
  W('Arabic-Indic digits are digits', '5', 'ab٣ ab٣'),
  W('digits alone are words', '5', '2026 2026 7'),
  W('CJK letters', '5', '東京 大阪 東京'),
  W('Greek and Cyrillic lowercase', '5', 'ΣΟΦΙΑ σοφια Москва МОСКВА'),
  W('emoji separate words', '5', 'go😀go'),
  W('astral letters width by code point', '5', '𝒜𝒷𝒸 ab ab'),
  W('astral letter sort vs U+FF41 by code point', '5', '𝐚 ａ'),
  W('Gothic letters', '5', '𐌰𐌱 x'),
  W('dotted capital I lowercases to two code points', '5', 'İstanbul ab'),
  W('Kelvin sign NFC', '5', 'K k'),
  W('Angstrom sign NFC', '5', 'Å Å å'),
  W('ties by code point, uppercase input', '5', 'Banana apple Cherry'),
  W('ties: accented after z', '5', 'zebra éclair apple'),
  W('N cuts', '2', 'a a a b b c'),
  W('N larger than word count', '1000', 'x y'),
  W('width from printed words only', '1', 'a a extraordinarily'),
  W('tabs and newlines separate', '5', 'a\tb\nc\r\nd'),
  W('NBSP separates', '5', 'a b'),
  W('zero-width space separates', '5', 'a​b'),
  W('BOM at start', '5', '﻿hello hello'),
  W('empty input', '5', ''),
  W('n with plus', '+3', 'a'),
  W('n 1001', '1001', 'a'),
  W('n with leading zeros', '007', 'a b'),
  W('n with space', ' 3', 'a'),
  W('n fullwidth digit', '３', 'a'),
  W('n empty', '', 'a'),
];

function fill(id, list, hidden, mode) {
  return list.map((c) => {
    let args, stdin;
    if (mode === 'args') args = Array.isArray(c) ? c : c.args;
    else if (mode === 'stdin') { args = []; stdin = typeof c === 'string' ? c : c.stdin; }
    else { args = Array.isArray(c) ? c[0] : c.args; stdin = Array.isArray(c) ? c[1] : c.stdin; }
    const out = execFileSync('python3', [`${REFS}/${id}.py`, ...args], { encoding: 'utf8', input: stdin ?? '' }).replace(/\n$/, '');
    const r = { args };
    if (stdin !== undefined) r.stdin = stdin;
    r.expect = out;
    if (hidden) r.trap = c.trap;
    return r;
  });
}
const tasks = [
  { id: 'config-merge', name: 'Deep-merge two JSON configs, print canonical JSON', arena: 'json', spec: mergeSpec, checks: fill('config-merge', mergeChecks, false, 'args'), hidden: fill('config-merge', mergeHidden, true, 'args') },
  { id: 'timesheet', name: 'Worked hours from timestamped shifts', arena: 'csv', spec: tsSpec, checks: fill('timesheet', tsChecks, false, 'stdin'), hidden: fill('timesheet', tsHidden, true, 'stdin') },
  { id: 'word-report', name: 'Top words in Unicode text, aligned table', arena: 'csv', spec: wrSpec, checks: fill('word-report', wrChecks, false, 'both'), hidden: fill('word-report', wrHidden, true, 'both') },
];
const body = `// GENERATED by gen-fresh.mjs. Fresh held-out home-turf tasks; expected outputs from refs/<id>.py,
// cross-checked against refs/<id>.ts and refs/<id>.vow by verify.mjs. Do not hand-edit expects.\n` +
  `export const FRESH_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./fresh.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(t.id, t.checks.length, t.hidden.length);
