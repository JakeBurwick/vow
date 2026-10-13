# Vow MCP server

Gives any MCP-capable agent (Claude Code, Claude Desktop, Cursor, ...) the Vow compiler in its loop.

```
claude mcp add vow -- node /absolute/path/to/vow-lang/mcp/server.js
```

| Tool | What it does |
|---|---|
| `vow_guide` | Returns the language guide (read once before writing Vow). |
| `vow_check` | Type-checks + proves contracts, runs nothing. Returns `ok` or one repair-prompt diagnostic. |
| `vow_run` | Runs a program with `args`. Sandboxed: readFile/writeFile/httpGet/env return err Results, 10 s wall clock, 5M steps, 256 MB heap, 2,000 output lines, 200 KB source. |
| `vow_test` | Runs the program's `test "name" { ... }` blocks in the same sandbox (`filter` narrows them by name). Returns one line per test and a summary; the result is an error when a test fails. |

Zero dependencies, stdio JSON-RPC 2.0. Each `vow_run` gets its own worker thread, killed on timeout.
