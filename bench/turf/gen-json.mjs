import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const REFS = new URL('./refs', import.meta.url).pathname;

const o = (id, date, price, qty, extra = '') => `{"id":${id},"date":"${date}","price":${price},"qty":${qty}${extra}}`;
const arr = (...xs) => `[${xs.join(',')}]`;
const D = '"2026-03-01"';

const ledgerSpec = `Order ledger.

Arg 1 is the order list as JSON. If it is not valid JSON, or not a JSON array, print exactly \`error: bad json\` and nothing else.

Each array element is an order object with these fields (other fields are ignored):
- "id": the order number, written as plain digits, either as a JSON number (7) or as a JSON string ("7"). Leading zeros do not matter: 7, "7" and "007" are the same order.
- "date": the order date, a string "YYYY-MM-DD" that is a real calendar date.
- "price": the unit price in dollars, either a JSON number or a string of digits optionally followed by "." and 1 to 3 digits (like "12.50"). It must be at least 0, under 100000, and have at most 3 decimal places.
- "qty": the number of units, a JSON number that is a whole number from 1 to 1000.
- "discount": optional; missing or null means no discount. Otherwise a JSON number from 0 to 1 with at most 2 decimal places (0.15 means 15% off).
A required field that is missing or null is invalid. An element that is not an object, or that breaks any rule above, is a bad order.

Check every order in array order, including repeats of an earlier id. At the first bad order print exactly \`error: bad order N\` (N = its 1-based position in the array) and nothing else.

If several orders have the same id, only the first one counts; later ones are ignored.

Order total = price x qty x (1 - discount), rounded to the cent, halves rounded up. Daily totals and the grand total are sums of the rounded order totals.

Output (every amount with exactly 2 decimals):
- for each date that has at least one counted order, in ascending date order, a line \`YYYY-MM-DD T\` where T is that date's total;
- then \`orders N\` where N is the number of counted orders;
- then \`total X\` where X is the grand total.
An empty array prints \`orders 0\` then \`total 0.00\`.

Example: arg 1 = [{"id":1,"date":"2026-03-02","price":"12.50","qty":2},{"id":2,"date":"2026-03-01","price":5,"qty":3,"discount":0.1}] prints
2026-03-01 13.50
2026-03-02 25.00
orders 2
total 38.50`;

const ledgerChecks = [
  [arr(o(1, '2026-03-02', '"12.50"', 2), o(2, '2026-03-01', 5, 3, ',"discount":0.1'), o(3, '2026-03-02', 3.25, 4, ',"discount":null'))],
  [arr(o(7, '2026-01-05', 4, 1), o(8, '2026-01-05', '"2.5"', 2), o(7, '2026-01-06', 100, 1))],
  ['[]'],
  ['nope'],
  ['{"id":1}'],
  [arr(o(1, '2026-03-01', 5, 1), o(2, '2026-03-01', '"abc"', 1))],
];

