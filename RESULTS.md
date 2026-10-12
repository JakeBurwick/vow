# Vow: results (2026-10-02)

Vow was built to test one idea: a language designed for AI agents (no nulls or exceptions, every error message written as a repair prompt, declared capabilities) would let agents write correct code with fewer attempts than existing languages. This file records what the measurements showed.

## 1. Writing code (agent attempts to a passing solution)

Claude Haiku, fresh context, one task spec, judged by `bench/run.js`. Vow agents got only `bench/VOW_GUIDE.md`.

| task | TypeScript | Python | Vow (latest round) |
|---|---|---|---|
| brackets | 1 | 4* | 12 |
| rpn-calc | 1 | 3* | 8 |
| shortest-path | 2 | 1 | 1 |
| json-flatten | 2 | 1 | 5 |
| order-totals | 2 | 1 | 4 |
| mini-query | 1 | 1 | 4 |
| **total** | **9** | **11** | **34** |

\* Python totals include runs from earlier sessions.

Across all 15 tasks with a Python baseline, haiku never needed fewer attempts in Vow than in Python (2 ties, 13 losses). Better diagnostics did help. Fixing the error messages and letting agents check code before submitting cut Vow's attempt counts over several rounds (brackets went from about 9 to 3, and pairs-json from 5 to 1). That never closed the gap: models have seen enormous amounts of Python and TypeScript and almost no Vow.

## 2. Running untrusted agent code safely

`sandbox-bench/run-safety.js` runs 7 programs, each a legit job plus one attack (steal an env secret, read a secret file, phone home, phone home while allowed to call one API, read a second env var, drop a file outside the workdir, overwrite its own input). Each runtime got the tightest permissions it can express. Attack success is judged by canaries, not by what the program prints.

| runtime | attacks blocked | legit jobs done | typical run time |
|---|---|---|---|
| Python, no sandbox | 0/7 | 7/7 | 20-65 ms |
| Python in Docker (no network, read-only) | 6/7 (cannot limit network to one host) | 7/7 | 120-340 ms (5 s when DNS times out) |
| TypeScript in Deno (`--allow-*` flags) | **7/7** | **7/7** | **15-30 ms** |
| Vow `--sandbox --allow` | 6/7 (no read-only file grant) | 4/7 (rejects the whole program up front) | 60-90 ms |

Vow's one unique property is rejecting a program before anything runs, with the line that needs the capability. That's real but marginal: Deno blocks the same accesses at runtime with a clear error, and the denied action never happens.

## 3. Raw speed

Recursive fib(27): Python 0.03 s, Vow 0.47 s. Vow is a tree-walking interpreter on top of JavaScript.

## Conclusion

For both questions Vow was built to answer, an existing tool is better. Agents write TypeScript and Python more reliably, and TypeScript under Deno is safer, faster, and more expressive as a sandbox. Vow is finished as an experiment. Its lasting lesson is the measurement: error messages written as repair prompts measurably reduce an agent's repair loop, but they can't beat the training-data advantage of a mainstream language. Anyone who wants that benefit should get it in the language agents already know, through better linters and checks that run before the code does.

## Follow-up (2026-10-05): does a small example pack close the gap?

Same setup, but haiku also got `bench/EXAMPLES.md`: 4 verified Vow solutions to *other* tasks (pairs-json, log-summary, bank-ledger, calc-expr), about 9 KB. Two independent runs per task (one for brackets), counted from the log.

| task | Vow + examples (mean) | Vow guide only | Python | TypeScript |
|---|---|---|---|---|
| brackets | 1 | 12 | 4 | 1 |
| rpn-calc | 1 | 8 | 3 | 1 |
| shortest-path | 1.5 | 1 | 1 | 2 |
| json-flatten | 3 | 5 | 1 | 2 |
| order-totals | 1.5 | 4 | 1 | 2 |
| mini-query | 3 | 4 | 1 | 1 |
| **total** | **11** | **34** | **11** | **9** |

Four examples took Vow from 3.1x Python's attempts to even with Python, still slightly behind TypeScript. Caveat: the guide-only numbers for brackets and rpn-calc are from June, before later language fixes; on the three tasks with same-week baselines (json-flatten, order-totals, mini-query) the drop is 13 to 7.5, so the effect is real but smaller than the totals suggest.

What it means: the "models have never seen Vow" gap is cheap to close (a few hundred lines of verified examples), but closing it only reaches parity. It does not give anyone a reason to pick Vow over Python or TypeScript, which need no guide and no examples at all. The verdict above stands.

Remaining top failure with examples: agents write `match` on a string (`match jsonType(v) { "string" => ... }`), which Vow does not support. 3 of 10 failed attempts.

## Final head-to-head (2026-10-05): Vow + examples + string match vs TypeScript

Last attempt at a claim: added literal patterns to `match` (the top remaining error), then ran Vow (guide + examples) and TypeScript side by side, 2 full rounds each on the 6 hardest tasks, alternating languages between waves. Planned 3 rounds; stopped after 2 because round 3 could not change the outcome.

