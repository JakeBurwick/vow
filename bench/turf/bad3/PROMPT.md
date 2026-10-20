# Bad-data bench, held-out set 3: agent prompt

Each agent gets one task in one language, in a fresh context, with the repo at `~/Desktop/vow-lang` as its working directory. Code-running is allowed, as in the 2026-10-12 and later rounds in RESULTS.md. Fill in the placeholders:

- `{{TASK}}`: `payroll`, `order-merge` or `temp-readings`
- `{{SPEC}}`: the ticket, exactly as `node bench/turf/bad3/run.mjs {{TASK}} --spec` prints it
- `{{INPUT}}`: `standard input` for payroll and temp-readings, `its first command-line argument` for order-merge (also the `input` field in tasks.js)
- `{{RUN}}`: a short run label such as `r1`
- `{{EXT}}`: `vow`, `ts` or `py`

Save solutions as `bench/scratch/bad3/{{TASK}}-{{RUN}}{{EXT}}.{{EXT}}` so that `node bench/turf/bad3/tally.mjs bench/scratch/bad3` picks them up. Set `VOW_BENCH_TAG=bad3-{{RUN}}{{EXT}}` in the agent's environment so its judged attempts are tagged in `bench/log/attempts.jsonl`.

The prompt says nothing about errors, validation or unusual input, and must not be edited to do so.

## Vow

```text
Vow is a new programming language. Everything you know about it is in bench/VOW_GUIDE.md and bench/EXAMPLES.md (verified example programs). Read both before you start.

Ticket:
{{SPEC}}

Write a complete program in Vow that reads {{INPUT}} and prints the output described in the ticket. Save it as bench/scratch/bad3/{{TASK}}-{{RUN}}vow.vow.

You may check and run your code as often as you like: `node cli.js --check FILE` type-checks it, `node cli.js FILE [args]` runs it (pipe text in for standard input), and `node cli.js test FILE` runs its test blocks.

When you are done, submit it with `node bench/turf/bad3/run.mjs {{TASK}} bench/scratch/bad3/{{TASK}}-{{RUN}}vow.vow`. It runs the ticket's checks and prints PASS or what failed. If it fails, fix the program and submit again. Stop when it passes, and reply with the file path and how many times you submitted.
```

## TypeScript

```text
Ticket:
{{SPEC}}

Write a complete program in TypeScript that reads {{INPUT}} and prints the output described in the ticket. It runs under Deno: command-line arguments are in Deno.args, print with console.log. Save it as bench/scratch/bad3/{{TASK}}-{{RUN}}ts.ts.

You may check and run your code as often as you like: `deno check FILE` type-checks it and `deno run FILE [args]` runs it (pipe text in for standard input).

When you are done, submit it with `node bench/turf/bad3/run.mjs {{TASK}} bench/scratch/bad3/{{TASK}}-{{RUN}}ts.ts`. It runs the ticket's checks and prints PASS or what failed. If it fails, fix the program and submit again. Stop when it passes, and reply with the file path and how many times you submitted.
```

## Python

```text
Ticket:
{{SPEC}}

Write a complete program in Python 3 that reads {{INPUT}} and prints the output described in the ticket. Command-line arguments are in sys.argv[1:]. Use only the standard library. Save it as bench/scratch/bad3/{{TASK}}-{{RUN}}py.py.

You may run your code as often as you like with `python3 FILE [args]` (pipe text in for standard input).

When you are done, submit it with `node bench/turf/bad3/run.mjs {{TASK}} bench/scratch/bad3/{{TASK}}-{{RUN}}py.py`. It runs the ticket's checks and prints PASS or what failed. If it fails, fix the program and submit again. Stop when it passes, and reply with the file path and how many times you submitted.
```

## After the runs

```sh
node bench/turf/bad3/tally.mjs bench/scratch/bad3          # per-language table plus one line per solution
node bench/turf/bad3/score.mjs temp-readings FILE -v            # one solution, with what it printed on each silent trap
```