const L = (trap, a) => ({ trap, args: [a] });
const ledgerHidden = [
  L('id > 2^53 kept distinct', arr(o('9219976635399687875', '2026-03-01', 1, 1), o('9219976635399687876', '2026-03-01', 2, 1))),
  L('id > 2^53 number vs string same', arr(o('9219976635399687875', '2026-03-01', 1, 1), o('"9219976635399687875"', '2026-03-01', 2, 1))),
  L('id leading zeros same id', arr(o('"007"', '2026-03-01', 1, 1), o(7, '2026-03-02', 2, 1))),
  L('id string vs number same', arr(o('"12"', '2026-03-01', 1, 1), o(12, '2026-03-01', 2, 1), o(13, '2026-03-01', 4, 1))),
  L('half-up 1.005', arr(o(1, '2026-03-01', '"1.005"', 1))),
  L('float rounding 2.675', arr(o(1, '2026-03-01', 2.675, 1))),
  L('float product 19.99*3*0.85', arr(o(1, '2026-03-01', 19.99, 3, ',"discount":0.15'))),
  L('float product 1.15*3*0.5 half', arr(o(1, '2026-03-01', 1.15, 3, ',"discount":0.5'))),
  L('discount turns 2.01 into 1.005', arr(o(1, '2026-03-01', 2.01, 1, ',"discount":0.5'))),
  L('round per order then sum', arr(o(1, D.slice(1, -1), 0.333, 1), o(2, '2026-03-01', 0.333, 1), o(3, '2026-03-01', 0.333, 1))),
  L('float sum 0.1+0.2', arr(o(1, '2026-03-01', 0.1, 1), o(2, '2026-03-01', 0.2, 1))),
  L('price 0 is valid (falsy)', arr(o(1, '2026-03-01', 0, 5), o(2, '2026-03-01', 3, 1))),
  L('price "0" is valid (falsy)', arr(o(1, '2026-03-01', '"0"', 1))),
  L('discount 1 makes it free', arr(o(1, '2026-03-01', 10, 2, ',"discount":1'))),
  L('discount as string', arr(o(1, '2026-03-01', 10, 1), o(2, '2026-03-01', 10, 1, ',"discount":"0.1"'))),
  L('discount 3 decimals', arr(o(1, '2026-03-01', 10, 1, ',"discount":0.155'))),
  L('qty as numeric string', arr(o(1, '2026-03-01', 10, '"2"'))),
  L('qty 0', arr(o(1, '2026-03-01', 10, 0))),
  L('qty fractional', arr(o(1, '2026-03-01', 10, 1.5))),
  L('qty true is not a number', arr(o(1, '2026-03-01', 10, 'true'))),
  L('lax Number(" 5")', arr(o(1, '2026-03-01', 1, 1), o(2, '2026-03-01', '" 5"', 1))),
  L('lax Number("") = 0', arr(o(1, '2026-03-01', '""', 1))),
  L('parseFloat("12abc")', arr(o(1, '2026-03-01', '"12abc"', 1))),
  L('exponent in price number is fine', arr(o(1, '2026-03-01', '1e2', 1), o(2, '2026-03-01', '12.5', 2))),
  L('price 4 decimals', arr(o(1, '2026-03-01', 1.0001, 1))),
  L('negative price', arr(o(1, '2026-03-01', -5, 1))),
  L('price just under bound, big total', arr(o(1, '2026-03-01', 99999.999, 1000), o(2, '2026-03-02', '"99999.999"', 999, ',"discount":0.01'))),
  L('price 100000 out of range', arr(o(1, '2026-03-01', 100000, 1))),
  L('impossible date 02-30', arr(o(1, '2026-02-30', 1, 1))),
  L('leap years', arr(o(1, '2024-02-29', 1, 1), o(2, '2023-02-29', 1, 1))),
  L('date not zero-padded', arr(o(1, '2026-3-01', 1, 1))),
  L('null id', arr(o(1, '2026-03-01', 1, 1), o('null', '2026-03-01', 1, 1))),
  L('price null vs missing', arr(o(1, '2026-03-01', 'null', 1))),
  L('bad duplicate still validated', arr(o(1, '2026-03-01', 1, 1), o(2, '2026-03-01', 1, 1), o(1, '2026-03-01', '"x"', 1))),
  L('first duplicate wins (date and price)', arr(o(5, '2026-03-02', 1, 1), o(5, '2026-03-01', 50, 1), o(6, '2025-12-31', 2, 1))),
  L('NaN literal is not JSON', '[{"id":1,"date":"2026-03-01","price":NaN,"qty":1}]'),
  L('element not an object', arr(o(1, '2026-03-01', 1, 1), '5')),
  L('first bad order wins', arr(o(1, '2026-03-01', 1, 1), o(2, '2026-03-01', 1, 0), o(3, '2026-03-01', -1, 1))),
];