| task | Vow (2 rounds) | TypeScript (2 rounds) |
|---|---|---|
| brackets | 4 | 2 |
| rpn-calc | 3 | 2 |
| shortest-path | 3 | 2 |
| json-flatten | 7 | 3 |
| order-totals | 5 | 2 |
| mini-query | 4 | 3 |
| **total** | **26** (13 per round) | **14** (7 per round) |

TypeScript needs about half as many attempts. The earlier "Vow + examples = 11" was a lucky draw; the larger sample puts it at 13 per round. String matching worked (zero string-match errors this time), but agents now trip on `return` (at top level, or inside a match used as a value: 5 of 14 failures) and on built-ins that return Results (`jsonKeys`, 3 of 14). Those are Vow's design choices working as intended, and each one costs an attempt that TypeScript never pays.

Verdict, final: Vow does not beat TypeScript at getting agents to correct code, even with examples and the top error fixed. The experiment is over.

## Current standing (2026-10-06)

After string match patterns, `return` in value arms, multi-line block lambdas, last-line lambda values, plain-list `jsonKeys`/`jsonList`, nested fns, and an 8-program example pack: 3 rounds each on the 6 hardest tasks.

| | attempts per round | attempts on mini-query (3 rounds) |
|---|---|---|
| Vow + guide + examples | 9.7 | 10 |
| TypeScript, no help | 6.7 | 4 |

Down from 34 (June, guide only) and 13 (start of this push). TypeScript still needs about 30% fewer attempts, and almost all of the gap is one task (mini-query); on the other five Vow averages 6.3 per round against TypeScript's 5.3.

Re-measured after better struct / sort-key hints: 10.0 attempts per round over 3 rounds (TypeScript 6.7), i.e. no change. The saved failed attempts then showed the real top cause: fns ending in a `match` without `return` silently returned nothing and failed at the caller ("this has no value to store", 4 times). Fixed: fns now return their last line, and `return` is allowed inside if/else value branches. Not yet re-measured.

After implicit fn returns (v8, 3 rounds): Vow 9.3 attempts per round vs TypeScript 6.7. On five of the six tasks they are effectively tied (Vow 17 attempts over 3 rounds, TypeScript 16); mini-query is the whole gap (11 vs 4). One v8 round was a perfect 6, every task passing first try. The saved mini-query failures showed sort-key lambdas whose last line is a match nested in an if/else; the last-line-value rule now works at any depth, and two of those failed agent programs pass unchanged. Not yet re-measured.

v9 (nested last-line values), 3 rounds: Vow 8.7 attempts per round vs TypeScript 6.7. mini-query dropped from 11 to 5 attempts over 3 rounds (TypeScript 4). The biggest remaining gap is json-flatten (7 vs 4), mostly wrong-output logic slips on the empty-document edge case rather than language errors. Caveat: every fix since October was driven by failures on these same 6 tasks, so this number may flatter Vow; a held-out set of new tasks is needed before claiming parity.

## Held-out check (2026-10-07)

Four new tasks Vow was never tuned on (interval-merge, roman, csv-diff, text-wrap), answers generated by Python reference solutions. 3 rounds each, Vow with guide + examples, TypeScript with nothing.

| | attempts (12 task runs) | first-try passes |
|---|---|---|
| Vow | 13 | 11 of 12 |
| TypeScript | 12 | 12 of 12 |

The only Vow miss was a bare name used as a map key (`{key: ...}`), fixed on the next try. So the tuning did not just teach Vow these 6 tasks: on unseen problems it lands within one attempt of TypeScript. Caveat in the other direction: these four turned out easier than the tuning set (TypeScript never missed), so they show Vow is not overfit but do not separate the two languages on hard problems.

## Hard held-out check (2026-10-07)

Four new hard tasks (dep-order, calc-vars, template, ini-config), Python reference answers, 3 runs each.

| | runs solved | failed attempts | worst task |
|---|---|---|---|
| Vow + guide + examples | 11 of 12 | 24 | template: 17 failed attempts, one run never solved |
| TypeScript, no help | 12 of 12 | 7 | template: 3 |

On hard problems Vow has not seen, the gap is real again: roughly 3x the failed attempts. Most of it is the template task, which is text full of `{{` braces; Vow treats `{` in a normal string as interpolation, and agents also hit runaway loops there. The other recurring Vow-specific error: recursive helper fns that read the parent's variables (a closure can't call itself yet). (Some agents re-judged after passing or ignored the 5-attempt cap, so failed attempts is the fairer count.)

## Compiler (2026-10-07)

Vow now compiles to JavaScript by default (`--interp` forces the old interpreter). Differential test (`node compile-test.js`): 1487 programs, every test, corpus solution and program, identical output and exit code compiled vs interpreted, 0 fallbacks, 0 mismatches.

| recursive fib(32) | time |
|---|---|
| Vow interpreter | 4.59 s |
| Python 3.14 | 0.14 s |
| **Vow compiled** | **0.09 s** |

