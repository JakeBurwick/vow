# Bad-data bench, held-out set 3

A third fresh set of three tickets built exactly like `bench/turf/bad` and `bench/turf/bad2` (read `bad/README.md` for the question, the rule and the scoring), in domains none of the earlier six tasks touch. Same rule: the tickets describe only the happy path and never mention errors, validation, skipping or malformed input; the only nod is that each input is "exported from another system". Same scoring: `../bad/lib.mjs` (imported, not copied) runs each solution as a real process and applies the same LOUD rule.

## Tasks

| task | input | turf | visible checks | hidden happy | hidden bad |
|---|---|---|---|---|---|
| payroll | CSV on stdin: pay per employee rounded half up to the cent, total and headcount per dept, grand total, top earner | Python's (CSV) | 3 | 9 | 11 |
| order-merge | JSON object in arg 1: orders, item count and spend per customer, best-selling sku | TypeScript's (JSON) | 3 | 9 | 12 |
| temp-readings | readings log on stdin: min, max and mean per station, coldest reading | both (text) | 3 | 9 | 11 |

Hidden happy checks are valid but awkward input (code-point order, exact cents and tenths, pay landing on exactly half a cent, a negative mean on .x5, a mean that rounds to zero and a `-0.0` reading, ties, zero hours, a free item, leading zeros, lines out of order, no final newline). Hidden bad checks have no expected output because none is right.

### Bad checks, and why no normal answer is right

payroll
- hours `40h`, empty, `Infinity`; rate `NaN`: that employee's pay, the dept total, the grand total and possibly the top earner cannot be known.
- a row with 3 fields; a decimal comma (`48,10`) that makes 5 fields; a name with a comma (`Lee, Ben`) that makes 5 fields: which field is the dept, the hours or the rate, nothing says.
- dept empty: the employee belongs to no department, and the `DEPT TOTAL HEADCOUNT` line cannot be written.
- a header without `rate`: there is no pay at all.
- header only, or empty input: there is no top earner.

order-merge
- `orders: []`: `best` is a sku over zero items.
- top level an array, JSON cut off, `price` written `NaN` (not JSON): not the object the ticket describes.
- an order element `null`; `customer` missing; `items` missing; `sku` missing: the order or item cannot be attributed.
- `qty` `null` or `true`: ITEMS, SPENT and `best` are a guess (skip it, or count it as 0 or 1: the reader cannot tell which was done).
- `price` missing, or `1e999` (Infinity once parsed): SPENT cannot be known.

temp-readings
- temp `12a`, `NaN`, `-Infinity`, `N/A`, a decimal comma `-7,0`, empty (a trailing space), or missing (3 fields): the station's min, max, mean and maybe the coldest reading cannot be known.
- a station with a space (`NEW YORK`) that makes 5 fields: the station, date and time cannot be told apart.
- date `2026-02-30`: the day does not exist. Date `04/01/2026`: April 1 or January 4, nothing says, and it does not order against the other dates.
- empty input: there is no coldest reading.

### Dropped while building (a normal answer could be defended)

- payroll: negative hours (a correction); hours or rate with 3 decimals (pay is still exact, then rounded); rate `$25.00` (strip the sign); hours `1e1` (a number); duplicate employee names (headcount counts lines); empty employee name on someone who is not the top earner (never printed); a blank line in the middle (skip it).
- order-merge: `qty` or `price` as a string `"2"` / `"1.25"` (coercion is defensible); `items: []` (an order with nothing in it: ORDERS 1, ITEMS 0, SPENT 0.00); duplicate order ids (the id is never used); negative qty (a return); fractional qty (sold by weight); a price with 3 decimals (qty x price can still be exact); qty 0.
- temp-readings: time `25:10` (the time is never used); a whole-number temp `7` or 2 decimals `7.25` (the value is still clear); temp `1e1`; a blank line in the middle (skip it); the same station, date and time twice (two readings); temps outside any plausible range.

## The references

`refs/` holds a Python, TypeScript and Vow solution per task. Each passes every happy check and is loud on every bad check (`error: ...`; Python and TypeScript on stderr with exit 1, Vow on stdout).

## Files

Same layout as `bench/turf/bad2`: `gen.mjs` (tickets and checks, writes `tasks.js`), `verify.mjs`, `run.mjs` (agent judge, visible checks only), `score.mjs`, `tally.mjs`, `PROMPT.md`. The scripts are copies of the `bad2/` ones that read this set's `tasks.js` and import `../bad/lib.mjs`; `run.mjs` logs attempts with `bench: 'bad3'`. Solutions go in `bench/scratch/bad3/`.

```sh
node bench/turf/bad3/gen.mjs
node bench/turf/bad3/verify.mjs
node bench/turf/bad3/score.mjs temp-readings bench/turf/bad3/refs/temp-readings.ts
node bench/turf/bad3/tally.mjs bench/scratch/bad3
```
