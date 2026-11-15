# Bad-data bench, held-out set 4

A fourth fresh set of three tickets built exactly like `bench/turf/bad`, `bad2` and `bad3` (read `bad/README.md` for the question, the rule and the scoring), in domains none of the earlier nine tasks touch. Same rule: the tickets describe only the happy path and never mention errors, validation, skipping or malformed input; the only nod is that each input is "exported from another system". Same scoring: `../bad/lib.mjs` (imported, not copied) runs each solution as a real process and applies the same LOUD rule.

## Tasks

| task | input | turf | visible checks | hidden happy | hidden bad |
|---|---|---|---|---|---|
| parcel-postage | CSV on stdin: parcels, total weight and postage per destination (4.00 + 1.50 per started kg), grand total, heaviest parcel | Python's (CSV) | 3 | 9 | 11 |
| playlist-stats | JSON object in arg 1: tracks and H:MM:SS length per playlist, artist with the most tracks, longest track | TypeScript's (JSON) | 3 | 9 | 12 |
| parking-log | gate log on stdin: stays, minutes and fee (2.50 per started hour) per plate, total, longest stay | both (text) | 3 | 9 | 11 |

Hidden happy checks are valid but awkward input (code-point order, started-kg and started-hour boundaries at exactly 1 kg / 60 minutes and one unit past, a 0 kg parcel and a 0-minute stay, grams summed exactly, ties, an empty playlist, a total past 100 hours, playlists kept in input order, the same track on several playlists, stays across midnight, year end and a leap day, a multi-day stay, events in the same minute, no final newline). Hidden bad checks have no expected output because none is right.

### Bad checks, and why no normal answer is right

parcel-postage
- weight `2.5kg`, empty, `NaN`, `Infinity`: that parcel's postage, the destination's weight and postage, the total and maybe the heaviest parcel cannot be known.
- weight `-1.2`: no parcel weighs less than nothing, and "started kilograms" of a negative weight is meaningless.
- a row with 2 fields: no weight. A decimal comma (`2,5`) that makes 4 fields: 2 kg or 2.5 kg, nothing says.
- dest empty: the parcel belongs to no destination line.
- a header without `weight`: there is no weight at all.
- header only, or empty input: there is no heaviest parcel.

playlist-stats
- `playlists: []`, or playlists that all have `tracks: []`: the `artist` and `longest` lines are about zero tracks.
- top level an array, JSON cut off: not the object the ticket describes.
- playlist `name` missing: its line cannot be written. `tracks` missing: its TRACKS and LENGTH cannot be known.
- a track element `null`: a track that cannot be counted, timed or attributed.
- `artist` missing: the artist count (and maybe the top artist) cannot be known.
- `title` missing on the longest track: the `longest` line cannot be written.
- `seconds` `null`, `-30`, or `1e999` (Infinity once parsed): the playlist's LENGTH, and maybe the longest track, cannot be known.

parking-log
- time `09:75`: the minute does not exist. Date `2026-02-30`: the day does not exist. Date `03/02/2026`: March 2 or February 3, and it does not order against the other dates.
- the event missing (3 fields), or the last line cut off mid-way (`2026-03-02 00:1`): an event that cannot be read, and a stay with no known start or end.
- an OUT with no IN before it (the ticket says the log starts with the garage empty): the stay has no start.
- IN twice for one car without an OUT between: which IN starts the stay, nothing says.
- an OUT whose time is earlier than its IN: a stay of negative minutes.
- a plate with a space (`B 77`), making 5 fields: the event and plate cannot be told apart. A plate empty (trailing space): the stay belongs to no plate.
- empty input: there is no longest stay.

### Dropped while building (a normal answer could be defended)

- parcel-postage: a weight with 4 decimals `1.0005` (the started kilograms are still clear); `1e1` (a number); ` 2.5` with a space (strip it); duplicate tracking ids (two parcels, both counted); an empty tracking id on a parcel that is not the heaviest (never printed); a destination with a space or lowercase (it is still a key; it only looks odd); a blank line in the middle (skip it).
- playlist-stats: `seconds` as a string `"225"` (coercion is defensible) or `"3:45"` (parsing m:ss is defensible); fractional seconds `2.5` (rounding is defensible); `seconds` `true` (left out only to keep the count at 12; it is a fair trap); `NaN` written in the JSON (also fair, also left out for count); duplicate playlist names (the ticket says one line per playlist in input order, so two lines is a fine answer); an empty playlist name (printed as given); `title` missing on a track that is not the longest (never printed); extra keys such as `album` (ignore them); a 0-second track (used as a happy check).
- parking-log: a car that drives in and never drives out before the log ends (the ticket does not say the log ends with the garage empty, and leaving an unfinished stay out is a common, defensible convention); time `24:00` (some systems use it for end of day); time `8:15` without the zero, or with seconds `08:15:30`; lowercase `in`/`out`; an unknown event word such as `PARK` (could be another kind of gate event, and ignoring it is defensible); lines out of time order between different cars while each car's own IN and OUT still pair up (the answer is still well defined); in and out in the same minute (used as a happy check); a blank line in the middle (skip it).

## The references

`refs/` holds a Python, TypeScript and Vow solution per task. Each passes every happy check and is loud on every bad check (`error: ...`; Python and TypeScript on stderr with exit 1, Vow on stdout). The refs also reject a few dropped cases (a car still inside at the end, an unknown event, a blank line), which no check tests.

## Files

Same layout as `bench/turf/bad3`: `gen.mjs` (tickets and checks, writes `tasks.js`), `verify.mjs`, `run.mjs` (agent judge, visible checks only), `score.mjs`, `tally.mjs`, `PROMPT.md`. The scripts are copies of the `bad3/` ones that read this set's `tasks.js` and import `../bad/lib.mjs`; `run.mjs` logs attempts with `bench: 'bad4'`. Solutions go in `bench/scratch/bad4/`.

```sh
node bench/turf/bad4/gen.mjs
node bench/turf/bad4/verify.mjs
node bench/turf/bad4/score.mjs parking-log bench/turf/bad4/refs/parking-log.ts
node bench/turf/bad4/tally.mjs bench/scratch/bad4
```
