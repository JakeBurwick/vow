// Source for bench/turf/csv.js: specs + check inputs. Expected outputs are
// filled in from the Python refs by gen-csv.mjs (node bench/turf/gen-csv.mjs).

const L = (...lines) => lines.join('\n') + '\n';          // LF, trailing newline
const C = (...lines) => lines.join('\r\n') + '\r\n';      // CRLF, trailing newline
const BOM = '﻿';

const CSV_RULES = `Input is a CSV file on standard input, as exported by a spreadsheet app. Its first row is the header row. The required columns can appear in any order, and other columns are ignored. Header names must match the required names exactly, apart from spaces or tabs around them; no name appears twice. Blank lines are ignored.

Spaces and tabs around a value are ignored ("trimmed") wherever a rule below uses the value.

Data rows are numbered 1, 2, 3, ... starting after the header; blank lines are not counted. A data row with a different number of fields from the header is invalid.

Messages, checked in this order:
- No rows at all: print exactly the "empty" message given below.
- A required column is missing from the header: print exactly \`error: header\`.
- A header but no data rows: print the "empty" message.
- Otherwise, if any data row is invalid, print exactly \`error: row N\`, where N is the number of the FIRST invalid row, and nothing else.
Every output line ends with a newline.`;

export const SRC = [
  {
    id: 'expense-split',
    name: 'Split shared expenses from a CSV',
    arena: 'csv',
    spec: `Read a CSV of shared expenses from standard input and print what each person is owed or owes.

${CSV_RULES}

Required columns: payer, amount, participants. The "empty" message is \`no expenses\`.

Each data row is one expense:
- payer: who paid. Must not be blank.
- amount: what they paid, in dollars and cents, written like 12, 12.5 or 12.50 (digits 0-9, optionally a "." and one or two digits; no sign and no other characters). Must be greater than zero.
- participants: the people sharing the expense, separated by ";". Each name is trimmed; no name may be blank or listed twice.
A row that breaks any of these is invalid. Names are case-sensitive ("ana" and "Ana" are different people). The payer does not have to be a participant.

Split: each participant owes an equal share, rounded down to the cent; the cents left over go one each to that expense's participants whose names come first in Unicode code point order. The payer is credited the full amount.

Output: one line \`NAME NET\` for every person who appears anywhere as a payer or participant, sorted by name in Unicode code point order. NET is total paid minus total owed, with exactly two decimals, "+" in front when positive and "-" when negative; zero prints as \`0.00\`. Example lines: \`Ana +12.34\`, \`Bo -5.00\`, \`Cy 0.00\`.`,
    checks: [
      { stdin: L('payer,amount,participants', 'Ana,30.00,Ana;Bo;Cy'), note: 'happy path' },
      { stdin: L('payer,amount,participants', 'Ana,10.00,Ana;Bo;Cy', 'Bo,4.00,Ana;Bo'), note: 'leftover cent' },
      { stdin: L('payer,amount,participants', 'Ana,abc,Ana;Bo') },
      { stdin: L('payer,cost,participants', 'Ana,1.00,Bo') },
      { stdin: L('payer,amount,participants') },
      { stdin: '' },
    ],
    hidden: [
      { trap: 'BOM before header', stdin: BOM + L('payer,amount,participants', 'Ana,9.00,Ana;Bo;Cy') },
      { trap: 'CRLF line endings', stdin: C('payer,amount,participants', 'Ana,9.00,Bo;Cy', 'Cy,3.00,Ana') },
      { trap: 'BOM + CRLF, no final newline', stdin: BOM + 'payer,amount,participants\r\nBo,5.00,Ana;Bo' },
      { trap: 'column order + extra column', stdin: L('date,participants,note,amount,payer', '2026-01-02,Ana;Bo,lunch,20.00,Bo', '2026-01-03,Bo,taxi,7.50,Ana') },
      { trap: 'padded header names', stdin: L(' payer , amount ,participants\t', 'Ana,2.00,Bo') },
      { trap: 'quoted note with comma', stdin: L('payer,amount,participants,note', 'Ana,6.00,Ana;Bo,"pizza, drinks"') },
      { trap: 'quoted note with newline; row count', stdin: L('payer,amount,participants,note', 'Ana,6.00,Ana;Bo,"line one', 'line two"', 'Bo,x,Ana,ok') },
      { trap: 'quoted CRLF inside note', stdin: C('note,payer,amount,participants', '"a\r\nb, ""c""",Cy,3.00,Ana;Cy', 'z,Ana,1.00,Cy') },
      { trap: 'quoted participants with spaces', stdin: L('payer,amount,participants', 'Ana,9.00," Ana ; Bo ;Cy "') },
      { trap: 'amount padded with spaces', stdin: L('payer,amount,participants', 'Ana,  12.50 ,Bo', 'Bo,"\t1.5 ",Ana') },
      { trap: 'float cents 0.29', stdin: L('payer,amount,participants', 'Ana,0.29,Bo') },
      { trap: 'float cents 10.01 / 3', stdin: L('payer,amount,participants', 'Ana,10.01,Ana;Bo;Cy') },
      { trap: 'float cents 4.35 + 1.15', stdin: L('payer,amount,participants', 'Ana,4.35,Bo', 'Ana,1.15,Bo', 'Bo,1.01,Ana') },
      { trap: 'float drift gives -0.00/+0.00', stdin: L('payer,amount,participants', 'Ana,0.10,Bo', 'Ana,0.20,Bo', 'Bo,0.30,Ana') },
      { trap: 'leftover cents by code point not locale', stdin: L('payer,amount,participants', 'Dee,0.05,bo;Cy;Ana') },
      { trap: 'leftover cents follow record order of sorted names', stdin: L('payer,amount,participants', 'Ana,1.00,Zed;ada;Bob') },
      { trap: 'output sort by code point', stdin: L('payer,amount,participants', 'ada,3.00,Zoe;ada;Émile', 'Zoe,1.00,bob') },
      { trap: 'astral vs BMP sort (UTF-16 order differs)', stdin: L('payer,amount,participants', '\u{FF5A}oe,2.00,\u{1F600}x;\u{FF5A}oe', 'Ann,1.00,\u{1F600}x') },
      { trap: 'payer named 0', stdin: L('payer,amount,participants', '0,5.00,Ana') },
      { trap: 'one decimal amount', stdin: L('payer,amount,participants', 'Ana,0.5,Bo;Cy;Dee') },
      { trap: 'duplicate participant', stdin: L('payer,amount,participants', 'Ana,2.00,Bo', 'Ana,3.00,Bo;Ana;Bo') },
      { trap: 'empty participant piece', stdin: L('payer,amount,participants', 'Ana,3.00,Bo;;Cy') },
      { trap: 'trailing semicolon', stdin: L('payer,amount,participants', 'Ana,3.00,Bo;Cy;') },
      { trap: 'amount 1e2', stdin: L('payer,amount,participants', 'Ana,1.00,Bo', 'Ana,1e2,Bo') },
      { trap: 'amount nan', stdin: L('payer,amount,participants', 'Ana,nan,Bo') },
      { trap: 'amount inf', stdin: L('payer,amount,participants', 'Ana,1.00,Bo', 'Bo,2.00,Ana', 'Cy,inf,Ana') },
      { trap: 'negative amount', stdin: L('payer,amount,participants', 'Ana,-5.00,Bo') },
      { trap: 'three decimals', stdin: L('payer,amount,participants', 'Ana,5.005,Bo') },
      { trap: 'zero amount', stdin: L('payer,amount,participants', 'Ana,1.00,Bo', 'Ana,0.00,Bo') },
      { trap: 'superscript digit', stdin: L('payer,amount,participants', 'Ana,5²,Bo') },
      { trap: 'fullwidth / Arabic-Indic digits', stdin: L('payer,amount,participants', 'Ana,٣.50,Bo') },
      { trap: 'leading dot / trailing dot', stdin: L('payer,amount,participants', 'Ana,.50,Bo', 'Ana,5.,Bo') },
      { trap: 'thousands comma in quoted amount', stdin: L('payer,amount,participants', 'Ana,"1,000.00",Bo') },
      { trap: 'ragged row (too few)', stdin: L('payer,amount,participants', 'Ana,1.00,Bo', 'Ana,1.00') },
      { trap: 'ragged row (too many)', stdin: L('payer,amount,participants', 'Ana,1.00,Bo,extra') },
      { trap: 'blank payer', stdin: L('payer,amount,participants', '  ,1.00,Bo') },
      { trap: 'blank lines skipped in row count', stdin: 'payer,amount,participants\n\nAna,1.00,Bo\n\n\nBo,x,Ana\n' },
      { trap: 'blank lines only', stdin: '\n\n\r\n' },
      { trap: 'BOM header-only CRLF', stdin: BOM + 'payer,amount,participants\r\n' },
      { trap: 'header error beats bad rows', stdin: L('payer,amt,participants', 'Ana,x,Bo') },
    ],
  },
  {
    id: 'contact-dedupe',
    name: 'Deduplicate a contact list CSV',
    arena: 'csv',
    spec: `Read a CSV contact list from standard input, merge rows that are the same person, and print one line per person.

${CSV_RULES}

Required columns: name, email, phone. The "empty" message is \`no contacts\`.

- name: trimmed, with each run of spaces/tabs inside it turned into one space. A row with a blank name is invalid.
- email: trimmed; may be blank.
- phone: only its digits 0-9 count (everything else is dropped); if it has none, the row has no phone.

Two rows that both have an email are the same person when the emails match regardless of letter case and of how accented letters were typed. Two rows that both have no email are the same person when their names match the same way (regardless of letter case and of how accented letters were typed). A row without an email never merges with a row that has one.

Each person keeps the name from their first row, their email, and their distinct phone numbers in order of first appearance.

Output one line per person: \`NAME | EMAIL | PHONES\`. EMAIL is the email in lower case (\`-\` if none); PHONES is the phone numbers joined with "," (\`-\` if none). Sort the lines by name regardless of letter case, in Unicode code point order, then by email (no email first).`,
    checks: [
      { stdin: L('name,email,phone', 'Ana Lima,ana@x.com,555-1234', 'ANA LIMA,Ana@X.com,(555) 9876', 'Bo,,555 0000') },
      { stdin: L('name,email,phone', 'Cy,cy@x.com,', 'Bo,bo@x.com,1', 'Bo,,2', 'bo,,3') },
      { stdin: L('name,email,phone', 'Ana,a@x.com,1', ',b@x.com,2') },
      { stdin: L('name,mail,phone', 'Ana,a@x.com,1') },
      { stdin: L('name,email,phone') },
      { stdin: '' },
    ],
    hidden: [
      { trap: 'BOM before header', stdin: BOM + L('name,email,phone', 'Ana,a@x.com,1') },
      { trap: 'CRLF line endings', stdin: C('name,email,phone', 'Ana,a@x.com,1', 'Ana B,A@x.com,2') },
      { trap: 'BOM + CRLF, no final newline', stdin: BOM + 'name,email,phone\r\nBo,b@x.com,7\r\nBo,B@X.COM,8' },
      { trap: 'column order + extra column', stdin: L('phone,id,email,name', '111,1,z@x.com,Zoe', '222,2,a@x.com,Al') },
      { trap: 'email case-insensitive', stdin: L('name,email,phone', 'Ana,Ana@Example.COM,1', 'Ana L,ana@example.com,2') },
      { trap: 'casefold name key (Maße/MASSE)', stdin: L('name,email,phone', 'Maße,,1', 'MASSE,,2') },
      { trap: 'NFD name merges with NFC (empty email), NFC first', stdin: L('name,email,phone', 'José,,2', 'José,,1') },
      { trap: 'NFD email merges with NFC', stdin: L('name,email,phone', 'Jo,josé@x.com,1', 'Jo,josé@x.com,2') },
      { trap: 'inner whitespace collapsed', stdin: L('name,email,phone', '  Ana \t  Lima ,,1', 'ana lima,,2') },
      { trap: 'first-seen display name kept', stdin: L('name,email,phone', 'ana lima,a@x.com,', 'Ana Lima,a@x.com,') },
      { trap: 'empty-email record never merges with email record', stdin: L('name,email,phone', 'Ana,a@x.com,1', 'Ana,,2', 'ana,,3') },
      { trap: 'whitespace-only email is empty', stdin: L('name,email,phone', 'Bo,  ,1', 'Bo,,2') },
      { trap: 'email trimmed', stdin: L('name,email,phone', 'Bo, bo@x.com ,1', 'Bo,bo@x.com\t,2') },
      { trap: 'phone digits only', stdin: L('name,email,phone', 'Ana,a@x.com,+1 (555) 123-4567') },
      { trap: 'same phone different formatting dedup', stdin: L('name,email,phone', 'Ana,a@x.com,555-1234', 'Ana,a@x.com,(555) 1234', 'Ana,a@x.com,5551234') },
      { trap: 'superscript digit not a digit', stdin: L('name,email,phone', 'Ana,a@x.com,555-1234 ext²') },
      { trap: 'fullwidth digits not digits', stdin: L('name,email,phone', 'Ana,a@x.com,５５５', 'Ana,a@x.com,12') },
      { trap: 'phone 0 is a phone', stdin: L('name,email,phone', 'Ana,a@x.com,0', 'Ana,a@x.com,') },
      { trap: 'phones in first-seen order', stdin: L('name,email,phone', 'Ana,a@x.com,9', 'Ana,a@x.com,1', 'Ana,a@x.com,9', 'Ana,a@x.com,5') },
      { trap: 'sort by folded key not raw name', stdin: L('name,email,phone', 'bob,b@x.com,1', 'Zed,z@x.com,2', 'Alice,a@x.com,3') },
      { trap: 'same name sorted by email', stdin: L('name,email,phone', 'Ana,z@x.com,1', 'Ana,b@x.com,2', 'ana,,3') },
      { trap: 'code point key order (é after z)', stdin: L('name,email,phone', 'Émile,e@x.com,1', 'Zoe,z@x.com,2', 'eve,v@x.com,3') },
      { trap: 'quoted name with comma', stdin: L('name,email,phone', '"Lee, Ann",lee@x.com,1', '"LEE,  ANN",LEE@x.com,2') },
      { trap: 'doubled quotes in name', stdin: L('name,email,phone', '"Ann ""Nan"" Lee",n@x.com,1') },
      { trap: 'multiline quoted extra column', stdin: L('name,notes,email,phone', 'Ana,"met at\nconf, 2025",a@x.com,1', 'Bo,x,a@x.com,2') },
      { trap: 'ragged row', stdin: L('name,email,phone', 'Ana,a@x.com,1', 'Bo,b@x.com') },
      { trap: 'whitespace-only name', stdin: L('name,email,phone', 'Ana,a@x.com,1', ' \t ,b@x.com,2') },
      { trap: 'blank lines skipped in row count', stdin: 'name,email,phone\n\nAna,a@x.com,1\n\n,b@x.com,2\n' },
      { trap: 'blank lines only', stdin: '\n\n' },
      { trap: 'BOM header-only CRLF', stdin: BOM + 'name,email,phone\r\n' },
      { trap: 'padded header names', stdin: L(' name ,email\t, phone', 'Ana,a@x.com,1') },
      { trap: 'header error beats bad rows', stdin: L('Name,email,phone', ',a@x.com,1') },
      { trap: 'name 0 is a name', stdin: L('name,email,phone', '0,,1', '0,,2') },
    ],
  },
  {
    id: 'gradebook',
    name: 'Gradebook summary from a CSV',
    arena: 'csv',
    spec: `Read a CSV of assignment scores from standard input and print each student's average, the median score and the top three students.

${CSV_RULES}

Required columns: student, assignment, score. The "empty" message is \`no data\`.

- student: trimmed; must not be blank. Names are case-sensitive.
- assignment: ignored; every row counts on its own, even if an assignment repeats.
- score: trimmed. Blank, or "n/a", "nan" or "abs" in any letter case, means the score is missing: it is skipped (not counted as zero), but the student still appears. Otherwise it must be a number from 0 to 100 written like 85, 85.5 or 85.25 (digits 0-9, optionally a "." and one or two digits). Anything else makes the row invalid.

"Rounded" means rounded half up to one decimal, always printed with one decimal (85.0).

Output:
1. For every student, sorted by name in Unicode code point order: \`NAME AVG\`, where AVG is the rounded average of their scores, or \`NAME -\` if they have none.
2. \`median M\`: the median of all scores of all students (for an even count, the average of the two middle values), rounded; \`median -\` if there are no scores.
3. \`top A, B, C\`: the students with at least one score, ordered by their actual average (before rounding), highest first, ties by name in Unicode code point order; the first three (or fewer), separated by ", "; \`top -\` if there are none.`,
    checks: [
      { stdin: L('student,assignment,score', 'Ana,hw1,90', 'Ana,hw2,80', 'Bo,hw1,70', 'Cy,hw1,100', 'Dee,hw1,60') },
      { stdin: L('student,assignment,score', 'Ana,hw1,88.5', 'Bo,hw1,', 'Ana,hw2,91') },
      { stdin: L('student,assignment,score', 'Ana,hw1,90', 'Bo,hw1,ninety') },
      { stdin: L('student,assignment,points', 'Ana,hw1,90') },
      { stdin: L('student,assignment,score') },
      { stdin: '' },
    ],
    hidden: [
      { trap: 'BOM before header', stdin: BOM + L('student,assignment,score', 'Ana,hw1,90') },
      { trap: 'CRLF line endings', stdin: C('student,assignment,score', 'Ana,hw1,90', 'Bo,hw1,85') },
      { trap: 'BOM + CRLF, no final newline', stdin: BOM + 'student,assignment,score\r\nAna,hw1,77\r\nAna,hw2,78' },
      { trap: 'column order + extra column', stdin: L('score,section,student,assignment', '80,A,Bo,hw1', '90,B,Ana,hw1') },
      { trap: 'padded header names', stdin: L(' student,assignment , score', 'Ana,hw1,90') },
      { trap: '0 is a real zero', stdin: L('student,assignment,score', 'Ana,hw1,0', 'Ana,hw2,100', 'Bo,hw1,40') },
      { trap: 'student averaging 0 still ranks', stdin: L('student,assignment,score', 'Ana,hw1,0', 'Bo,hw1, 0 ') },
      { trap: 'missing markers any case', stdin: L('student,assignment,score', 'Ana,hw1,N/A', 'Ana,hw2,nan', 'Ana,hw3,NaN', 'Ana,hw4,ABS', 'Ana,hw5, n/a ', 'Ana,hw6,', 'Ana,hw7,80') },
      { trap: 'nan not averaged as float', stdin: L('student,assignment,score', 'Ana,hw1,nan', 'Ana,hw2,90', 'Bo,hw1,NAN') },
      { trap: 'student with only missing scores', stdin: L('student,assignment,score', 'Ana,hw1,abs', 'Bo,hw1,75') },
      { trap: 'all scores missing', stdin: L('student,assignment,score', 'Ana,hw1,', 'Bo,hw1,N/A') },
      { trap: 'half-up not banker 82.25', stdin: L('student,assignment,score', 'Ana,hw1,82.25') },
      { trap: 'half-up not banker 0.25', stdin: L('student,assignment,score', 'Ana,hw1,0.25', 'Ana,hw2,abs') },
      { trap: 'float mean 70.0/70.1 -> 70.1', stdin: L('student,assignment,score', 'Ana,hw1,70.0', 'Ana,hw2,70.1') },
      { trap: 'float mean 3x70.35 -> 70.4', stdin: L('student,assignment,score', 'Ana,hw1,70.35', 'Ana,hw2,70.35', 'Ana,hw3,70.35') },
      { trap: 'float 81.15 -> 81.2', stdin: L('student,assignment,score', 'Ana,hw1,81.15', 'Bo,hw1,81.35') },
      { trap: 'exact tie broken by name (float says otherwise)', stdin: L('student,assignment,score', 'Zed,hw1,60.35', 'Abe,hw1,60.3', 'Abe,hw2,60.4', 'Cy,hw1,10') },
      { trap: 'rank by exact not rounded mean', stdin: L('student,assignment,score', 'Ana,hw1,80.04', 'Bo,hw1,80.01', 'Cy,hw1,80.0', 'Dee,hw1,80.03') },
      { trap: 'ties broken by code point name', stdin: L('student,assignment,score', 'bob,hw1,90', 'Zed,hw1,90', 'Amy,hw1,90', 'Eve,hw1,90') },
      { trap: 'median even count half-up', stdin: L('student,assignment,score', 'Ana,hw1,80', 'Bo,hw1,85.3', 'Cy,hw1,abs') },
      { trap: 'median odd count', stdin: L('student,assignment,score', 'Ana,hw1,99', 'Ana,hw2,10', 'Bo,hw1,55.55') },
      { trap: 'median numeric not string sort', stdin: L('student,assignment,score', 'Ana,hw1,9', 'Bo,hw1,100', 'Cy,hw1,10', 'Dee,hw1,85', 'Eve,hw1,20') },
      { trap: '3.0 is valid (int() fails)', stdin: L('student,assignment,score', 'Ana,hw1,3.0', 'Ana,hw2,4') },
      { trap: '1e2 invalid', stdin: L('student,assignment,score', 'Ana,hw1,90', 'Ana,hw2,1e2') },
      { trap: 'inf invalid', stdin: L('student,assignment,score', 'Ana,hw1,inf') },
      { trap: 'superscript digit invalid', stdin: L('student,assignment,score', 'Ana,hw1,80', 'Bo,hw1,9²') },
      { trap: 'fullwidth digits invalid', stdin: L('student,assignment,score', 'Ana,hw1,９０') },
      { trap: 'negative invalid', stdin: L('student,assignment,score', 'Ana,hw1,-5') },
      { trap: 'over 100 invalid', stdin: L('student,assignment,score', 'Ana,hw1,100', 'Ana,hw2,100.01') },
      { trap: 'three decimals invalid', stdin: L('student,assignment,score', 'Ana,hw1,85.125') },
      { trap: 'leading dot invalid', stdin: L('student,assignment,score', 'Ana,hw1,.5') },
      { trap: 'ragged row', stdin: L('student,assignment,score', 'Ana,hw1,90', 'Bo,hw1') },
      { trap: 'blank student', stdin: L('student,assignment,score', 'Ana,hw1,90', '  ,hw1,80') },
      { trap: 'output sort by code point', stdin: L('student,assignment,score', 'bob,hw1,70', 'Zed,hw1,80', 'Émile,hw1,90') },
      { trap: 'quoted student with comma', stdin: L('student,assignment,score', '"Lee, Ann",hw1,"91.5"', '"Lee, Ann","hw ""2""", 88 ') },
      { trap: 'multiline quoted assignment; row count', stdin: L('student,assignment,score', 'Ana,"essay', 'part 2",90', 'Bo,hw1,x') },
      { trap: 'blank lines skipped in row count', stdin: 'student,assignment,score\n\nAna,hw1,90\n\n\nBo,hw1,abc\n' },
      { trap: 'blank lines only', stdin: '\r\n\n' },
      { trap: 'BOM header-only CRLF', stdin: BOM + 'student,assignment,score\r\n' },
      { trap: 'header error beats bad rows', stdin: L('Student,assignment,score', 'Ana,hw1,x') },
    ],
  },
];
