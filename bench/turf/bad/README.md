# Bad-data bench

## The question

When a ticket does not say what to do with bad data, does the program an agent writes tell you something is wrong, or does it print a normal-looking answer?

A program that prints `total 18.00` when one row said `units = 12a` has given someone a wrong number they have no reason to doubt. A program that stops and says `error: line 3: bad units` has not. This bench counts how often agent-written programs do each, in Vow, TypeScript and Python.

## The rule

The tickets describe only the happy path: the input format, the output format and the exact arithmetic. They never mention errors, validation, malformed input or what to do with bad data, and the agent prompts (PROMPT.md) do not either. The only neutral nod is that each input is "exported from another system". Whatever an agent does with bad data is what its language and habits led it to do.

## Tasks

| task | input | turf | visible checks | hidden happy | hidden bad |
|---|---|---|---|---|---|
| sales-report | CSV on stdin: revenue per region, total, mean units per row | Python's (CSV) | 3 | 9 | 10 |
| user-stats | JSON array in arg 1: count and mean age per plan, oldest user, signups per month | TypeScript's (JSON) | 3 | 9 | 11 |
| latency | access log on stdin: count, mean and max per path, p95, 5xx count | both (text) | 3 | 9 | 10 |

Visible checks are happy-path only; they are what `run.mjs` shows the agent. Hidden checks are never shown.

- **Hidden happy checks** have an exact expected output: valid but awkward input such as ties, a single row, non-ASCII names, code-point sort order, a mean that lands exactly on a .x5, an id past 2^53, no final newline.
- **Hidden bad checks** (`bad: true`) have a `trap` label and no expected output, because there is none: the data makes every normal-looking answer wrong.

### Bad checks, and why no normal answer is right

sales-report
- units `12a`, units `-`, units empty: the row's revenue and the mean units cannot be known.
- unit_price empty, `N/A`, `NaN`: the row's revenue cannot be known (and `NaN` parses as a float in both Python and JavaScript).
- a row with 3 fields: no price.
- a decimal comma (`2,50`) that splits the row into 5 fields: the price is 2.50 or 2, nothing in the row says which.
- a header without `unit_price` (and rows to match): there is no price column at all.
- header only: `avg units` is a mean over zero rows, which does not exist. `avg units 0.0` is a made-up number.

user-stats
- age missing or null: that plan's mean age cannot be known, and neither can the oldest user.
- plan missing: the user belongs to no plan line.
- signup missing, or `2026-13-01`: the month count cannot be known.
- name or id missing on the user who is the oldest: the `oldest ID NAME` line cannot be written.
- an array element that is `null`, the top level being an object instead of an array, or JSON cut off mid-way: the input is not the list of users the ticket describes.
- `[]`: the ticket requires an `oldest` line and there is no oldest user.

latency
- response time `timeout`, `-`, `12.5.3ms`, `NaNms`, `ms`, or `-5ms`: that request's time, and so the mean, max and p95, cannot be known.
- status `abc`: whether it was a 5xx cannot be known.
- a line missing the path field, or a line cut off mid-path: the request cannot be attributed or timed.
- empty input: p95 of no requests does not exist.

Blank lines and other things a program could reasonably skip are not used as bad cases.

## Scoring

`score.mjs <task> <file>` runs a solution on every hidden check as a real process (Vow through `node cli.js`, TypeScript through `deno run --no-prompt -q`, Python through `python3`; 15 s timeout, 20 s for Vow; environment reduced to PATH, as in bench/judge.js).

- Happy check: passes when the program exits 0 and its stdout, trailing newlines trimmed, is exactly the expected output.
- Bad check: **LOUD** when the program exits nonzero (a crash counts: it did not hand over a normal answer) or when its stdout or stderr matches `/error|invalid|bad|malformed|missing|cannot|can't|failed|expected|unexpected/i`. The latency report's own `errors N` line (the word plus one token) is ignored for this test. Anything else is **SILENT**, including empty output with exit 0.

It prints `{task, file, happyPassed, happyTotal, loud, silent, silentTraps, happyFailed}`; `-v` adds what the program printed on each silent trap and each failed happy check.

`tally.mjs <dir>` scores every file in a directory named `<task>-<anything>.<py|ts|vow>` and prints a per-language table: solutions, solutions with every happy check right, happy checks passed, bad checks loud, silent, and solutions that were never silent.

The happy checks matter too: a program that rejects everything is loud on every bad check and fails every happy one.

## The references

`refs/` holds a Python, TypeScript and Vow solution for each task. Each one passes every happy check and is loud on every bad check, by printing `error: ...` (Python and TypeScript on stderr with exit 1; Vow on stdout, since a Vow program has no exit code of its own). That shows each task can be done right without giving up the happy path: a correct program can detect every bad case. The claim that no normal-looking output is correct for a bad case is the task author's judgement, argued case by case above.

## Files

- `gen.mjs`: the tickets and checks; runs `refs/<id>.py` to fill in the happy expects, checks that it is loud on every bad check, and writes `tasks.js`.
- `tasks.js`: generated; do not hand-edit.
- `verify.mjs`: runs all three refs on every check (`-v` shows mismatches).
- `run.mjs`: the agent's judge (visible checks only) and `--spec`.
- `score.mjs`, `tally.mjs`: hidden-suite scoring.
- `lib.mjs`: the shared process runner and the LOUD rule.
- `PROMPT.md`: the exact prompt per language.

```sh
node bench/turf/bad/gen.mjs
node bench/turf/bad/verify.mjs
node bench/turf/bad/score.mjs sales-report bench/turf/bad/refs/sales-report.ts
node bench/turf/bad/tally.mjs bench/scratch/bad
```
