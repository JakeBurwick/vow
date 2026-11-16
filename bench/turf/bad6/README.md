# Bad-data bench, held-out set 6

A sixth fresh set of three tickets built exactly like `bench/turf/bad` through `bad5` (read `bad/README.md` for the question, the rule and the scoring), in domains none of the earlier fifteen tasks touch. Same rule: the tickets describe only the happy path and never mention errors, validation, skipping or malformed input; the only nod is that each input is "exported from another system". Same scoring: `../bad/lib.mjs` (imported, not copied) runs each solution as a real process and applies the same LOUD rule.

What is new in this set: about half the traps are **logic** problems in otherwise well-formed data. Each rule they break is stated in the ticket as a plain fact about the data ("a run ... ends after it starts", "a doctor sees one patient at a time", "nothing happens to it after it is closed"), never as an instruction to check anything. The rest are **format** problems as in the earlier sets.

## Tasks

| task | input | turf | visible checks | hidden happy | hidden bad (format + logic) |
|---|---|---|---|---|---|
| factory-runs | CSV on stdin: runs, minutes and good parts per machine, scrap rate (2 decimals, half up), busiest machine | Python's (CSV) | 3 | 9 | 10 (7 + 3) |
| clinic-day | JSON object in arg 1: visits, wait and care minutes per doctor in list order, longest wait, last patient out | TypeScript's (JSON) | 3 | 9 | 10 (6 + 4) |
| helpdesk-log | ticket event log on stdin: tickets closed and minutes per agent, open tickets, slowest ticket | both (text) | 3 | 9 | 11 (5 + 6) |

Hidden happy checks are valid but awkward input: code-point order (`M1 M10 M2 Z m1 Ärm`), a scrap rate of 2.675% and 0.625% that round half up although float rounding gives 2.67 and 0.62, ties on the busiest machine, the longest wait and the slowest ticket broken by code point, back-to-back runs and visits (next one starting the minute the last one ends), the same hours on another day or machine, a fully scrapped run, a run from 00:00 to 23:59, counts past 10^8, runs and visits listed out of order, doctors with no visits kept in list order, JSON key order and whitespace, a closing time not from the last visit, reassignment credited to the last agent, agents with nothing closed, a ticket closed in the minute it opened, a leap day, a year boundary, a ticket open for ten weeks across the March DST change (UTC, so no shift), many lines at one time, non-ASCII names and no final newline. Hidden bad checks have no expected output because none is right.

### Bad checks, and why no normal answer is right

factory-runs
- format: parts made `3O0` (letter O for a zero), or scrapped empty: that run's good parts, its machine's line and the scrap rate cannot be known.
- format: end time `07:75`: the run's minutes cannot be known.
- format: a row with 5 fields (no scrapped count); a thousands separator (`1,204`) that makes 7 fields: 1204 parts or 1, nothing says.
- format: header only, or empty input: there is no busiest machine (and the scrap rate is 0 of 0).
- logic: a run that ends before it starts (the ticket says a run starts and ends on the same day and ends after it starts): minus 45 minutes is impossible, and nothing says which time is wrong.
- logic: more parts scrapped than made (the ticket says the scrapped parts are some of the parts made): minus 5 good parts is impossible.
- logic: two runs of one machine that overlap (the ticket says a machine does one run at a time): one line has the wrong machine or the wrong times, nothing says which, and the machine's minutes are either the sum or the union.

clinic-day
- format: `visits: []`: there is no longest wait and no last patient out.
- format: top level an array, or JSON cut off: not the object the ticket describes.
- format: `seen` missing, `"09:65"`, or `930` as a JSON number: that visit's wait and care time cannot be known (930 could be 09:30 or minute 930, 15:30).
- logic: a patient seen before arriving (the ticket says a patient is seen at or after arriving): a negative wait.
- logic: a patient who leaves before being seen (the ticket says they leave after they are seen): a negative care time.
- logic: a doctor who starts seeing a patient before the previous patient has left (the ticket says a doctor sees one patient at a time): one of the two visits has the wrong doctor or the wrong times, nothing says which.
- logic: a visit whose doctor is not in `doctors` (the ticket says the doctor is one of them): the visit belongs to no doctor line, and an extra line or a dropped visit both contradict the ticket.

