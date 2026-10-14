# Vow

A programming language built for AI agents to write.

Coding agents work in a loop: write code, run it, read the error, fix it. Vow is designed around that loop. Every error says what is wrong, where, and the likely fix, in words an agent can act on without a human. Failure is a value you must handle, functions declare what they can touch, and the compiler checks as much as it can before anything runs. Vow is written from scratch in JavaScript with no dependencies and compiles to fast JavaScript.

**Try it in your browser:** [vow-lang.vercel.app](https://vow-lang.vercel.app) has a playground, a 12-lesson tutorial and the full reference.

## What makes it different

- **Errors are repair instructions.** Each one names the problem, points at the line, and suggests the fix.
- **No nulls, no exceptions.** Anything that can fail returns `ok(value)` or `err(message)`, and Vow refuses programs that ignore one.
- **Capabilities in the signature.** A function that touches the network, files or environment must say `uses net`, `uses fs` or `uses env`. `--sandbox` refuses a program that reaches further than you allow, before it runs.
- **Contracts with blame.** `expects` and `ensures` are checked; some broken calls are rejected before the program runs, and at runtime the error says whether the caller or the function is at fault.
- **No type annotations.** Every type is inferred, including generics.

```vow
fn parsePrice(text) {
  let n = num(text)?
  if n < 0 { return err("a price can't be negative") }
  return ok(n)
}

for raw in ["4.50", "abc", "-2"] {
  match parsePrice(raw) {
    ok(p) => print("${raw}: ${fixed(p, 2)}")
    err(e) => print("${raw}: ${e}")
  }
}
```

```
4.50: 4.50
abc: "abc" is not a number
-2: a price can't be negative
```

## Install

You need [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install -g github:JakeBurwick/vow
echo 'print("Hello, Vow!")' > hello.vow
vow hello.vow
```

This installs two commands: `vow`, the compiler and runner, and `vow-mcp`, an MCP server for AI coding tools.

| Command | What it does |
|---|---|
| `vow app.vow [args...]` | Run a program (compiled to JavaScript) |
| `vow --check app.vow` | Type-check without running |
| `vow test app.vow` | Run the file's `test "name" { ... }` blocks; exit 1 if any fails (`--filter word` narrows them) |
| `vow --sandbox --allow fs=./data app.vow` | Only let the program touch `./data`, checked before it runs |
| `vow --sandbox --allow net=api.example.com app.vow` | Only let it call one host |
| `vow --seed 7 game.vow` | Make random numbers repeatable |
| `vow --interp app.vow` | Use the interpreter instead of the compiler |
| `vow --max-steps 500000000 app.vow` | Raise the step cap for heavy work (default 50,000,000; `0` = no limit) |

To hack on Vow itself, clone the repository and run the CLI from the clone with `node cli.js` in place of `vow`:

```sh
git clone https://github.com/JakeBurwick/vow.git
cd vow
echo 'print("Hello, Vow!")' > hello.vow
node cli.js hello.vow
```

Programs can span files with `import "./shapes.vow" as shapes`. See `programs/todo-cli/` for a multi-file example.

## Use Vow with your AI

Vow is meant to be written by AI coding tools. Give your tool the guide once and it can write, check and fix Vow on its own.

1. **Install:** `npm install -g github:JakeBurwick/vow`
2. **Tell your tool about Vow.** Paste this into Claude Code, Codex, Cursor or any coding agent:

   > This project uses Vow, a programming language for AI agents. Before writing any Vow, read https://vow-lang.vercel.app/llms.txt and the guide it links to. Run programs with `vow file.vow`. After every edit run `vow --check file.vow` and fix each error using its "Likely fix" line. Before finishing, add test blocks for each example and error case and run `vow test file.vow`. Vow has no null and no exceptions: handle every Result with match or ?.

3. **Add it to your project (optional).** Copy [`templates/AGENTS.md`](templates/AGENTS.md) into your project root as `AGENTS.md` so your agent picks it up automatically. It has the same instructions plus the five rules agents miss most.
4. **Connect the Vow tools (optional).** In Claude Code, `claude mcp add vow -- vow-mcp` gives the agent `vow_guide`, `vow_check`, `vow_run` and `vow_test` tools. Any other MCP client can launch the `vow-mcp` command over stdio.

Tested in October 2026 with Claude Haiku 4.5, Anthropic's smallest current model at the time. Larger models should do at least as well. Comparable small models from other labs should behave similarly, since everything Vow needs is in its guide, but they have not been measured. A very small local model (Llama 3.2 3B) could not solve these tasks in Vow or in TypeScript.

## Learn

- [Tutorial](https://vow-lang.vercel.app/#learn): 12 short lessons, each runnable in the browser.
- [`bench/VOW_GUIDE.md`](bench/VOW_GUIDE.md): the complete language guide, written so an AI agent can learn Vow from it in one read. [`llms.txt`](llms.txt) points agents to it.
- [`programs/`](programs/): example programs, including a live stock ticker, a Lisp interpreter and a multi-file to-do app.

## Does it work?

Vow was measured with AI agents (Claude Haiku) on problems it was never tuned on. The full method and every number are in [`RESULTS.md`](RESULTS.md).

Measured October 2026 (dates per row). Numbers may be out of date; `RESULTS.md` has the latest.

| Measure | Vow | Comparison | Measured |
|---|---|---|---|
| Recursive fib(32) | 0.09 s | Python 0.14 s | 2026-10-07 |
| Agent code passing 150 fresh hidden tests per task | 99.5% | TypeScript 99.3% | 2026-10-08 |
| Failed submissions, 3 new hard tasks (Lisp interpreter, JSON schema validator, spreadsheet), 9 runs | 1 | TypeScript 0 | 2026-10-13 |
| Same 3 hard tasks after that night's fixes, 9 runs | 0 | TypeScript 0 (unchanged, Oct 13) | 2026-10-14 |
| Failed submissions, 4 new moderately hard tasks, 12 runs | 0 | TypeScript 0 | 2026-10-13 |
| Failed submissions per run, older hard set, agents may run code first | 1.0 (2.3 a day earlier) | TypeScript 1.0 | 2026-10-13 (TS 2026-10-12) |
| Failed attempts, same tasks, no running allowed | 15 | TypeScript 7 | 2026-10-08 |
| Attack programs blocked by the sandbox | 6 of 7 | Deno 7 of 7 | 2026-10-02 |

On October 13, after fixes for built-in tests, clearer documentation, and checker bugs, testing on three new hard tasks produced one failed submission for Vow and zero for TypeScript across nine runs, with every run solved. The single Vow failure occurred when the agent misread the specification. Tests from October 7 to 12 on an older task set recorded about twice as many attempts in Vow as in TypeScript, while tests with Claude Sonnet produced zero failed submissions in both languages. The Vow sandbox does not yet support a read-only file grant, which is the one attack Deno blocks and Vow does not.

## Development

```sh
npm test            # runs test.js and compile-test.js
python3 bench/hidden/run.py   # hidden-test correctness check
```

`compile-test.js` runs every test program, saved solution and example through both the compiler and the interpreter and requires identical output.

| Path | Contents |
|---|---|
| `lang/` | Lexer, parser, type checker, contract prover, interpreter, compiler |
| `cli.js`, `cli-main.js` | Command-line tool and sandbox |
| `index.html`, `app.js`, `learn.js` | Website, playground and tutorial |
| `bench/` | Agent benchmark: tasks, judge, logs, solutions, hidden tests |
| `mcp/` | MCP server (the `vow-mcp` command) so AI agents can check and run Vow code |
| `templates/AGENTS.md`, `llms.txt` | Instructions for AI coding tools that write Vow |

## License

MIT. See [LICENSE](LICENSE).
