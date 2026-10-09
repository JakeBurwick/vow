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
git clone https://github.com/JakeBurwick/vow.git
cd vow
echo 'print("Hello, Vow!")' > hello.vow
node cli.js hello.vow
```

| Command | What it does |
|---|---|
| `node cli.js app.vow [args...]` | Run a program (compiled to JavaScript) |
| `node cli.js --check app.vow` | Type-check without running |
| `node cli.js --sandbox --allow fs=./data app.vow` | Only let the program touch `./data`, checked before it runs |
| `node cli.js --sandbox --allow net=api.example.com app.vow` | Only let it call one host |
| `node cli.js --seed 7 game.vow` | Make random numbers repeatable |
| `node cli.js --interp app.vow` | Use the interpreter instead of the compiler |

Programs can span files with `import "./shapes.vow" as shapes`. See `programs/todo-cli/` for a multi-file example.

## Learn

- [Tutorial](https://vow-lang.vercel.app/#learn): 12 short lessons, each runnable in the browser.
- [`bench/VOW_GUIDE.md`](bench/VOW_GUIDE.md): the complete language guide, written so an AI agent can learn Vow from it in one read.
- [`programs/`](programs/): example programs, including a live stock ticker, a Lisp interpreter and a multi-file to-do app.

## Does it work?

Vow was measured with AI agents (Claude Haiku) on problems it was never tuned on. The full method and every number are in [`RESULTS.md`](RESULTS.md).

| Measure | Vow | Comparison |
|---|---|---|
| Recursive fib(32) | 0.09 s | Python 0.14 s |
| Agent code passing 150 fresh hidden tests per task | 99.5% | TypeScript 99.3% |
| Failed attempts, 4 hard unseen tasks | 15 | TypeScript 7 |
| Attack programs blocked by the sandbox | 6 of 7 | Deno 7 of 7 |

On easy tasks agents write correct Vow about as reliably as TypeScript; on hard ones they need about twice as many attempts. The sandbox does not yet support a read-only file grant, which is the one attack Deno blocks and Vow does not.

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
| `mcp/` | MCP server so AI agents can check and run Vow code |

## License

MIT. See [LICENSE](LICENSE).
