# Turf specs v2
Rewritten as product tickets: what to do, exact output and error messages; no implementation pitfalls named. Shared CSV rules are inlined where each CSV spec says ${CSV_RULES}.

## order-ledger

```text
Order ledger.

Arg 1 is the order list as JSON. If it is not valid JSON, or not a JSON array, print exactly `error: bad json` and nothing else.

Each array element is an order object with these fields (other fields are ignored):
- "id": the order number, written as plain digits, either as a JSON number (7) or as a JSON string ("7"). Leading zeros do not matter: 7, "7" and "007" are the same order.
- "date": the order date, a string "YYYY-MM-DD" that is a real calendar date.
- "price": the unit price in dollars, either a JSON number or a string of digits optionally followed by "." and 1 to 3 digits (like "12.50"). It must be at least 0, under 100000, and have at most 3 decimal places.
- "qty": the number of units, a JSON number that is a whole number from 1 to 1000.
- "discount": optional; missing or null means no discount. Otherwise a JSON number from 0 to 1 with at most 2 decimal places (0.15 means 15% off).
A required field that is missing or null is invalid. An element that is not an object, or that breaks any rule above, is a bad order.

Check every order in array order, including repeats of an earlier id. At the first bad order print exactly `error: bad order N` (N = its 1-based position in the array) and nothing else.

If several orders have the same id, only the first one counts; later ones are ignored.

Order total = price x qty x (1 - discount), rounded to the cent, halves rounded up. Daily totals and the grand total are sums of the rounded order totals.

Output (every amount with exactly 2 decimals):
- for each date that has at least one counted order, in ascending date order, a line `YYYY-MM-DD T` where T is that date's total;
- then `orders N` where N is the number of counted orders;
- then `total X` where X is the grand total.
An empty array prints `orders 0` then `total 0.00`.

Example: arg 1 = [{"id":1,"date":"2026-03-02","price":"12.50","qty":2},{"id":2,"date":"2026-03-01","price":5,"qty":3,"discount":0.1}] prints
2026-03-01 13.50
2026-03-02 25.00
orders 2
total 38.50
```

## stock-events

```text
Stock events.

Arg 1 is a list of inventory events as JSON. If it is not valid JSON, or not a JSON array, print exactly `error: bad json` and nothing else.

Events are applied in order to an initially empty inventory. Each event is a JSON object with a string field "type" and the fields listed for that type (other fields are ignored). A sku is a non-empty JSON string; a qty is a JSON number that is a whole number, at least 1.
- "add": "sku", "qty". If the sku does not exist yet, it is created at the end of the inventory with that qty and no price; otherwise its qty goes up by qty.
- "remove": "sku", "qty". The sku must exist and have at least that much stock; its qty goes down. A sku whose qty reaches 0 stays in the inventory.
- "rename": "sku", "to" (a non-empty JSON string). The sku must exist and the name "to" must not already exist. The sku takes the new name and keeps its place, qty and price; the old name no longer exists (adding it again later creates a new sku at the end).
- "price": "sku", "price". The "price" field is required: null clears the sku's price; otherwise it must be a JSON number from 0 to 1000000 with at most 2 decimal places, and becomes the sku's price. The sku must exist.

Errors. Check each event in order, in this priority; at the first event that fails print only the error line and nothing else (N = the event's 1-based position):
1. the event is not an object, or "type" is missing or not a string: `error: bad event N`
2. "type" is not one of add, remove, rename, price (exact spelling): `error: unknown event N`
3. a field the type needs is missing or invalid: `error: bad event N`
4. the event is well-formed but not allowed (sku does not exist, not enough stock, new name already exists): `error: rejected event N`

Output, two lines:
1. The final inventory as one line of compact JSON (no spaces): an object with one key per sku, in inventory order (the order the skus were created; a renamed sku keeps its place), each value {"qty":Q,"price":P}. P is the price as a JSON number in shortest plain form (12.50 -> 12.5, 100.0 -> 100), or null if the sku has no price. Sku names are written as JSON strings with only the characters JSON requires escaped; all other characters, including non-ASCII ones, appear as-is.
2. `avg price X.XX`: the average price of all skus that have a price (a price of 0 counts; qty does not matter), rounded half up to 2 decimals. If no sku has a price, print `avg price none`.

Example: arg 1 = [{"type":"add","sku":"a","qty":5},{"type":"add","sku":"b","qty":2},{"type":"price","sku":"a","price":2.5},{"type":"remove","sku":"a","qty":2},{"type":"rename","sku":"b","to":"c"},{"type":"price","sku":"c","price":1}] prints
{"a":{"qty":3,"price":2.5},"c":{"qty":2,"price":1}}
avg price 1.75
```

## leaderboard