const stockSpec = `Stock events.

Arg 1 is a list of inventory events as JSON. If it is not valid JSON, or not a JSON array, print exactly \`error: bad json\` and nothing else.

Events are applied in order to an initially empty inventory. Each event is a JSON object with a string field "type" and the fields listed for that type (other fields are ignored). A sku is a non-empty JSON string; a qty is a JSON number that is a whole number, at least 1.
- "add": "sku", "qty". If the sku does not exist yet, it is created at the end of the inventory with that qty and no price; otherwise its qty goes up by qty.
- "remove": "sku", "qty". The sku must exist and have at least that much stock; its qty goes down. A sku whose qty reaches 0 stays in the inventory.
- "rename": "sku", "to" (a non-empty JSON string). The sku must exist and the name "to" must not already exist. The sku takes the new name and keeps its place, qty and price; the old name no longer exists (adding it again later creates a new sku at the end).
- "price": "sku", "price". The "price" field is required: null clears the sku's price; otherwise it must be a JSON number from 0 to 1000000 with at most 2 decimal places, and becomes the sku's price. The sku must exist.

Errors. Check each event in order, in this priority; at the first event that fails print only the error line and nothing else (N = the event's 1-based position):
1. the event is not an object, or "type" is missing or not a string: \`error: bad event N\`
2. "type" is not one of add, remove, rename, price (exact spelling): \`error: unknown event N\`
3. a field the type needs is missing or invalid: \`error: bad event N\`
4. the event is well-formed but not allowed (sku does not exist, not enough stock, new name already exists): \`error: rejected event N\`

Output, two lines:
1. The final inventory as one line of compact JSON (no spaces): an object with one key per sku, in inventory order (the order the skus were created; a renamed sku keeps its place), each value {"qty":Q,"price":P}. P is the price as a JSON number in shortest plain form (12.50 -> 12.5, 100.0 -> 100), or null if the sku has no price. Sku names are written as JSON strings with only the characters JSON requires escaped; all other characters, including non-ASCII ones, appear as-is.
2. \`avg price X.XX\`: the average price of all skus that have a price (a price of 0 counts; qty does not matter), rounded half up to 2 decimals. If no sku has a price, print \`avg price none\`.

Example: arg 1 = [{"type":"add","sku":"a","qty":5},{"type":"add","sku":"b","qty":2},{"type":"price","sku":"a","price":2.5},{"type":"remove","sku":"a","qty":2},{"type":"rename","sku":"b","to":"c"},{"type":"price","sku":"c","price":1}] prints
{"a":{"qty":3,"price":2.5},"c":{"qty":2,"price":1}}
avg price 1.75`;

const E = (...xs) => JSON.stringify(xs);
const add = (sku, qty) => ({ type: 'add', sku, qty });
const rem = (sku, qty) => ({ type: 'remove', sku, qty });
const ren = (sku, to) => ({ type: 'rename', sku, to });
const pr = (sku, price) => ({ type: 'price', sku, price });
const S = (trap, a) => ({ trap, args: [a] });
const stockChecks = [
  [E(add('a', 5), add('b', 2), pr('a', 2.5), rem('a', 2), ren('b', 'c'), pr('c', 1))],
  [E(add('x', 1), add('y', 4), add('x', 2))],
  ['[]'],
  ['{"type":"add"}'],
  [E(add('a', 1), { type: 'restock', sku: 'a', qty: 1 })],
  [E(add('a', 1), { type: 'add', sku: 'b' })],
  [E(add('a', 1), rem('a', 2))],
];
const stockHidden = [
  S('integer-like keys reorder', E(add('b', 1), add('10', 2), add('2', 3))),
  S('__proto__ sku', E(add('a', 1), add('__proto__', 2), pr('__proto__', 3))),
  S('rename keeps position', E(add('a', 1), add('b', 2), ren('a', 'z'))),
  S('rename to integer-like keeps position', E(add('a', 1), add('b', 2), ren('b', '1'))),
  S('old name re-added goes to end', E(add('a', 1), add('b', 2), ren('a', 'c'), add('a', 7))),
  S('rename onto existing', E(add('a', 1), add('b', 2), ren('a', 'b'))),
  S('rename to itself', E(add('a', 1), ren('a', 'a'))),
  S('rename unknown sku', E(add('a', 1), ren('q', 'r'))),
  S('price 0 counts as set', E(add('a', 1), add('b', 1), pr('a', 0), pr('b', 3))),
  S('price null clears', E(add('a', 1), pr('a', 5), pr('a', null))),
  S('price field missing vs null', E(add('a', 1), { type: 'price', sku: 'a' })),
  S('no prices -> none, not NaN', E(add('a', 1), add('b', 2))),
  S('avg 0.015 float rounding', E(add('a', 1), add('b', 1), pr('a', 0.01), pr('b', 0.02))),
  S('avg 1.005 half-up', E(add('a', 1), add('b', 1), pr('a', 1), pr('b', 1.01))),
  S('avg 1.125 half-up', E(add('a', 1), add('b', 1), pr('a', 1.12), pr('b', 1.13))),
  S('avg of thirds', E(add('a', 1), add('b', 1), add('c', 1), pr('a', 1), pr('b', 1), pr('c', 2))),
  S('price shortest form 12.50/100.0', '[{"type":"add","sku":"a","qty":1},{"type":"add","sku":"b","qty":1},{"type":"price","sku":"a","price":12.50},{"type":"price","sku":"b","price":100.0}]'),
  S('price exponent 1e2', '[{"type":"add","sku":"a","qty":1},{"type":"price","sku":"a","price":1e2}]'),
  S('price as string', E(add('a', 1), pr('a', '5'))),
  S('price 3 decimals', E(add('a', 1), pr('a', 1.234))),
  S('negative price', E(add('a', 1), pr('a', -1))),
  S('qty 0', E(add('a', 0))),
  S('qty numeric string', E(add('a', '2'))),
  S('qty fractional', E(add('a', 1), add('a', 1.5))),
  S('qty true', E(add('a', true))),
  S('remove to exactly 0 keeps sku', E(add('a', 2), add('b', 1), rem('a', 2), pr('a', 4))),
  S('remove unknown sku', E(add('a', 2), rem('b', 1))),
  S('price unknown sku', E(add('a', 2), pr('b', 1))),
  S('type missing', E(add('a', 2), { sku: 'a', qty: 1 })),
  S('type case-sensitive', E({ type: 'Add', sku: 'a', qty: 1 })),
  S('unknown type beats missing fields', E(add('a', 1), { type: 'delete' })),
  S('unknown event after valid ones: no partial output', E(add('a', 1), pr('a', 2), add('b', 1), { type: 'archive', sku: 'b' })),
  S('empty sku', E(add('', 1))),
  S('numeric sku', '[{"type":"add","sku":10,"qty":1}]'),
  S('non-ASCII and quote in sku', E(add('café', 1), add('a"b', 2), add('ü\\x', 3))),
  S('event not an object', E(add('a', 1), 'add')),
  S('NaN literal is not JSON', '[{"type":"add","sku":"a","qty":NaN}]'),
  S('object instead of array', '{"type":"add","sku":"a","qty":1}'),
  S('price survives rename; qty-0 sku in average', E(add('a', 3), pr('a', 2), rem('a', 3), ren('a', 'b'), add('c', 1), pr('c', 3))),
];

