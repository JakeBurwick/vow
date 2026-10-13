# Vow

This project uses Vow, a programming language for AI agents. Before writing any Vow, read https://vow-lang.vercel.app/llms.txt and the guide it links to. Run programs with `vow file.vow`. After every edit run `vow --check file.vow` and fix each error using its "Likely fix" line. Vow has no null and no exceptions: handle every Result with match or ?.

Install: `npm install -g github:JakeBurwick/vow`. In Claude Code, `claude mcp add vow -- vow-mcp` adds the vow_guide, vow_check, vow_run and vow_test tools.

## Rules agents miss most

1. Only `"${name}"` inserts a value. Plain braces are literal text, so JSON and `{{id}}` templates need no escaping, and `"{name}"` does not insert `name`.
2. Anything that can fail returns a Result. Handle it with `match` (`ok(v) => ...`, `err(e) => ...`) or pass it up with `?`.
3. A function that touches the network, files or environment declares it: `fn load(p) uses fs { ... }` (also `uses net`, `uses env`), and so does every function that calls it.
4. A function without `return` gives back the value of its last line.
5. Regex patterns go in backtick raw strings so `\d` stays `\d`: `` findAll(s, `\d+`) ``.
6. Before submitting a program written from a spec, add `test "name" { ... }` blocks (one per example and per error line of the spec, checking the exact output with `expectEq(run(args, stdin), "...\n")`), run `vow test file.vow`, and fix until every test passes.

## Links

- Language guide: https://vow-lang.vercel.app/bench/VOW_GUIDE.md
- Verified examples: https://vow-lang.vercel.app/bench/EXAMPLES.md
- Example programs: https://github.com/JakeBurwick/vow/tree/main/programs
- Tutorial: https://vow-lang.vercel.app/#learn
