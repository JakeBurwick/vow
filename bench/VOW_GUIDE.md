# Vow — language guide for agents

Vow is a small statically-typed language. All types are inferred — never write a type annotation. There are **no nulls and no exceptions**: anything that can fail returns a `Result` that the checker forces you to handle. Newlines end statements; there are no semicolons.

Run a program with `node cli.js main.vow [args]`. A run stops after 50,000,000 statements (`--max-steps N` raises it, `--max-steps 0` removes the cap). A program can span several files: `main.vow` imports the others (`import "./geometry.vow" as geo`) and the CLI loads them from disk, relative to each importing file. Run the main file; `--check main.vow` checks every file it imports. (The browser playground runs one file.)

**Before you submit a program written from a spec:** add `test "name" { ... }` blocks to the file, one per example in the spec and one per error line in it (expecting the exact error string, newline included), run `node cli.js test main.vow`, and fix the program until every test passes. See "Testing" below.

## Variables & types
```
let x = 5        // mutable, but its type is pinned for life
x = 6            // ok
x = "six"        // type error — a variable never changes type
```
Primitives: `num`, `str`, `bool` (`true`/`false`). Boolean operators are `and`, `or`, `not` — there is no `&&`, `||`, `!`. Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`. `not` binds tighter than comparisons: `not f(x)` is fine, but write `a != b` or `not (a == b)`, never `not a == b`. Division by zero is a runtime trap.

Numbers are 64-bit floats (one `num` type, no separate int). Literals: `42`, `3.5`, `1e9`, `2.5e-3`; negative numbers are written `-5` or `-x`. Printing: whole numbers print without a decimal point (`3`, not `3.0`), others print with up to 10 decimals and float noise removed (`0.1 + 0.2` prints `0.3`, `2 / 3` prints `0.6666666667`); `round(x, 2)`/`fixed(x, 2)` control it, `str(1e21)` is `1e+21`. Ten decimals drop digits from very small numbers (`str(0.0000123456789)` is `0.0000123457`); for N significant digits print `toJson(sig(x, N))` (`0.0000123456789`, and `0.3` for `0.1 + 0.2`). `/` is real division (`7 / 2` is `3.5`; use `floor(7 / 2)` for 3). `%` is the JavaScript remainder: the result has the sign of the LEFT side (`-7 % 3` is `-1`, `7 % -3` is `1`) and works on decimals (`5.5 % 2` is `1.5`); for a non-negative modulo write `((a % n) + n) % n`.

## Strings
```
let name = "Ada"
print("hi ${name}, next year: ${2026 + 1}")   // interpolation: any expression in ${…}
print("{\"name\": \"${name}\"}")       // plain { and } are just text: {"name": "Ada"}
let c = name[0]          // "A": indexing a str gives a one-character str (traps if out of range; get(s, i) is safe)
```
`len(s)`, `s[i]`, `slice` and `split(s, "")` count UTF-16 units, like JavaScript (`len("😀")` is 2). For whole characters use `chars(s)`; for percent-encoding use `urlEncode`/`urlDecode`: see "Text and Unicode" and "URLs" under Builtins.
Only `${expr}` inserts a value. A plain `{` or `}` (and a `$` not followed by `{`) is ordinary text, so templates like `"{{name}}"` and JSON need no escaping. Escapes: `\n \t \r \0 \" \\ \$` and `\u{1F600}` / `é` (any code point; `"\${x}"` prints the literal text `${x}`); the same list works inside `${…}` strings, and backtick strings have none. `"hi {name}"` does NOT insert name: the checker reports it when `name` is a variable (write `${name}`, or `\{name}` if you really want the braces). A **raw string** in backticks: `` `C:\path "quoted" ${not interpolated}` `` takes every character literally (no escapes, no interpolation, may span multiple lines).

## Collections
```
let xs = [1, 2, 3]          // list — one element type only
let m = {"a": 1, "b": 2}    // map — string keys, one value type
let fresh = {}              // empty map, filled later; its value type is pinned by the first insert
fresh["x"] = 1              // now a map<str, num> (no sentinel key needed)
m["c"] = 3                  // insert or update a key
cache[k] = ok(v)            // map values can be any type, Results and structs included
xs[0]    m["a"]             // indexing TRAPS on out-of-bounds / missing key
get(xs, 9)  get(m, "z")     // safe access → Result
has(m, "a")                 // key check → bool
push(xs, 4)  pop(xs)        // pop returns a Result
xs[0] = 7   g[i][j] = 0     // replace an existing element (traps out of range; use push to grow)
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
Params and return types are inferred. A fn that never says `return` returns the value of its last line (a bare expression, a `match`, or an `if/else`), like a block. If a function returns a value on one path, **every** path must return. Functions are generic automatically (a `fn first(xs) { return xs[0] }` works on any list type), but each individual call must be type-consistent. A param used only with `len`, `slice`, `contains`, `indexOf` or `p[i]` stays "list or str" until another use (`p + "x"`, `split(p, ",")`) or a call site settles it, so `fn f(src) { ... indexOf(src, "x") ... }` works on a str without `str(src)`. Lambdas: `x => x * 2`, `(a, b) => a + b`, `() => "hi"`, or a block body whose last line is the value (or that uses `return`); block lambdas may span lines even inside a call: `sortBy(xs, x => {` newline `let k = x.price` newline `k` newline `})`. Only named `fn`s and lambda-typed variables are callable.

**Fns can be nested.** A fn declared inside another fn reads and updates the parent's variables and params, and may call itself (it can't have expects/ensures/uses, and a module doesn't export it). Declare it below the variables it uses and above its first call: unlike a top-level fn it is visible only from its declaration down, and two nested fns can't call each other (move both to the top level and pass the shared variables in). An early bare `return` (`if has(seen, n) { return }`) makes it a fn that returns nothing, and `while true { ... return ... }` with no `break` counts as always returning:
```
fn tally(words) {
  let counts = {}
  fn bump(w) { counts[w] = if has(counts, w) { counts[w] + 1 } else { 1 } }   // updates the parent's map
  for w in words { bump(w) }
  return counts
}
```

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
In a statement match (value unused) an arm that only prints needs no value: `err(e) => print("bad: " + e)`. In a value-producing match every arm ends in a value; an arm that also prints puts the value on its own last line: `err(e) => { print(e)` newline `0 }`. Arms may `return`, `break` or `continue` in a statement match (`err(e) => continue`); inside a fn a value-producing arm or if/else branch may `return` from the function (`err(e) => { return -1 }`, which then needs no value), but `break`/`continue` can't escape a value-producing arm. `if/else` is a value too: `let size = if x > 5 { "big" } else { "small" }` (else required; each branch's last line is its value; `else if` chains work).
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
A field may hold a list of its own struct type (`struct Node { name, kids }` with `kids: [Node { name: "b", kids: [] }]` works for trees and ASTs), and an empty `[]` or `{}` in a field takes its element type from other uses.
Two structs may share a field name (`struct Node { k, kids }` and `struct Val { k, n }`): in `fn isSym(n) { return n.k == "sym" }` the calls decide which struct `n` is, so such a fn takes one struct type, and calling it with both is an error.

## JSON
A `json` value is any JSON value (object, array, string, number, bool, null). It is read-only, so every "change" builds a new one. There is no `null` keyword, and json is not a map: use `field`/`has`/`jsonKeys` on it.
- Parse: `parseJson(text)` → Result<json, str>: `match parseJson(body) { ok(j) => ...  err(e) => ... }`
- Convert: `json(value)` → json, directly from a num/str/bool/list/map/struct, no Result (it can't fail): `json(["a", "b"])`, `json(User { name: "Ada", tags: [] })`, `json(scores)`. Do not write `parseJson(toJson(x))`
- Serialize: `toJson(value)` → compact str on one line (same inputs as `json`, plus json) · `prettyJson(value)` → str indented with 2 spaces
- Read: `field(j, "key")` / `at(j, i)` → json, a **json null** when the key/index is missing or `j` is the wrong kind · `get(j, key)` → Result, for when missing is an error · `has(j, "key")` → bool (false for a json null or any non-object, never traps) · `==` compares json by value, objects in any key order · `j["key"]` / `j[0]` trap on a miss
- Test: `isNull(j)` · `truthy(j)` (false for null, false, 0, "", `[]` and `{}`; empty containers are falsy, unlike JavaScript) · `jsonType(j)` → "object"/"array"/"string"/"number"/"bool"/"null"
- Text: `str(j)` (and `print(j)`, `"${j}"`): strings as-is, numbers like `str(num)`, true/false, arrays/objects as compact JSON, and a json null as the text `"null"` (never an empty string). For empty output on a missing value write `if isNull(j) { "" } else { str(j) }`
- Walk: `jsonList(j)` → list<json> · `jsonKeys(j)` → list<str>; both plain lists, `[]` for the other kinds; object keys keep the order the document wrote them in (`"10"` stays after `"b"`), and so do `toJson`/`prettyJson` and maps passed to `json`
- Typed values: `jsonNum(j)`, `jsonStr(j)`, `jsonBool(j)` → Results (the err says what was found and where: `the JSON value at "age" is a string ("36"), not a number`)
- Edit (each returns a NEW json object, `j` is unchanged): `jsonSet(j, "key", value)` → with that key set (`value` is anything `json` accepts) · `jsonDelete(j, "key")` → without that key (no error if absent) · `jsonMerge(a, b)` → deep merge: objects merge key by key, recursively, otherwise `b` wins. A json null counts as `{}` for jsonSet/jsonDelete; any other non-object traps
- Compare json with `==`/`!=`: same kind and same value (`field(a, "n") == field(b, "n")`)
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
```
let user = field(data, "user")
let updated = jsonDelete(jsonSet(user, "age", 37), "password")   // set one key, drop another
let doc = jsonSet(data, "tags", ["x", "y"])                       // a Vow list is converted for you
let config = jsonMerge(defaults, overrides)                       // overrides win, nested objects merge
print(prettyJson(updated), toJson(doc), json(keys(scores)))
```
A fn whose params are only used with `field`/`has`/`jsonKeys`/... works on json directly.

## Contracts (optional)
```
fn withdraw(bal, amt)
  expects amt > 0 and amt <= bal
  ensures result >= 0
{ return bal - amt }
```
Contracts are checked at runtime with blame (caller vs callee). If the checker can *prove* a call always breaks an `expects` (e.g. constant arguments), it refuses to compile with a `ContractError` — fix the call site or the contract.

## Builtins
Use these instead of hand-rolled loops, decoders and parsers; every family below has its own heading. Your own `fn map(...)`, `let count = ...`, `fn log(...)`, `let json = ...` still work: a fn, `let`, param, loop variable or lambda you define with a builtin's name shadows the builtin within its scope (and only there: a `let text = ...` inside one fn leaves `text(...)` usable everywhere else). Every builtin is listed in the sections below; there are no hidden ones.

### Core
`print str num len range push pop get keys has join split abs floor round fixed min max sort sortBy reverse sum contains slice trim upper lower ok err`. `round(x, 2)` rounds half-up to 2 decimals (15.625 → 15.63), `fixed(x, 2)` gives text with exactly 2 decimals ("212.30") and `str()` prints numbers without trailing zeros (12.5, 3). `sort(xs)` orders nums or strs; `sortBy(xs, x => x.price)` orders any list by a num/str key (stable: ties keep their order). Both return a NEW list: write `xs = sort(xs)`. `and`/`or` short-circuit, so `i < len(xs) and xs[i] > 0` is safe.

### Lists (the fn is a lambda or a named fn; all return NEW values)
- `map(xs, x => x * 2)` → new list · `filter(xs, x => x > 0)` → kept items · `count(xs, x => x > 0)` → num
- `any(xs, x => x < 0)` / `all(xs, x => x > 0)` → bool (stop early; `all([], f)` is true)
- `fold(xs, 0, (acc, x) => acc + x)` → the accumulator (same type as the start value)
- `uniq(xs)` → first occurrence of each value, order kept (`==` equality, works on structs) · `values(m)` → map values in `keys(m)` order · there is no map delete: rebuild without the key (`let m2 = {}` then copy the other keys) or store a flag value
- `indexOf(xs, item)` → Result<num, str>: first position by `==`, err when absent · `contains(xs, item)` → bool · `reverse(xs)`, `slice(xs, from, to)`, `sum(xs)`

### Text and Unicode
- `replace(t, old, new)` → every occurrence, literal text: `replace("a-b-c", "-", "+")` → "a+b+c"
- `startsWith(t, p)`, `endsWith(t, s)`, `contains(t, piece)` → bool · `indexOf(t, piece)` → Result<num, str> (err when absent)
- `split(t, sep)` → list · `join(xs, sep)` → str · `lines(t)` → list (splits on newlines, drops a trailing one; `lines("")` is `[]`) · `words(t)` → split on any whitespace, no empty strings
- `trim(t)`, `upper(t)`, `lower(t)`, `slice(t, from, to)` · `t[i]` → one-unit str (traps out of range; `get(t, i)` → Result)
- `repeat(t, n)` (`repeat(t, 0)` is `""`) · `padLeft("7", 3, "0")` → "007" · `padRight(t, width, fill)`
- `len(t)`, `t[i]`, `slice`, `split(t, "")`, `padLeft` and `padRight` count UTF-16 units like JavaScript: `len("é")` is 1 but `len("😀")` is 2 and `"😀"[0]` is half a character. For whole characters:
  - `chars(t)` → list of one-character strs, one per code point: `chars("a😀")` → `["a", "😀"]`; `len(chars(t))` counts characters, `join(reverse(chars(t)), "")` reverses safely
  - `ord(t)` → code point of the first character: `ord("😀")` → 128512 (`ord("")` traps) · `chr(n)` → the character: `chr(128512)` → "😀"
  - `<`, `sort(xs)` and `sortBy` order strs by code point (`"😀" > "ｚ"`, as `ord` says), never by UTF-16 unit

### Regular expressions (patterns are JavaScript regular expressions; write them as backtick raw strings so `\d` stays `\d`)
- ``matches(s, `^\d+$`)`` → bool; searches anywhere unless you anchor with `^...$`
- ``find(s, `(\w+)=(\d+)`)`` → Result: `ok([whole, group1, group2])` (an unmatched group is `""`), `err("no match")`
- ``findAll(s, `\d+`)`` → list of every match · ``replaceAll(s, `(\w+)@`, "$1 at ")`` → str (`$1` = group 1)
- ``splitOn(s, `\s*[,;]\s*`)`` → list (groups in the pattern do not add pieces) · `words(s)` → split on any whitespace, no empty strings
- `replace(t, old, new)` stays literal text; a bad pattern literal is a compile error
- Patterns are compiled with the `u` flag: ``\p{L}`` (any letter), ``\p{Script=Greek}`` work and `.` matches a whole emoji. A pattern that is only valid without `u` (an identity escape like ``\-`` outside brackets, a lone `{`) still works as before

### URLs
- `urlEncode(t)` → str: `urlEncode("a b&c")` → "a%20b%26c" (percent-encodes everything but letters, digits and `-_.!~*'()`, as UTF-8: `urlEncode("é")` → "%C3%A9")
- `urlDecode(t)` → Result<str, str>: `urlDecode("caf%C3%A9")` → ok("café"), err on a bad `%` sequence or on escapes that are not valid UTF-8 (`%C3%28`, `%FF`), so it is a strict decoder: use it instead of decoding bytes by hand. It leaves `+` alone: for form data do `replace(t, "+", "%20")` first
- `param(query, "name")` → Result<str, str>: one field of a query string or form body, decoded (`+` is a space): `param("a=1&b=x+y", "b")` → ok("x y"), err when missing
- Build a query: `join(map(sort(keys(m)), k => urlEncode(k) + "=" + urlEncode(m[k])), "&")`

### Numbers
`int("42")` → Result, strict (optional `-` then digits; `"4.2"`, `" 5"`, `"+3"` are errs) · `isInt(x)` → bool · `sig(1234.5, 2)` → 1200 (significant digits, 1 to 21) · `abs floor ceil trunc round fixed` · `min(a, b)` / `max(a, b)` take exactly 2 numbers (for a list fold it, or `sort` and take the ends) · math, random and dates: see below

**Capabilities:** a fn that does I/O must declare it in its signature — `fn fetch(url) uses net { return httpGet(url) }`. Capabilities: `net` (httpGet, httpRequest, serve), `fs` (readFile/writeFile), `env` (env). Reading standard input (`readLine`, `readAll`) needs none. Callers of an effectful fn must declare it too; top-level code needs no declaration; declaring a capability you don't use is also an error.

## Files, stdin and HTTP
- `args()` → list<str>: only the user's arguments, never the program name
- `readLine()` → Result<str, str>: the next stdin line without its newline, err("end of input") at EOF · `readAll()` → Result<str, str>: everything left on stdin (ok("") when empty). No capability needed
- `readFile(path)` → Result<str, str> · `writeFile(path, text)` → Result<bool, str> (`uses fs`)
- `env("HOME")` → Result<str, str> (`uses env`)
- `httpGet(url)` → Result<str, str>: ok(body) for 2xx · `httpRequest(method, url, headers, body)` → Result<HttpResponse, str> (`uses net`; both below)
```
print("name?")                              // output is written before readLine blocks
match readLine() {
  ok(line) => print("hi ${trim(line)}")     // \r\n handled; works with a terminal and with `echo x | vow prog.vow`
  err(e) => print("no input: ${e}")         // "end of input" at EOF (Ctrl+D, or the pipe is drained)
}
let rest = match readAll() { ok(t) => t  err(e) => "" }   // everything left on stdin; ok("") when it is empty
```
Loop `while true { match readLine() { err(e) => break  ok(line) => ... } }` to process input line by line. In the browser playground both return an err.

`httpRequest(method, url, headers, body)` → `Result<HttpResponse, str>`, `HttpResponse { status, headers, body }`: `status` a num, `headers` a map<str, str> with lower-case names, `body` a str. Any status is an `ok` (check `r.status` yourself); only not getting a response (DNS, refused, 15 s timeout) is an err. Pass `{}` for no headers and `""` for no body (ignored for GET/HEAD). `httpGet(url)` is the short form: ok(body) for 2xx, otherwise err("GET url failed: HTTP 404 ...") with the start of the response body.
```
fn repos(user) uses net {
  let r = httpRequest("GET", "https://api.github.com/users/${user}/repos", {"User-Agent": "vow", "Accept": "application/vnd.github+json"}, "")?
  if r.status != 200 { return err("GitHub said ${r.status}: ${slice(r.body, 0, 80)}") }
  print(r.headers["content-type"])
  return parseJson(r.body)
}
fn post(url, data) uses net {
  let r = httpRequest("POST", url, {"Content-Type": "application/json"}, toJson(data))?
  return ok(r.status)
}
```
Both obey `--sandbox --allow net=host` by host, like httpGet.

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
- A file can only read the fields of structs it declares or that a module it imports declares: a report.vow that reads `c.terms` from a struct declared in rules.vow must `import "./rules.vow" as rules`, even if it calls none of its fns.
- `import "./x.vow" as name` lines come first in a file. The path is a literal starting with `./` or `../`, relative to the importing file; `as name` is required and the name can't clash with a builtin or anything declared in that file.
- Use a module's fns and structs through its name: `geo.norm(p)`, `geo.Point { x: 1, y: 2 }`, `let f = geo.norm`; names from different files never collide.
- A module exports its top-level `fn`s and `struct`s except `_private` names and nested fns, and may contain only `fn`, `struct` and `import` at the top level (no `let`, `print` or other code; only the file you run has top-level code).
- A module sees its own names, the modules it imports, and builtins; never the main file's names. Each file is loaded once however often it is imported; import cycles are an error.
- Generics, contracts and capabilities work across files as in one file: a caller of `geo.fetch` declares `uses net` if `fetch` does, and `--sandbox` sees every capability in every imported file before anything runs.
- Errors name the file (`→ geometry.vow, line 2, col 5`; call stacks show `at fn geometry.norm (geometry.vow, line 2)`); structs print by their own name (`Point { x: 3, y: 4 }`).

## Math, random, dates
- `sqrt(x)`, `pow(x, y)`, `exp(x)`, `ln(x)` (natural log; `log(x)` is the same), `sin cos tan(x)` (radians), `atan2(y, x)`, `ceil(x)`, `trunc(x)` (toward 0), `pi()` → num. There is no `e()` (`e` is the usual err name): use `exp(1)`. A result with no real value traps like division by zero: `sqrt(-1)`, `ln(0)`, `pow(-8, 0.5)`, `pow(0, -1)`, `exp(1000)`. Guard the input first.
- `random()` → num in [0, 1). `randomInt(lo, hi)` → whole number from lo to hi, **both included** (traps if lo > hi or a bound isn't whole). `node cli.js --seed 42 main.vow` (or `VOW_SEED=42`) makes the sequence repeatable.
- Times are nums: milliseconds since 1970-01-01T00:00:00Z, **always UTC**. `now()` → current time. `dateParts(ms)` → `DateParts { year, month (1-12), day, hour, minute, second, weekday (0=Sunday..6) }`. `isoDate(ms)` → `"2026-10-08T14:03:00Z"`. `parseDate(s)` → Result<num, str>: accepts `2026-10-08`, `2026-10-08T14:03`, `2026-10-08T14:03:00`, optional `.sss`, and `Z` or `+02:00`; no zone means UTC; impossible dates (`2026-02-30`) are errs. `daysBetween(a, b)` → UTC calendar days from a to b (negative if b is earlier; time of day ignored). One day later: `ms + 86400000`.

## Program structure
A Vow file runs its top-level statements from top to bottom; there is no implicit `main`. `fn`s are hoisted (a call may come before the declaration), but top-level `let`s are not: a fn may only use a top-level variable declared ABOVE it, so put shared state (`let cache = {}`, `let pos = 0`, `let config = ...`) at the top of the file, before the fns that use it (a fn can read and reassign it: `pos = pos + 1`) (the checker says `'x' doesn't exist yet` otherwise). Write the program at the top level; helper `fn`s can be declared anywhere, including inside another fn (see Functions). A bare `return` at the top level ends the program early (no value allowed there).

## Testing
A file carries its own tests: top-level `test "name" { ... }` blocks. They never run with `node cli.js main.vow`, are type-checked with the rest of the file, are skipped by files that import this one, and run with `node cli.js test main.vow`: one line per test, a summary, exit code 1 if any fails (`--filter word` runs only the tests whose name contains `word`).
```
fn toF(c) { return c * 9 / 5 + 32 }
for a in args() {
  match num(a) {
    ok(c) => print("${c}C = ${toF(c)}F")
    err(e) => print("error: not a number: ${a}")
  }
}

test "toF" { expectEq(toF(100), 212) }
test "cli: converts each argument" { expectEq(run(["100", "0"], ""), "100C = 212F\n0C = 32F\n") }
test "cli: bad number prints the spec's error line" { expectEq(run(["abc"], ""), "error: not a number: abc\n") }
```
- `expect(cond)` · `expectEq(actual, expected)` (any type, `==` equality; a failure prints both values and, for text, the first line that differs) · `expectErr(result)` (passes when the Result is an err; `expectEq(r, ok(3))` / `expectEq(r, err("msg"))` check the exact value).
- `run(args, stdin)` → str: runs this file's top-level code from scratch, with `args()` returning that list and `readLine()`/`readAll()` reading that text, and returns everything it printed, one `\n` after each printed line. That is the way to test a whole CLI program against a spec.
- A test sees the file's fns and structs, never its top-level variables (only `run` executes the top-level code). `?` is not allowed in a test: compare the Result. A trap in a test, or inside `run`, fails that test with the trap's message. Each test starts from a fresh state.

## Web servers
```
fn handle(req) {                      // req: map<str, str> with "method", "path", "query", "body", "authorization"
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
Responses: `html(body)`, `text(body)`, `respond(status, contentType, body)`, `redirect("/path")` (same-site paths only). Form posts arrive url-encoded in `req["body"]`: read fields with `param(req["body"], "field")`. Password protection (HTTP Basic auth): `checkLogin(req["authorization"], password)` → bool, true when the browser sent that password (any username; constant-time compare); `askLogin("realm")` → a 401 response that makes the browser show its login box: `if not checkLogin(req["authorization"], pw) { return askLogin("admin") }`. `serve` needs `uses net` when called inside a fn; a handler that calls httpGet needs `uses net` too. Top-level variables persist between requests (in memory). Server binds 127.0.0.1; set VOW_HOST=0.0.0.0 to expose it.

## Common mistakes
- Putting different value types in one map (`{"name": "x", "qty": 3}`): a map holds ONE value type. Use a struct for records.
- Using `?` at top level (only valid inside a fn) — use `match` instead.
- `return` inside a value-producing match arm block to give the ARM its value: the block's last line is the arm's value. A `return` there returns from the whole fn (useful for `err(e) => { return err(...) }`).
- Using `if` as a value without an `else` (there would be no value when the condition is false).
- Forgetting an `err` arm, or ignoring a Result entirely.
- `&&`/`||`/`!` instead of `and`/`or`/`not`; semicolons (just use newlines).
- Writing `"{x}"` to insert x: interpolation is `"${x}"`; plain braces are literal text.
- Indexing (`xs[i]`, `m[k]`, `j[k]`) when the key might be missing — use `get(...)`, or `field(j, k)` for json.
- Writing your own truthiness / value-to-text helpers for json: use `truthy(j)` and `str(j)`.
- Hand-writing percent-decoding, UTF-8 handling, JSON building or code-point sorting: `urlDecode`/`urlEncode`, `chars`/`ord`/`chr`, `json`/`jsonSet`/`jsonDelete`, and `sort` (by code point) already do it.
- Declaring a top-level `let` below a fn that uses it: move the let above the fn.
- Two statements on one line inside a block (`{ print(e)  break }`): each statement goes on its own line.

Type-check only: `node cli.js --check program.vow`. Heavy but legitimate work that trips the step cap: `--max-steps 500000000` (`0` = no limit). Every error message tells you what's wrong, shows the line, and suggests the likely fix — read it and apply the fix.