```text
Leaderboard.

Args 1 and 2 are two score files as JSON. Each must be a JSON object mapping a player name to a score. If arg 1 is not valid JSON or not an object print exactly `error: bad json`; then the same check for arg 2. A file never lists the same name twice.

A score is a JSON number; a JSON string holding a plain decimal number (an optional "-", digits, and optionally "." followed by digits, like "7.5" or "-3"); or null, meaning "no score in this file". Anything else is a bad score. If either file has a bad score, print exactly `error: bad score NAME`, where NAME is the first of the bad entries' names in Unicode code point order, and nothing else.

Then arg 3 is N. It must be digits only, with value at least 1; otherwise print exactly `error: bad n`.

A player's score is the highest of their non-null scores across both files. A player with no non-null score in either file is not ranked.

Order the ranked players by score, highest first, ties by name in Unicode code point order. Ranks are competition ranks: 1 + the number of players with a strictly higher score (scores 10, 10, 9 get ranks 1, 1, 3). Print the first N players in this order (all of them if there are fewer; a tie at the cut-off is not extended), one line each: `RANK. NAME SCORE`. SCORE is the value in shortest plain decimal form: no exponent, no leading zeros in the whole-number part, no trailing zeros after the point, no point for whole values, and zero as 0 (never -0): 12.50 -> 12.5, "007" -> 7, 1e2 -> 100. If no player is ranked, print nothing.

Example: args '{"ann":10,"bob":"7.5","cy":null}' '{"bob":9,"dee":10.0}' '3' print
1. ann 10
1. dee 10
3. bob 9
```

## Shared CSV rules (inserted into each CSV spec)

```text
Input is a CSV file on standard input, as exported by a spreadsheet app. Its first row is the header row. The required columns can appear in any order, and other columns are ignored. Header names must match the required names exactly, apart from spaces or tabs around them; no name appears twice. Blank lines are ignored.

Spaces and tabs around a value are ignored ("trimmed") wherever a rule below uses the value.

Data rows are numbered 1, 2, 3, ... starting after the header; blank lines are not counted. A data row with a different number of fields from the header is invalid.

Messages, checked in this order:
- No rows at all: print exactly the "empty" message given below.
- A required column is missing from the header: print exactly `error: header`.
- A header but no data rows: print the "empty" message.
- Otherwise, if any data row is invalid, print exactly `error: row N`, where N is the number of the FIRST invalid row, and nothing else.
Every output line ends with a newline.
```

## expense-split

```text
Read a CSV of shared expenses from standard input and print what each person is owed or owes.

${CSV_RULES}

Required columns: payer, amount, participants. The "empty" message is `no expenses`.

Each data row is one expense:
- payer: who paid. Must not be blank.
- amount: what they paid, in dollars and cents, written like 12, 12.5 or 12.50 (digits 0-9, optionally a "." and one or two digits; no sign and no other characters). Must be greater than zero.
- participants: the people sharing the expense, separated by ";". Each name is trimmed; no name may be blank or listed twice.
A row that breaks any of these is invalid. Names are case-sensitive ("ana" and "Ana" are different people). The payer does not have to be a participant.

Split: each participant owes an equal share, rounded down to the cent; the cents left over go one each to that expense's participants whose names come first in Unicode code point order. The payer is credited the full amount.

Output: one line `NAME NET` for every person who appears anywhere as a payer or participant, sorted by name in Unicode code point order. NET is total paid minus total owed, with exactly two decimals, "+" in front when positive and "-" when negative; zero prints as `0.00`. Example lines: `Ana +12.34`, `Bo -5.00`, `Cy 0.00`.
```

## contact-dedupe

```text
Read a CSV contact list from standard input, merge rows that are the same person, and print one line per person.

${CSV_RULES}

Required columns: name, email, phone. The "empty" message is `no contacts`.

- name: trimmed, with each run of spaces/tabs inside it turned into one space. A row with a blank name is invalid.
- email: trimmed; may be blank.
- phone: only its digits 0-9 count (everything else is dropped); if it has none, the row has no phone.

Two rows that both have an email are the same person when the emails match regardless of letter case and of how accented letters were typed. Two rows that both have no email are the same person when their names match the same way (regardless of letter case and of how accented letters were typed). A row without an email never merges with a row that has one.

Each person keeps the name from their first row, their email, and their distinct phone numbers in order of first appearance.

Output one line per person: `NAME | EMAIL | PHONES`. EMAIL is the email in lower case (`-` if none); PHONES is the phone numbers joined with "," (`-` if none). Sort the lines by name regardless of letter case, in Unicode code point order, then by email (no email first).
```

## gradebook

```text
Read a CSV of assignment scores from standard input and print each student's average, the median score and the top three students.

${CSV_RULES}

Required columns: student, assignment, score. The "empty" message is `no data`.

- student: trimmed; must not be blank. Names are case-sensitive.
- assignment: ignored; every row counts on its own, even if an assignment repeats.
- score: trimmed. Blank, or "n/a", "nan" or "abs" in any letter case, means the score is missing: it is skipped (not counted as zero), but the student still appears. Otherwise it must be a number from 0 to 100 written like 85, 85.5 or 85.25 (digits 0-9, optionally a "." and one or two digits). Anything else makes the row invalid.

"Rounded" means rounded half up to one decimal, always printed with one decimal (85.0).

Output:
1. For every student, sorted by name in Unicode code point order: `NAME AVG`, where AVG is the rounded average of their scores, or `NAME -` if they have none.
2. `median M`: the median of all scores of all students (for an even count, the average of the two middle values), rounded; `median -` if there are no scores.
3. `top A, B, C`: the students with at least one score, ordered by their actual average (before rounding), highest first, ties by name in Unicode code point order; the first three (or fewer), separated by ", "; `top -` if there are none.
```
