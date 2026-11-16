# Bad-data bench, held-out set 5

A fifth fresh set of three tickets built exactly like `bench/turf/bad`, `bad2`, `bad3` and `bad4` (read `bad/README.md` for the question, the rule and the scoring), in domains none of the earlier twelve tasks touch. Same rule: the tickets describe only the happy path and never mention errors, validation, skipping or malformed input; the only nod is that each input is "exported from another system". Same scoring: `../bad/lib.mjs` (imported, not copied) runs each solution as a real process and applies the same LOUD rule.

## Tasks

| task | input | turf | visible checks | hidden happy | hidden bad |
|---|---|---|---|---|---|
| water-bills | CSV on stdin: accounts, usage (current minus previous meter reading) and billed amount per zone (3.50 + 1.20/m³ up to 10 m³ + 2.05/m³ above), grand total, highest usage | Python's (CSV) | 3 | 9 | 12 |
| auction-results | JSON object in arg 1: bids and sold/unsold per lot against its reserve, revenue, bidder with the most bids | TypeScript's (JSON) | 3 | 9 | 12 |
| league-table | match results on stdin: P W D L GF GA PTS per team, leader (points, then goal difference, then code point), number of matchdays | both (text) | 3 | 9 | 11 |

Hidden happy checks are valid but awkward input (code-point order, tier boundaries at 9, 10 and 11 m³, a usage of 0, bills such as 2.05 × 3 that are not exact in binary, readings with leading zeros and nine digits, a bid exactly at the reserve and one cent below it, a 0.00 bid on a 0 reserve, prices whose sum is not exact in binary, a price past a million, a bidder raising their own bid, lots kept in input order, every lot unsold while bids exist, ties broken by goal difference and then by code point, double-digit scores, matchdays with gaps, home and away legs, non-ASCII names, no final newline). Hidden bad checks have no expected output because none is right.

### Bad checks, and why no normal answer is right

water-bills
- a reading `00087O` (letter O for a zero), empty, `NaN` or `Infinity`: that account's usage and bill, its zone's line, the total and maybe the highest usage cannot be known.
- current reading below the previous one: a usage of minus 15 m³ is impossible, and the tiers of a negative usage mean nothing. It could be a meter that rolled over or was replaced, but the ticket gives no meter size, so the real usage cannot be worked out.
- a row with 3 fields: no current reading. A thousands separator (`1,204`) that makes 5 fields: 1204 or 1, nothing says.
- zone empty: the account belongs to no zone line.
- the same account on two lines with the same previous and different current readings (the ticket says there is one line per account): which reading is right, nothing says.
- a header without `current`: there is no usage at all.
- header only, or empty input: there is no highest usage.

auction-results
- `lots: []`, or lots that all have `bids: []`: the `busiest` line is about zero bids.
- top level an array, JSON cut off: not the object the ticket describes.
- lot id `lot` missing: its line cannot be written. `bids` missing: its BIDS count and outcome cannot be known.
- a bid element `null`: a bid that cannot be counted, priced or attributed.
- `bidder` missing on the winning bid: the `sold BIDDER` line cannot be written (and the busiest count is off).
- `amount` missing on the winning bid, `null`, or `true`: whether the lot sold and for how much cannot be known (JavaScript compares `null` and `true` against the reserve as 0 and 1 without complaint).
- a bid lower than the bid before it (the ticket says each bid is higher than the one before): the winner is the highest bid or the last one, nothing says, and they give different answers.

league-table
- goals `3-l` (letter l for a one), `2.5-1`, or `21` with no hyphen: the result, the goals and the points cannot be known.
- the away team missing (3 fields), or the last line cut off mid-way (`2 Twe`, 2 fields): a match with no known teams or score.
- a team name with a space (`Go Ahead`, 5 fields), or a score written `2 - 1` (6 fields): the teams and the score cannot be told apart.
- matchday `2b`: the number of matchdays cannot be known (2, or another one).
- a team playing itself: there is no opponent, and the same match would be both a win and a loss.
- a team playing twice on one matchday (the ticket says a team plays at most once per matchday): one of the two lines is wrong, nothing says which.
- empty input: there is no leader.

### Dropped while building (a normal answer could be defended)

- water-bills: a reading with a decimal `12.5` (the arithmetic still works); a negative reading such as `-5` with a current reading above it (the difference is still well defined); a reading with surrounding spaces ` 870` (strip it); the same account twice where the second line carries on from the first (previous = the first line's current), which reads as two billing periods; an account appearing twice with identical lines (an exact duplicate export could be collapsed); a zone in lowercase or with a space (it is still a key); an empty account id on an account that is not the highest (never printed); a reading past 2^53 (only a precision question, not bad data); a blank line in the middle (skip it); CRLF line endings (strip them).
- auction-results: `reserve` missing or `null` (an auction lot with no reserve is a common convention, and selling to the highest bid is defensible); `reserve` negative (it only means every bid meets it); `amount` as a string `"120.00"` (coercion is defensible); an amount with 3 decimals `120.005` (rounding is defensible); a negative amount (left out to keep the count at 12; it is a fair trap); `1e999` or `NaN` in the JSON (fair, left out for count); two bids of the same amount in a row (close to the lower-bid trap; left out to keep each trap distinct); the same bidder twice in a row (raising your own bid is legal, used as a happy check); duplicate lot ids (one line per lot in input order is a fine answer); extra keys (ignore them); an empty bidder name on a non-winning bid.
- league-table: a postponed match written `P-P` (leaving out a match that was not played is defensible); a score with a colon `2:1` or an en dash `2–1` (reading it as 2-1 is defensible); leading zeros `02-1`; fullwidth digits (Python's `int` reads them, and the value is clear); lines out of matchday order (the answer is still well defined); matchday numbers with gaps (used as a happy check); matchday `0` (still a matchday); the same pairing on two matchdays (home and away legs, used as a happy check); lowercase and capitalised versions of one name (`ajax` and `Ajax` are different keys; used as a happy check); a blank line in the middle (skip it).

## The references

`refs/` holds a Python, TypeScript and Vow solution per task. Each passes every happy check and is loud on every bad check (`error: ...`; Python and TypeScript on stderr with exit 1, Vow on stdout). The refs also reject a few dropped cases that no check tests (a negative amount or one with more than 2 decimals, a missing reserve, a blank line).

Built from fully lenient solutions (csv.DictReader with defaults, `?? 0`, skipping lines that do not parse) as a sanity check: they pass every happy check and are silent on 9 of 12, 11 of 12 and 11 of 11 bad checks, so the traps catch what a lenient program does.

## Files

Same layout as `bench/turf/bad4`: `gen.mjs` (tickets and checks, writes `tasks.js`), `verify.mjs`, `run.mjs` (agent judge, visible checks only), `score.mjs`, `tally.mjs`, `PROMPT.md`. The scripts are copies of the `bad4/` ones that read this set's `tasks.js` and import `../bad/lib.mjs`; `run.mjs` logs attempts with `bench: 'bad5'`. Solutions go in `bench/scratch/bad5/`.

```sh
node bench/turf/bad5/gen.mjs
node bench/turf/bad5/verify.mjs
node bench/turf/bad5/score.mjs league-table bench/turf/bad5/refs/league-table.ts
node bench/turf/bad5/tally.mjs bench/scratch/bad5
```