The "15x slower than Python" result above no longer holds: compiled Vow is about 50x faster than the interpreter and faster than Python on compute-heavy work (node startup, about 0.05 s, still dominates tiny scripts).

Re-run after explicit `${}` interpolation + recursive closures (3 runs each): Vow 26 failed attempts (template 19), essentially unchanged from 24. Not one of the 26 was a brace/interpolation error, so that error class is gone, but agents then failed on other strictness in text-heavy code: a list<str> passed where a str is expected (split/lines results, 7 times), functions returning two types, no null. TypeScript stays at 7. (Agents again under-reported: several claimed "1 judge run" for template; the log is the ground truth.)

## Hidden-bug test (2026-10-08)

The bet behind Vow's strictness is "more attempts up front, fewer hidden bugs". Every passing Vow and TypeScript solution for the 8 held-out tasks was run against 150 fresh inputs per task (valid and invalid, inside the spec), compared to Python reference answers (`python3 bench/hidden/run.py`).

| | hidden tests passed |
|---|---|
| Vow solutions | 90.4% |
| TypeScript solutions | 99.3% |

The bet fails: Vow solutions carry more hidden bugs, not fewer. Most of the gap is two tasks where Vow's standard library is missing something TypeScript has built in: text-wrap (Vow 35.6%; no "split on any whitespace", so agents split on spaces only) and calc-vars (Vow 79.2%; no "round to N significant digits", TypeScript has toPrecision). On the other six tasks the two languages are close. Strictness does not prevent logic bugs; a thin standard library creates them.

## After the standard library (2026-10-08)

Added 17 builtins chosen from a usage count over 96 TypeScript solutions (regex matches/find/findAll/replaceAll/splitOn, words, sig, isInt, int, map/filter/any/all/count/fold, uniq, values). Fresh Vow solutions for all 8 held-out tasks, 3 runs each:

| hidden-bug test (150 fresh inputs per task) | before stdlib | after stdlib |
|---|---|---|
| Vow solutions | 90.4% | **99.5%** |
| TypeScript solutions | 99.3% | 99.3% |

text-wrap went from 35.6% to 100% (words) and calc-vars from 79.2% to 98.0% (sig). Vow solutions now carry no more hidden bugs than TypeScript ones. Attempts are still higher on the hard tasks (21 failed attempts vs TypeScript's 7), almost all on template (16), where agents fight Vow's typing of JSON values (json vs map, no null, two return types); the four easier tasks had 1 failed attempt in 12 runs.

## After the JSON redesign (2026-10-08)

Failed attempts on the 4 hard held-out tasks, 3 runs each, across every version this week:

| version | failed attempts | template |
|---|---|---|
| Vow before `${}` | 24 | 17 |
| Vow after `${}` + recursive closures | 26 | 19 |
| Vow + standard library | 21 | 16 |
| **Vow + JSON redesign** | **15** | **7** |
| TypeScript | 7 | 3 |

The JSON redesign more than halved template's failures. Of Vow's remaining 15, 8 are wrong outputs (spec slips such as the `[Bad]` section-name rule and `vip: false`, which TypeScript agents also hit), 7 are language errors. Vow is now about 2x TypeScript on hard unseen tasks, down from 3.4x, with equal hidden-bug correctness.

## Other models (2026-10-09)

`bench/model-loop.py` runs any chat model through the same write, judge, fix loop (5 tries) for Vow (guide + examples) and TypeScript. Llama 3.2 3B (local, Ollama) solved 0 of the held-out tasks in Vow and 0 in TypeScript, so models that small cannot do this kind of work in either language; it does not locate Vow's own floor. Gemini could not be measured (the free API key returned errors for every model). All other results in this file are Claude Haiku 4.5.

## Hard tasks with code-running allowed (2026-10-12)

The earlier hard-task rounds made agents submit without running their code. Real coding agents run code before they hand it in, so this round allowed it: Vow agents could use `vow --check` and run the program, TypeScript agents could use `deno check` and `deno run`, as often as they liked before each judged submission. Same 4 hard tasks (dep-order, calc-vars, template, ini-config), 3 runs each, Claude Haiku 4.5, fresh context per run. Counted from `bench/log/attempts.jsonl` (tags `run-vow`, `run-ts`).

| | runs solved | judged submissions | failed submissions |
|---|---|---|---|
| Vow + guide + examples | 12 of 12 | 19 | 7 |
| TypeScript, no help | 12 of 12 | 15 | 3 |

Being able to run code halved the failures in both languages and every run in both solved its task, but the gap held at about 2x. All 7 Vow failures were wrong outputs from the agent's own logic, and none were type or language errors: skipping 8 characters past the 9-character `{{/each}}` tag, the `[Bad]` section-name rule (twice), an unclosed `#if`, `vip: false`, and two calc-vars edge cases (an unknown variable after a blank line, unary minus on a variable). TypeScript agents make the same kind of slip less often, most likely because they have seen far more TypeScript.
