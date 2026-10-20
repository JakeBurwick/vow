# Bad-data bench, held-out set 2

A fresh set of three tickets built exactly like `bench/turf/bad` (read its README for the question, the rule and the scoring), so the bench can be re-run on tasks nobody tuned against. Same rule: the tickets describe only the happy path and never mention errors, validation or malformed input; the only nod is that each input is "exported from another system". Same scoring: `../bad/lib.mjs` (imported, not copied) runs each solution as a real process and applies the same LOUD rule.

## Tasks

| task | input | turf | visible checks | hidden happy | hidden bad |
|---|---|---|---|---|---|
| inventory-restock | CSV on stdin: products at or below their reorder point, restock qty and cost, total, count | Python's (CSV) | 3 | 9 | 10 |
| grade-curve | JSON object in arg 1: percent and letter per student, class average | TypeScript's (JSON) | 3 | 9 | 11 |
| trip-log | odometer log on stdin: km per day from start/end pairs, total, longest day | both (text) | 3 | 9 | 11 |

Hidden happy checks are valid but awkward input (code-point order, boundaries, exact cents and tenths, a percent landing on .x5, ties, leading zeros, no final newline). Hidden bad checks have no expected output because none is right.

### Bad checks, and why no normal answer is right

inventory-restock
- on_hand `12a`, empty, `Infinity`; reorder_at `N/A`: whether the product needs restocking, and its qty, cannot be known.
- unit_cost empty, `NaN`, `3.5.0` on a product that needs restocking: its cost and the total cannot be known.
- a row with 4 fields; a decimal comma (`3,50`) that makes 6 fields: a value is missing, or the cost is 3.50 or 3, nothing says which.
- a header without `reorder_at`: there is no reorder point at all.

grade-curve
- `max` 0 or missing: every percent is a division by zero or by nothing.
- `students: []`: `class avg` is a mean over zero students.
- a student with `scores: []`: their mean does not exist.
- a score `null` or `true`: the mean is a guess (skip it, or count it as 0 or 1: the reader cannot tell which was done).
- name missing, scores missing, a student element `null`: the line cannot be written.
- top level an array, or JSON cut off: not the object the ticket describes.

trip-log
- an end with no start, or two starts in a row: the trip's distance cannot be known.
- end reading below the start: a negative distance.
- date `2026-04-31`: the day does not exist.
- odometer `12a34`, missing, `NaN`, `Infinity`, `12102,3`; event word `stop`: the trip cannot be read.
- empty input: there is no longest day.

### Dropped while building (a normal answer could be defended)

- inventory-restock: header only or empty input (`total 0.00` / `items 0` is right); negative on_hand (backorders); on_hand `3.5` (bulk stock); unit_cost `$4.50` (strip the sign); a bad unit_cost on a product that does not need restocking (the cost is never used); duplicate skus; empty name (never printed).
- grade-curve: score `"88"` or max `"100"` as strings (coercion is defensible); `scores: 85` as a scalar; a score above max (extra credit); a negative score (a penalty).
- trip-log: time `25:10` (the time is never used); a final start with no end (a trip in progress); a trip whose end is dated the next day (counting it to the start day is defensible); a 2-decimal or negative odometer reading; lines out of time order.

## The references

`refs/` holds a Python, TypeScript and Vow solution per task. Each passes every happy check and is loud on every bad check (`error: ...`; Python and TypeScript on stderr with exit 1, Vow on stdout).

## Files

Same layout as `bench/turf/bad`: `gen.mjs` (tickets and checks, writes `tasks.js`), `verify.mjs`, `run.mjs` (agent judge, visible checks only), `score.mjs`, `tally.mjs`, `PROMPT.md`. The scripts are copies of the `bad/` ones that read this set's `tasks.js` and import `../bad/lib.mjs`; `run.mjs` logs attempts with `bench: 'bad2'`.

```sh
node bench/turf/bad2/gen.mjs
node bench/turf/bad2/verify.mjs
node bench/turf/bad2/score.mjs trip-log bench/turf/bad2/refs/trip-log.ts
node bench/turf/bad2/tally.mjs bench/scratch/bad2
```