helpdesk-log
- format: an impossible date (`2026-03-32T08:40`; JavaScript's `Date.UTC` rolls it to April 1 without complaint): the ticket's time to close cannot be known.
- format: `assigned` with no agent (3 fields): the ticket's agent, and so its credit, cannot be known.
- format: the last line cut off mid-way (`2026-03-03T08:40 T-1`): an event with no known ticket or kind.
- format: empty input, or a log where no ticket is closed: there is no slowest ticket.
- logic: events on a ticket that was never opened (the ticket says each ticket is opened before anything else happens to it): its time to close has no start, and whether it counts as open is unknown.
- logic: a ticket opened twice (the ticket says each ticket is opened once): the time to close runs from the first or the second open, nothing says which.
- logic: a ticket closed twice (closed at most once): the time to close ends at the first or the second close.
- logic: a ticket assigned after it was closed (nothing happens after it is closed): either the close was wrong (it is still open, assigned to ben) or the assignment was, and `open` differs between the two.
- logic: a ticket closed without being assigned (it is assigned before it is closed): it is credited to no agent.
- logic: a line whose time is earlier than the line before it (lines are in time order), here a close at 09:10 for a ticket opened at 09:15: a negative time to close.

### Dropped while building (a normal answer could be defended)

- factory-runs: an impossible day such as `2026-02-30` (the day only groups runs for the overlap rule and never reaches the output); a run whose end equals its start (0 minutes is arithmetic that works, and a run that was aborted at once is plausible); every run making 0 parts while runs exist (`scrap 0.00%` for 0 of 0 is a common convention, and the busiest line still exists); an exact duplicate line (an export duplicate can be collapsed); a negative count `-40` (left out to keep the count down; it is fair); counts with leading zeros (`0050` is 50); lines out of time order (used as a happy check); a machine name with spaces (used as a happy check); a blank line or CRLF endings (skip or strip).
- clinic-day: a visit with zero care time, `left` equal to `seen` (arithmetic works; a no-show seen for a moment is plausible); a time `"9:05"` without the leading zero (its value is clear); a patient arriving before some notional opening time (not in the ticket, and real patients do arrive early); the same patient name on two visits (a patient can come back, and the longest-wait line is about a visit); a doctor listed twice in `doctors` (deduping is defensible); `doctor` null (it is the same trap as the unknown doctor, kept to one); extra keys (ignore them).
- helpdesk-log: an unknown event such as `reopened` (skipping unknown event kinds is a common convention); an agent name with a space as the last field (`assigned Ana Lima`): joining the rest of the line gives a defensible name, so it is not a trap; a time written `09:5` (ambiguous between 09:05 and 09:50, but a lenient parse is arguable, and the impossible date covers the time field); an assigned line out of time order that only changes who gets the credit (kept to one time-order trap); assigning a ticket to the agent it already has (harmless); a blank line in the middle (skip it).

## The references

`refs/` holds a Python, TypeScript and Vow solution per task. Each passes every happy check and is loud on every bad check for the reason the trap names (`error: ...`; Python and TypeScript on stderr with exit 1, Vow on stdout). The refs also reject a few dropped cases that no check tests (an impossible day, a zero-minute run or visit, no parts made at all, a doctor listed twice, an unknown event).

Built from fully lenient Python solutions (csv.DictReader, `except: 0`, skipping lines that do not parse) as a sanity check, kept outside the repo: they pass the happy checks and are silent on 10 of 10, 10 of 10 and 11 of 11 bad checks, so the traps catch what a lenient program does. (The lenient help-desk script also failed the ten-week happy check, because `datetime.timestamp()` reads the time as local and picked up the March DST shift; the ticket says UTC.)

## Files

Same layout as `bench/turf/bad5`: `gen.mjs` (tickets and checks, writes `tasks.js`), `verify.mjs`, `run.mjs` (agent judge, visible checks only), `score.mjs`, `tally.mjs`, `PROMPT.md`. The scripts are copies of the `bad5/` ones that read this set's `tasks.js` and import `../bad/lib.mjs`; `run.mjs` logs attempts with `bench: 'bad6'`. Solutions go in `bench/scratch/bad6/`.

```sh
node bench/turf/bad6/gen.mjs
node bench/turf/bad6/verify.mjs
node bench/turf/bad6/score.mjs helpdesk-log bench/turf/bad6/refs/helpdesk-log.ts
node bench/turf/bad6/tally.mjs bench/scratch/bad6
```