const lbSpec = `Leaderboard.

Args 1 and 2 are two score files as JSON. Each must be a JSON object mapping a player name to a score. If arg 1 is not valid JSON or not an object print exactly \`error: bad json\`; then the same check for arg 2. A file never lists the same name twice.

A score is a JSON number; a JSON string holding a plain decimal number (an optional "-", digits, and optionally "." followed by digits, like "7.5" or "-3"); or null, meaning "no score in this file". Anything else is a bad score. If either file has a bad score, print exactly \`error: bad score NAME\`, where NAME is the first of the bad entries' names in Unicode code point order, and nothing else.

Then arg 3 is N. It must be digits only, with value at least 1; otherwise print exactly \`error: bad n\`.

A player's score is the highest of their non-null scores across both files. A player with no non-null score in either file is not ranked.

Order the ranked players by score, highest first, ties by name in Unicode code point order. Ranks are competition ranks: 1 + the number of players with a strictly higher score (scores 10, 10, 9 get ranks 1, 1, 3). Print the first N players in this order (all of them if there are fewer; a tie at the cut-off is not extended), one line each: \`RANK. NAME SCORE\`. SCORE is the value in shortest plain decimal form: no exponent, no leading zeros in the whole-number part, no trailing zeros after the point, no point for whole values, and zero as 0 (never -0): 12.50 -> 12.5, "007" -> 7, 1e2 -> 100. If no player is ranked, print nothing.

Example: args '{"ann":10,"bob":"7.5","cy":null}' '{"bob":9,"dee":10.0}' '3' print
1. ann 10
1. dee 10
3. bob 9`;
const B = (trap, a, b, n) => ({ trap, args: [a, b, n] });
const lbChecks = [
  ['{"ann":10,"bob":"7.5","cy":null}', '{"bob":9,"dee":10.0}', '3'],
  ['{"ann":3,"bob":"4.25"}', '{"cy":1}', '10'],
  ['{"ann":1}', 'not json', '3'],
  ['{"ann":"ten","bob":2}', '{}', '3'],
  ['{"ann":1}', '{}', '0'],
  ['{}', '{"cy":null}', '5'],
];
const lbHidden = [
  B('default sort compares as strings', '{"a":10,"b":9,"c":1,"d":100}', '{}', '9'),
  B('numeric-looking names in tie order', '{"b":5,"10":5,"2":5}', '{}', '9'),
  B('UTF-16 vs code point name order', '{"😀":5,"ｚ":5,"a":5}', '{}', '9'),
  B('big string scores beyond 2^53', '{"a":"9007199254740992","b":"9007199254740993"}', '{}', '9'),
  B('big JSON number scores beyond 2^53', '{"a":9007199254740992,"b":9007199254740993}', '{}', '9'),
  B('float noise 0.30000000000000004', '{"a":"0.3","b":0.30000000000000004}', '{}', '9'),
  B('shortest form 12.50', '{"a":"12.50","b":12.50}', '{}', '9'),
  B('leading zeros "007"', '{"a":"007","b":"-0012.0"}', '{}', '9'),
  B('score 0 kept (falsy)', '{"a":0,"b":-1}', '{"c":"0"}', '9'),
  B('null in one file, number in other', '{"a":null,"b":null}', '{"a":3}', '9'),
  B('max of string "12" vs number 5', '{"a":5}', '{"a":"12"}', '9'),
  B('max across files keeps higher first file', '{"a":"9.5"}', '{"a":9.25}', '9'),
  B('negative scores order', '{"a":-1,"b":-10,"c":"-0.5"}', '{}', '9'),
  B('-0 prints 0', '{"a":"-0","b":"-0.00"}', '{}', '9'),
  B('lax Number(" 5")', '{"a":" 5"}', '{}', '3'),
  B('lax Number("") = 0', '{"a":""}', '{}', '3'),
  B('lax Number("0x1A")', '{"a":"0x1A"}', '{}', '3'),
  B('parseFloat("12abc")', '{"a":"12abc"}', '{}', '3'),
  B('exponent in score string', '{"a":"1e3"}', '{}', '3'),
  B('plus sign in score string', '{"a":"+5"}', '{}', '3'),
  B('bool score', '{"a":true}', '{}', '3'),
  B('array score', '{"a":[5]}', '{}', '3'),
  B('trailing dot "5."', '{"a":"5."}', '{}', '3'),
  B('leading dot ".5"', '{"a":".5"}', '{}', '3'),
  B('exponent JSON numbers', '{"a":1e2,"b":1.5e-3}', '{}', '9'),
  B('competition ranking 1,1,3,3', '{"a":10,"b":10,"c":9,"d":9,"e":1}', '{}', '9'),
  B('N cuts inside a tie', '{"a":10,"b":10,"c":10}', '{}', '2'),
  B('bad score name priority across files', '{"zed":"x","b":1}', '{"amy":"y"}', '3'),
  B('bad score priority numeric names', '{"b":"x","10":"y","2":"z"}', '{}', '3'),
  B('bad json before bad score', '{"a":"x"}', '[1,2]', '3'),
  B('bad score before bad n', '{"a":"x"}', '{}', '0'),
  B('n not digits', '{"a":1}', '{}', '-1'),
  B('n with space', '{"a":1}', '{}', ' 3'),
  B('n 1.0', '{"a":1}', '{}', '1.0'),
  B('n "007"', '{"a":1,"b":2}', '{}', '007'),
  B('arg 1 null', 'null', '{}', '3'),
  B('__proto__ name', '{"__proto__":5,"a":3}', '{"__proto__":"7"}', '9'),
  B('decimal compare 1.10 vs 1.9', '{"a":"1.10","b":"1.9"}', '{}', '9'),
  B('NaN literal is not JSON', '{"a":NaN}', '{}', '3'),
];

