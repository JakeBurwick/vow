# Vow — language guide for agents

Vow is a small statically-typed language. All types are inferred — never write a type annotation. There are **no nulls and no exceptions**: anything that can fail returns a `Result` that the checker forces you to handle. Newlines end statements; there are no semicolons.

Run a program with `node cli.js main.vow [args]`. A program can span several files: `main.vow` imports the others (`import "./geometry.vow" as geo`) and the CLI loads them from disk, relative to each importing file. Run the main file; `--check main.vow` checks every file it imports. (The browser playground runs one file.)

## Variables & types
```
let x = 5        // mutable, but its type is pinned for life
x = 6            // ok
x = "six"        // type error — a variable never changes type
```
Primitives: `num`, `str`, `bool` (`true`/`false`). Boolean operators are `and`, `or`, `not` — there is no `&&`, `||`, `!`. Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`. Division by zero is a runtime trap.

## Strings
```
let name = "Ada"
print("hi ${name}, next year: ${2026 + 1}")   // interpolation: any expression in ${…}
print("{\"name\": \"${name}\"}")       // plain { and } are just text: {"name": "Ada"}
let c = name[0]          // "A": indexing a str gives a one-character str (traps if out of range; get(s, i) is safe)
```
Only `${expr}` inserts a value. A plain `{` or `}` (and a `$` not followed by `{`) is ordinary text, so templates like `"{{name}}"` and JSON need no escaping. Escapes: `\n \t \" \\` and `\$` (`"\${x}"` prints the literal text `${x}`). `"hi {name}"` does NOT insert name: the checker reports it when `name` is a variable (write `${name}`, or `\{name}` if you really want the braces). A **raw string** in backticks: `` `C:\path "quoted" ${not interpolated}` `` takes every character literally (no escapes, no interpolation, may span multiple lines).

## Collections
```
let xs = [1, 2, 3]          // list — one element type only
let m = {"a": 1, "b": 2}    // map — string keys, one value type
let fresh = {}              // empty map — value type pinned by first insert
m["c"] = 3                  // insert or update a key
xs[0]    m["a"]             // indexing TRAPS on out-of-bounds / missing key
get(xs, 9)  get(m, "z")     // safe access → Result
has(m, "a")                 // key check → bool
push(xs, 4)  pop(xs)        // pop returns a Result
```

## Control flow
```
if x > 0 { print("pos") } else { print("non-pos") }
for x in xs { print(x) }
for i in range(0, 5) { ... }     // 0,1,2,3,4
while cond { ...  break  continue }
```

## Functions
```
fn add(a, b) { return a + b }
```
Params and return types are inferred. A fn that never says `return` returns the value of its last line (a bare expression, a `match`, or an `if/else`), like a block. If a function returns a value on one path, **every** path must return. Functions are generic automatically (a `fn first(xs) { return xs[0] }` works on any list type), but each individual call must be type-consistent. Lambdas: `x => x * 2`, `(a, b) => a + b`, `() => "hi"`, or a block body whose last line is the value (or that uses `return`); block lambdas may span lines even inside a call: `sortBy(xs, x => {` newline `let k = x.price` newline `k` newline `})`. Only named `fn`s and lambda-typed variables are callable.

## Results — the core of the language
```
match num("42") {            // num(str) → Result: ok(n) or err(e)
  ok(n)  => print(n * 2)
  err(e) => print("bad: " + e)
}
```
- `match` also compares a plain str/num/bool against literals; `_` catches everything else and must come last (a bool can use `true`/`false` instead):
```
let label = match jsonType(v) {
  "string" => "text"
  "number" => "num"
  _ => "other"
}
```
- A `Result` can never be ignored — unused Results are compile errors.
- `match` must handle **both** arms.
- `match` works as an expression: `let v = match num(s) { ok(n) => n err(e) => 0 }`. An arm can also be a block — its **last line must be a bare expression**, and that is the arm's value:
```
let v = match num(s) {
  ok(n) => {
    let d = n * 2
    d
  }
  err(e) => 0 - 1
}
```
In a statement match (one whose value isn't used), arms may `return`, `break`, or `continue` freely, e.g. `err(e) => continue` or `ok(v) => return ok(v)`. Inside a fn, a value-producing arm (or if/else branch) may also `return` from the function: `err(e) => { return -1 }` (an arm that always returns needs no value). `break`/`continue` may not escape a value-producing arm. `if/else` also works as a value: `let size = if x > 5 { "big" } else { "small" }` (an else is required; each branch's last line is its value; `else if` chains work).
- `?` unwraps ok or propagates the err to the caller — **only inside a function** (whose returns are `ok(...)`/`err(...)`), never at top level:
```
fn area(w, h) {
  let a = num(w)?
  let b = num(h)?
  return ok(a * b)
}
```
Build your own: `return ok(value)` / `return err("message")`.

## Structs
```
struct Point { x, y }
let p = Point { x: 3, y: 4 }   // ALL fields required, every time
p.x = 10                        // fields are type-pinned too
print(p == Point { x: 10, y: 4 })  // value equality
```

## JSON
`parseJson(text)` → `Result<json, str>`. A `json` value is any JSON value (object, array, string, number, bool, null); it is read-only.
```
match parseJson(`{"user": {"name": "Ada", "age": 36, "tags": [], "pet": null}}`) {
  ok(data) => {
    let user = field(data, "user")            // json; a json null when the key is missing
    for k in jsonKeys(user) {                 // keys of an object ([] for anything else)
      let v = field(user, k)
      if isNull(v) { continue }
      print("${k} = ${v} (${truthy(v)})")     // name = Ada (true) / age = 36 (true) / tags = [] (false)
    }
  }
  err(e) => print("bad data: ${e}")
}
```
- Read: `field(j, "key")` and `at(j, i)` → json, a **json null** when the key/index is missing or `j` is the wrong kind. `has(j, "key")` → bool. `get(j, key)` → Result, for when missing is an error.
- Test: `isNull(j)`, `truthy(j)` (false for null, false, 0, "", `[]` and `{}`; empty array/object are falsy, unlike JavaScript), `jsonType(j)` → "object"/"array"/"string"/"number"/"bool"/"null".
- Text: `str(j)` (and `print(j)`, `"${j}"`): strings as-is, numbers like `str(num)` (3, 3.5), true/false, null as "null", arrays/objects as compact JSON.
- Walk: `jsonList(j)` → list of json elements, `jsonKeys(j)` → list of keys; both plain lists, `[]` for the other kinds.
- Typed values: `jsonNum`, `jsonStr`, `jsonBool` → Results (err if it is another kind). `toJson(value)` serializes nums/strs/bools/lists/maps/structs/json.
- There is no `null` keyword and json is not a map: use `field`/`has`/`jsonKeys` on it. A fn whose params are only used with these works on json directly. `j["key"]` / `j[0]` trap on a miss.

## Contracts (optional)
```
fn withdraw(bal, amt)
  expects amt > 0 and amt <= bal
  ensures result >= 0
{ return bal - amt }
```
Contracts are checked at runtime with blame (caller vs callee). If the checker can *prove* a call always breaks an `expects` (e.g. constant arguments), it refuses to compile with a `ContractError` — fix the call site or the contract.

## Builtins
`print str num len range push pop get keys has join split abs floor round fixed min max sort sortBy reverse sum contains slice trim upper lower ok err` (plus math, random and dates: see below)

Text: `replace(t, old, new)` (every occurrence, literal), `startsWith(t, p)`, `endsWith(t, s)`, `indexOf(t, piece)` → Result, `repeat(t, n)`, `padLeft(t, width, fill)`, `padRight(t, width, fill)`, `lines(t)` (splits on newlines, drops a trailing one), `contains(t, piece)`, `split(t, sep)`, `slice(t, from, to)`, `t[i]`. — plus CLI I/O: `args()` → list<str>, `readFile/writeFile/httpGet/env` → Results.

`round(x, 2)` rounds half-up to 2 decimals (15.625 → 15.63), `fixed(x, 2)` gives text with exactly 2 decimals ("212.30") and `str()` prints numbers without trailing zeros (12.5, 3). `sort(xs)` orders nums or strs. `sortBy(xs, x => x.price)` orders any list by a num/str key (stable: ties keep their order). Both return a NEW list: write `xs = sort(xs)`. `and`/`or` short-circuit, so `i < len(xs) and xs[i] > 0` is safe. `args()` holds only the user's arguments, never the program name.

### Standard library: use these instead of hand-rolled loops
Lists (the fn is a lambda or a named fn, like sortBy; all return NEW values):
- `map(xs, x => x * 2)` → new list · `filter(xs, x => x > 0)` → kept items · `count(xs, x => x > 0)` → num
- `any(xs, x => x < 0)` / `all(xs, x => x > 0)` → bool (stop early; `all([], f)` is true)
- `fold(xs, 0, (acc, x) => acc + x)` → the accumulator (same type as the start value)
- `uniq(xs)` → first occurrence of each value, order kept (`==` equality, works on structs) · `values(m)` → map values in `keys(m)` order

Text (patterns are JavaScript regular expressions; write them as backtick raw strings so `\d` stays `\d`):
- ``matches(s, `^\d+$`)`` → bool; searches anywhere unless you anchor with `^...$`
- ``find(s, `(\w+)=(\d+)`)`` → Result: `ok([whole, group1, group2])` (an unmatched group is `""`), `err("no match")`
- ``findAll(s, `\d+`)`` → list of every match · ``replaceAll(s, `(\w+)@`, "$1 at ")`` → str (`$1` = group 1)
- ``splitOn(s, `\s*[,;]\s*`)`` → list (groups in the pattern do not add pieces) · `words(s)` → split on any whitespace, no empty strings
- `replace(t, old, new)` stays literal text; a bad pattern literal is a compile error

Numbers: `int("42")` → Result, strict (optional `-` then digits; `"4.2"`, `" 5"`, `"+3"` are errs) · `isInt(x)` → bool · `sig(1234.5, 2)` → 1200 (significant digits, 1 to 21)

Your own `fn map(...)`, `let count = ...`, `fn log(...)`, `let pi = ...`, etc. still work: a fn or variable you define with a builtin's name takes precedence.

**Capabilities:** a fn that does I/O must declare it in its signature — `fn fetch(url) uses net { return httpGet(url) }`. Capabilities: `net` (httpGet), `fs` (readFile/writeFile), `env` (env). Callers of an effectful fn must declare it too; top-level code needs no declaration; declaring a capability you don't use is also an error.

## Modules (multi-file programs)
```
// file geometry.vow (a module: only fn, struct and import)
struct Point { x, y }
fn norm(p) { return sqrt(_sq(p.x) + _sq(p.y)) }
fn _sq(v) { return v * v }          // _ = private to geometry.vow

// file main.vow (the one you run: node cli.js main.vow)
import "./geometry.vow" as geo
let p = geo.Point { x: 3, y: 4 }
print(geo.norm(p))                  // 5
```
- `import "<path>" as <name>` goes at the top of a file, before any other code. The path is a string literal starting with `./` or `../`, relative to the importing file, naming a `.vow` file. `as name` is required; the name can't be a builtin, or anything else declared in that file.
- Use a module's fns and structs only through its name: `geo.norm(p)`, `geo.Point { x: 1, y: 2 }`, `let f = geo.norm`. Names from different files never collide.
- A module exports its top-level `fn`s and `struct`s, except names starting with `_` (private to the module) and nested fns. A module may contain only `fn`, `struct` and `import` at the top level: no `let`, `print` or other code (it runs nothing by itself). Only the file you run has top-level code.
- A module sees its own names, the modules it imports, and builtins; never the main file's names. Each file is loaded once however often it is imported; import cycles are an error.
- Generics, contracts and capabilities work across files as in one file: a caller of `geo.fetch` declares `uses net` if `fetch` does, and `--sandbox` sees every capability in every imported file before anything runs.
- Errors name the file: `→ geometry.vow, line 2, col 5`; runtime call stacks show `at fn geometry.norm (geometry.vow, line 2)`. Inside a program a module's fn is called `<file stem>.<name>` (`geometry.norm`), and its structs print by their own name (`Point { x: 3, y: 4 }`).

## Math, random, dates
- `sqrt(x)`, `pow(x, y)`, `exp(x)`, `ln(x)` (natural log; `log(x)` is the same), `sin cos tan(x)` (radians), `atan2(y, x)`, `ceil(x)`, `trunc(x)` (toward 0), `pi()` → num. There is no `e()` (`e` is the usual err name): use `exp(1)`. A result with no real value traps like division by zero: `sqrt(-1)`, `ln(0)`, `pow(-8, 0.5)`, `pow(0, -1)`, `exp(1000)`. Guard the input first.
- `random()` → num in [0, 1). `randomInt(lo, hi)` → whole number from lo to hi, **both included** (traps if lo > hi or a bound isn't whole). `node cli.js --seed 42 main.vow` (or `VOW_SEED=42`) makes the sequence repeatable.
- Times are nums: milliseconds since 1970-01-01T00:00:00Z, **always UTC**. `now()` → current time. `dateParts(ms)` → `DateParts { year, month (1-12), day, hour, minute, second, weekday (0=Sunday..6) }`. `isoDate(ms)` → `"2026-10-08T14:03:00Z"`. `parseDate(s)` → Result<num, str>: accepts `2026-10-08`, `2026-10-08T14:03`, `2026-10-08T14:03:00`, optional `.sss`, and `Z` or `+02:00`; no zone means UTC; impossible dates (`2026-02-30`) are errs. `daysBetween(a, b)` → UTC calendar days from a to b (negative if b is earlier; time of day ignored). One day later: `ms + 86400000`.

## Program structure
A Vow file runs its top-level statements from top to bottom; there is no implicit `main`. Write the program at the top level (helper `fn`s can be declared anywhere, including inside another fn: a nested fn may read and update its parent's variables and call itself, e.g. a `fn dfs(n)` that fills the parent's `seen` map; such a fn can't have expects/ensures/uses). A bare `return` at the top level ends the program early (no value allowed there).

## Web servers
```
fn handle(req) {                      // req: map<str, str> with "method", "path", "query", "body"
  if req["path"] == "/" { return html(`<h1>Hello</h1>`) }
  if req["path"] == "/hi" {
    let name = match param(req["query"], "name") {   // /hi?name=Ada
      ok(n) => n
      err(e) => "stranger"
    }
    return html("<p>hi " + escape(name) + "</p>")   // ALWAYS escape() user text that goes into HTML
  }
  return respond(404, "text/plain", "not found")
}
match serve(8080, handle) {           // runs until stopped; err if the port is taken
  ok(v) => {}
  err(e) => print(e)
}
```
Responses: `html(body)`, `text(body)`, `respond(status, contentType, body)`, `redirect("/path")` (same-site paths only). Form posts arrive url-encoded in `req["body"]`: read fields with `param(req["body"], "field")`. `serve` needs `uses net` when called inside a fn; a handler that calls httpGet needs `uses net` too. Top-level variables persist between requests (in memory). Server binds 127.0.0.1; set VOW_HOST=0.0.0.0 to expose it.

## Common mistakes
- Putting different value types in one map (`{"name": "x", "qty": 3}`): a map holds ONE value type. Use a struct for records.
- Using `?` at top level (only valid inside a fn) — use `match` instead.
- `return` inside a value-producing match arm block — the block's last line IS the arm's value; drop the `return`.
- Using `if` as a value without an `else` (there would be no value when the condition is false).
- Forgetting an `err` arm, or ignoring a Result entirely.
- `&&`/`||`/`!` instead of `and`/`or`/`not`; semicolons (just use newlines).
- Writing `"{x}"` to insert x: interpolation is `"${x}"`; plain braces are literal text.
- Indexing (`xs[i]`, `m[k]`, `j[k]`) when the key might be missing — use `get(...)`, or `field(j, k)` for json.
- Writing your own truthiness / value-to-text helpers for json: use `truthy(j)` and `str(j)`.

Run a program: `node cli.js program.vow [args]` (from the vow-lang directory; imported files load automatically). Type-check only: `node cli.js --check program.vow`. Every error message tells you what's wrong, shows the line, and suggests the likely fix — read it and apply the fix.