function fill(id, list, hidden) {
  return list.map((c) => {
    const args = Array.isArray(c) ? c : c.args;
    const outp = execFileSync('python3', [`${REFS}/${id}.py`, ...args], { encoding: 'utf8' }).replace(/\n$/, '');
    return hidden ? { args, expect: outp, trap: c.trap } : { args, expect: outp };
  });
}
const tasks = [
  { id: 'order-ledger', name: 'Daily totals from a JSON order list', arena: 'json', spec: ledgerSpec, checks: fill('order-ledger', ledgerChecks), hidden: fill('order-ledger', ledgerHidden, true) },
  { id: 'stock-events', name: 'Apply inventory events, print JSON state', arena: 'json', spec: stockSpec, checks: fill('stock-events', stockChecks), hidden: fill('stock-events', stockHidden, true) },
  { id: 'leaderboard', name: 'Merge two score files into a ranked leaderboard', arena: 'json', spec: lbSpec, checks: fill('leaderboard', lbChecks), hidden: fill('leaderboard', lbHidden, true) },
];
const body = `// JSON-shaping benchmark tasks: TypeScript's home turf. Expected outputs generated from refs/<id>.py
// and cross-checked against refs/<id>.ts and refs/<id>.vow by verify.mjs. Do not hand-edit expects.\n` +
  `export const JSON_TASKS = ${JSON.stringify(tasks, null, 2)};\n`;
writeFileSync(new URL('./json.js', import.meta.url).pathname, body);
for (const t of tasks) console.log(t.id, t.checks.length, t.hidden.length);
