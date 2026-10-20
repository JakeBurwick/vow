// Dev smoke tests (node test.js). The real product is the browser playground.
import { parse } from './lang/parser.js';
import { check } from './lang/checker.js';
import { createRun } from './lang/interp.js';
import { createCompiledRun } from './lang/runtime.js';
import { runTests, formatReport } from './lang/testing.js';
import { formatDiag, VowError } from './lang/diagnostics.js';
import { EXAMPLES } from './examples.js';
import { loadProgram, nodeHost } from './lang/modules.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function runProgram(src0, load) {
  const lines = [];
  let src = src0;
  try {
    let ast;
    if (load) ({ src, ast } = load()); else ast = parse(src);
    check(src, ast);
    // seed 1: random()/randomInt() outputs are exact (compile-test uses the same seed)
    const { gen } = createRun(src, ast, { out: (s) => lines.push(s), seed: 1 });
    for (const _ of gen) { /* drain */ }
    return { ok: true, output: lines.join('\n') };
  } catch (e) {
    if (e instanceof VowError) return { ok: false, output: lines.join('\n'), error: formatDiag(src, e.diag) };
    throw e;
  }
}

let failures = 0;
for (const ex of EXAMPLES) {
  const res = runProgram(ex.code);
  const expectError = ex.id === 'broken' || ex.id === 'contracts';
  console.log(`\n=== ${ex.name} ===`);
  if (res.output) console.log(res.output);
  if (res.error) console.log(res.error);
  if (ex.id === 'broken' && res.ok) { console.log('!! expected a type error'); failures++; }
  if (ex.id === 'contracts' && res.ok) { console.log('!! expected a contract violation'); failures++; }
  if (!expectError && !res.ok) { console.log('!! unexpected failure'); failures++; }
}

// extra checks
const extra = [
  ['unhandled result', 'num("42")\n', false],
  ['null-free index trap', 'let m = {"a": 1}\nprint(m["b"])\n', false],
  ['div by zero', 'let x = 10 / 0\n', false],
  ['text toolkit', 'print(replace("a-b", "-", "+") + padLeft("7", 3, "0"))\nprint(startsWith("ab", "a") and endsWith("ab", "b"))\nprint(len(lines("x\\ny\\n")))\nmatch indexOf("abc", "c") {\n  ok(i) => print(i)\n  err(e) => print(e)\n}\n', true],
  ['repeat with a bad count traps', 'print(repeat("a", 0 - 1))\n', false],
  ['if/else as a value with else-if chain', 'let x = 7\nlet g = if x >= 9 { "A" } else if x >= 7 { "B" } else { "C" }\nprint(g)\n', true],
  ['if as a value without else is rejected', 'let v = if true { 1 }\n', false],
  ['web: response builders + param + escape', 'print(html("<b>"))\nprint(redirect("/"))\nprint(escape("<a>"))\nprint(fixed(2.5, 2))\nmatch param("a=1&b=x%20y", "b") {\n  ok(v) => print(v)\n  err(e) => print(e)\n}\n', true],
  ['web: redirect off-site traps', 'print(redirect("https://evil.com"))\n', false],
  ['assignment arm in statement match', 'let x = 0\nmatch num("4") {\n  ok(n) => x = n\n  err(e) => {}\n}\nprint(x)\n', true],
  ['nested match as last line of a value arm', 'let v = match num("3") {\n  ok(n) => {\n    match num("4") {\n      ok(m) => n + m\n      err(e) => n\n    }\n  }\n  err(e) => 0\n}\nprint(v)\n', true],
  ['string indexing gives a str', 'let s = "hey"\nprint(s[1] + s[2])\n', true],
  ['generic helper indexes list or str', 'fn lastOf(xs) { return xs[len(xs) - 1] }\nprint(lastOf("abc"))\nprint(lastOf([1, 2]))\n', true],
  ['len+index rejects a map', 'fn f(xs) { return len(xs) + xs[0] }\nprint(f({"a": 1}))\n', false],
  ['string index out of range traps', 'print("ab"[5])\n', false],
  ['constrained generics: < on unknowns works for strs', 'fn lt(a, b) { return a[0] < b[0] }\nprint(lt(["a"], ["b"]))\nprint(lt([2], [1]))\n', true],
  ['constrained generics: + rejects lists', 'fn add(a, b) { return a + b }\nprint(add([1], [2]))\n', false],
  ['constrained generics: len over list and str', 'fn count(xs) { return len(xs) }\nprint(count([1, 2]))\nprint(count("abc"))\n', true],
  ['constrained generics: graph[node] is a map lookup', 'fn ns(g, n) { return sort(g[n]) }\nlet g = {"a": ["c", "b"]}\nfor x in ns(g, "a") {\n  if x == "b" { print(x) }\n}\n', true],
  ['constrained generics: sort of structs rejected', 'struct P { a }\nfn s(xs) { return sort(xs) }\nprint(s([P { a: 1 }]))\n', false],
  ['constrained generics: indexing a num rejected', 'fn at(c, k) { return c[k] }\nprint(at(5, 1))\n', false],
  ['round half-up', 'print(round(15.625, 2))\nprint(round(1.005, 2))\n', true],
  ['sortBy is stable by key', 'let xs = sortBy(["bb", "a", "cc", "d"], w => len(w))\nprint(join(xs, " "))\n', true],
  ['shared field resolved by a later unique field', 'struct A { n, a }\nstruct B { n, b }\nfn f(x) {\n  let k = x.n\n  return k + x.a\n}\nprint(f(A { n: 1, a: 2 }))\n', true],
  ['raw string keeps braces', 'let j = `{"a": [1]}`\nprint(j)\nmatch parseJson(j) {\n  ok(v) => print(jsonType(v))\n  err(e) => print(e)\n}\n', true],
  ['bare continue arm in loop', 'for x in ["1", "a"] {\n  match num(x) {\n    ok(n) => print(n)\n    err(e) => continue\n  }\n}\n', true],
  ['infinite recursion', 'fn f(n) { return f(n) }\nprint(f(1))\n', false],
  ['undefined var suggestion', 'let count = 3\nprint(cout)\n', false],
  ['match exhaustive', 'match num("1") { ok(v) => print(v) }\n', false],
  ['type change', 'let x = 5\nx = "five"\n', false],
  ['while + break', 'let i = 0\nwhile true {\n  i = i + 1\n  if i > 3 { break }\n}\nprint(i)\n', true],
  ['match as expr', 'let v = match num("9") { ok(n) => n err(e) => 0 }\nprint(v * 2)\n', true],
  ['string ops', 'print(join(split("a,b,c", ","), "-"))\nprint(len("hello"))\n', true],
  ['nested data', 'let grid = [[1,2],[3,4]]\nprint(grid[1][0])\ngrid[0][1] = 9\nprint(grid)\n', true],
  ['? propagation ok+err', `fn area(w, h) {
  let a = num(w)?
  let b = num(h)?
  return ok(a * b)
}
match area("8", "4") { ok(v) => print(v) err(e) => print("E " + e) }
match area("8", "x") { ok(v) => print(v) err(e) => print("E " + e) }
`, true],
  ['? at top level rejected', 'let x = num("4")?\nprint(x)\n', false],
  ['? on non-Result rejected', 'fn f() {\n  let x = 5?\n  return ok(x)\n}\nprint("no")\n', false],
  ['? then bare return rejected', 'fn f(s) {\n  let n = num(s)?\n  return n\n}\nprint("no")\n', false],
  ['new builtins', 'print(sort([3,1,2]))\nprint(sort(["b","a"]))\nprint(reverse([1,2,3]))\nprint(contains("hello", "ell"))\nprint(contains([1,2,3], 4))\nprint(slice([1,2,3,4], 1, 3))\nprint(slice("playground", 0, 4))\nprint(upper(trim("  hi ")))\nprint(lower("LOUD"))\nprint(sum([1,2,3,4]))\n', true],
  ['structs basic', `struct Point { x, y }
let p = Point { x: 3, y: 4 }
print(p)
print(p.x + p.y)
p.x = 10
print(p.x)
print(p == Point { x: 10, y: 4 })
`, true],
  ['struct param inference', `struct Point { x, y }
fn manhattan(p) {
  return abs(p.x) + abs(p.y)
}
print(manhattan(Point { x: -3, y: 4 }))
`, true],
  ['struct in list + match', `struct User { name, age }
fn find(users, name) {
  for u in users {
    if u.name == name { return ok(u) }
  }
  return err("no user named " + name)
}
let users = [User { name: "ada", age: 36 }, User { name: "alan", age: 41 }]
match find(users, "alan") { ok(u) => print(u.age) err(e) => print(e) }
match find(users, "grace") { ok(u) => print(u.age) err(e) => print(e) }
`, true],
  ['struct missing field rejected', 'struct Point { x, y }\nlet p = Point { x: 1 }\n', false],
  ['struct unknown field rejected', 'struct Point { x, y }\nlet p = Point { x: 1, y: 2 }\nprint(p.z)\n', false],
  ['struct field type pinned', 'struct Point { x, y }\nlet a = Point { x: 1, y: 2 }\nlet b = Point { x: "one", y: 2 }\n', false],
  ['field on non-struct rejected', 'struct Point { x, y }\nlet m = {"x": 1}\nprint(m.x)\n', false],
  ['shared field settled by the call site', 'struct A { x }\nstruct B { x }\nfn f(v) { return v.x }\nprint(f(A { x: 1 }))\n', true],
  ['shared field nobody settles is ambiguous', 'struct A { x }\nstruct B { x }\nfn f(v) { return v.x }\nprint("hi")\n', false],
  ['shared-field fn called with two structs rejected', 'struct A { x }\nstruct B { x }\nfn f(v) { return v.x }\nprint(f(A { x: 1 }))\nprint(f(B { x: 2 }))\n', false],
  ['generic fn at two types', `fn id(x) { return x }
fn first(xs) { return xs[0] }
print(id(5) + 1)
print(id("five"))
print(first([10, 20]))
print(first(["a", "b"]))
`, true],
  ['higher-order map at two types', `fn map(xs, f) {
  let out = []
  for x in xs { push(out, f(x)) }
  return out
}
fn double(n) { return n * 2 }
fn shout(s) { return upper(s) }
print(map([1, 2, 3], double))
print(map(["hi", "yo"], shout))
`, true],
  ['generic filter', `fn filter(xs, keep) {
  let out = []
  for x in xs { if keep(x) { push(out, x) } }
  return out
}
fn big(n) { return n > 2 }
print(filter([1, 2, 3, 4], big))
`, true],
  ['generic still consistent per call', 'fn pair(x, y) { return [x, y] }\nprint(pair(1, "a"))\n', false],
  ['struct fields stay pinned across generic fn', `struct Box { v }
fn put(b, x) { b.v = x }
let b = Box { v: 1 }
put(b, 2)
put(b, "nope")
`, false],
  ['generic fn must still always return', 'fn maybe(x) { if x > 0 { return x } }\nprint(maybe(1))\n', false],
  ['generic with contract', `fn first(xs)
  expects len(xs) > 0
{
  return xs[0]
}
print(first([7]))
print(first(["only"]))
`, true],
  ['struct multiline literal', `struct Config {
  host
  port
}
let c = Config {
  host: "localhost",
  port: 8923
}
print(c.host + ":" + str(c.port))
`, true],
  ['string interpolation', 'let name = "Ada"\nlet n = 3\nprint("hi ${name}, ${n} + 1 is ${n + 1}")\n', true],
  ['interpolation nested braces + strings', 'let m = {"k": 7}\nprint("value: ${m["k"]} and ${join(["a", "b"], ", ")}")\n', true],
  ['value match on str with _', 'let t = "number"\nlet k = match t { "string" => 1  "number" => 2  _ => 0 }\nprint(k)\n', true],
  ['value match on bool is exhaustive with true+false', 'print(match 1 < 2 { true => "y"  false => "n" })\n', true],
  ['value match all-arms-return counts as returning', 'fn f(n) {\n  match n {\n    0 => { return "z" }\n    _ => { return "nz" }\n  }\n}\nprint(f(0))\n', true],
  ['value match without _ rejected', 'print(match "x" { "a" => 1 })\n', false],
  ['return inside a value-arm block exits the fn', `fn f(s) {
  let v = match num(s) {
    ok(n) => { return n }
    err(e) => 0
  }
  return v
}
print(f("1"))
`, true],
  ['conditional return inside a value arm, value on the last line', 'fn g(t) {\n  let k = match t {\n    "a" => 1\n    _ => {\n      if t == "x" { return 9 }\n      2\n    }\n  }\n  return k\n}\nprint(g("b"))\n', true],
  ['bare top-level return ends the program', 'print("a")\nif true { return }\nprint("b")\n', true],
  ['multi-line block lambda inside call args', 'print(sortBy([3, 1, 2], x => {\n  let k = 0 - x\n  k\n}))\n', true],
  ['block lambda last line is its value', 'let f = x => {\n  let d = x * 2\n  d\n}\nprint(f(4) + 1)\n', true],
  ['multi-line map literal inside call args', 'print(len(keys({\n  "a": 1,\n  "b": 2\n})))\n', true],
  ['block lambda ending in a match uses it as the value', 'print(sortBy(["2", "x", "1"], s => {\n  match num(s) {\n    ok(n) => n\n    err(e) => 99\n  }\n}))\n', true],
  ['side-effect lambda ending in a statement match still fine', 'let f = s => {\n  match num(s) {\n    ok(n) => print(n)\n    err(e) => print(e)\n  }\n}\nf("3")\n', true],
  ['jsonKeys returns a plain list, [] for non-objects', 'match parseJson(`{"b":1,"a":2}`) {\n  ok(j) => {\n    print(sort(jsonKeys(j)))\n    print(len(jsonList(j)))\n  }\n  err(e) => print(e)\n}\n', true],
  ['nested fn: lifted helper, recursion, closure over parent local', 'fn solve(rows, col) {\n  fn sq(x) { return x * x }\n  fn fact(n) {\n    if n <= 1 { return 1 }\n    return n * fact(n - 1)\n  }\n  fn pick(r) { return r[col] }\n  let out = []\n  for r in rows { push(out, sq(pick(r)) + fact(3)) }\n  return out\n}\nprint(solve([[1, 2], [3, 4]], 1))\n', true],
  ['nested fns with the same name in two parents', 'fn a() {\n  fn h(x) { return x + 1 }\n  return h(1)\n}\nfn b() {\n  fn h(x) { return x + 2 }\n  return h(1)\n}\nprint(a() + b())\n', true],
  ['round with one argument rounds to a whole number', 'print(round(2.5) + round(1.25, 1))\n', true],
  ['fn whose last line is a match returns its value', 'fn isNum(s) {\n  match num(s) {\n    ok(n) => true\n    err(e) => false\n  }\n}\nlet a = isNum("3")\nprint(a)\n', true],
  ['fn whose last line is an expression returns it', 'fn dbl(x) {\n  let d = x * 2\n  d\n}\nprint(dbl(4) + 1)\n', true],
  ['return inside an if/else used as a value', 'fn safeDiv(a, b) {\n  let q = if b == 0 { return err("zero") } else { a / b }\n  return ok(q)\n}\nprint(safeDiv(1, 0))\n', true],
  ['nested tail value: if branch ending in a match inside a sort lambda', 'let rows = [["b", "2"], ["a", "10"]]\nprint(sortBy(rows, row => {\n  if 1 < len(row) {\n    match num(row[1]) {\n      ok(n) => if true { 0 - n } else { n }\n      err(e) => 0\n    }\n  } else {\n    0\n  }\n}))\n', true],
  ['json get and index ignore inherited keys like constructor', 'match parseJson(`{"a":1}`) {\n  ok(j) => print(get(j, "constructor"))\n  err(e) => print(e)\n}\n', true],
  ['lone { before closing quote is literal', 'let s = "{" + "a" + "}"\nprint(s)\n', true],
  ['{ before backslash is literal (JSON in a str)', 'let n = 3\nprint("{\\"n\\":${n}}")\n', true],
  ['interpolation literal brace escape', 'print("set: {1, 2}")\n', true],
  ['interpolation of unit rejected', 'print("x is ${print(1)}")\n', false],
  ['unterminated interpolation', 'print("oops ${1 + 2")\n', false],
  ['lambda basic + closure', `let base = 100
let add = (a, b) => a + b
let addBase = x => x + base
print(add(2, 3))
print(addBase(5))
`, true],
  ['lambda block body', `let fact = n => {
  let out = 1
  for i in range(1, n + 1) { out = out * i }
  return out
}
print(fact(5))
`, true],
  ['lambda passed to fn', `fn map(xs, f) {
  let out = []
  for x in xs { push(out, f(x)) }
  return out
}
print(map([1, 2, 3], x => x * 10))
print(map(["a", "b"], s => upper(s)))
`, true],
  ['lambda type errors caught', 'let double = x => x * 2\nprint(double("nope"))\n', false],
  ['lambda keeps one type', 'let f = x => x + 1\nprint(f(1))\nprint(f("a"))\n', false],
  ['zero-param lambda', 'let greet = () => "hello"\nprint(greet())\n', true],
  ['lambda must always return', 'let f = x => {\n  if x > 0 { return x }\n}\nprint(f(1))\n', false],
  ['io builtins stubbed outside the CLI', `match readFile("nope.txt") { ok(t) => print(t) err(e) => print("no fs: " + e) }
print(len(args()))
`, true],
  ['json round-trip via struct', `struct User { name, age, active }
let body = toJson(User { name: "Ada", age: 36, active: true })
print(body)
fn nameOf(s) {
  let j = parseJson(s)?
  return jsonStr(get(j, "name")?)
}
match nameOf(body) { ok(n) => print(n) err(e) => print("E: " + e) }
`, true],
  ['json literal with escaped braces', `match parseJson("{\\"a\\": [1, 2, 3]}") {
  ok(j) => print(jsonType(j))
  err(e) => print(e)
}
`, true],
  ['json missing key + type mismatch are errs', `fn asStr(s, key) {
  let j = parseJson(s)?
  let v = get(j, key)?
  return jsonStr(v)
}
let body = "{\\"n\\": 5}"
match asStr(body, "missing") { ok(s) => print(s) err(e) => print("miss: \${e}") }
match asStr(body, "n") { ok(s) => print(s) err(e) => print("mismatch: \${e}") }
`, true],
  ['json array iteration', `fn total(s) {
  let j = parseJson(s)?
  let items = jsonList(j)
  let out = 0
  for item in items {
    out = out + jsonNum(item)?
  }
  return ok(out)
}
match total("[1, 2, 3, 4]") { ok(n) => print(n) err(e) => print(e) }
`, true],
  ['json index traps with repair prompt', `match parseJson("{\\"a\\": 1}") {
  ok(j) => print(j["nope"])
  err(e) => print(e)
}
`, false],
  ['json is read-only', `match parseJson("{\\"a\\": 1}") {
  ok(j) => { j["a"] = 2 }
  err(e) => print(e)
}
`, false],
  ['toJson of result rejected statically', 'print(toJson(num("4")))\n', false],
  ['toJson of map and list', 'print(toJson({"a": 1, "b": 2}))\nprint(toJson([true, false]))\n', true],
  ['json equality + keys + nested index', `fn compare(sa, sb) {
  let j1 = parseJson(sa)?
  let j2 = parseJson(sb)?
  print(j1 == j2)
  let ks = jsonKeys(j1)
  print(ks)
  print(j1["x"][1]["y"])
  return ok(true)
}
let s = "{\\"x\\": [1, {\\"y\\": 2}]}"
match compare(s, s) { ok(v) => print("done") err(e) => print(e) }
`, true],
  ['parse error is an err value', 'match parseJson("not json") { ok(j) => print("?") err(e) => print("bad: ${e}") }\n', true],
  // v0.7 static contract proofs
  ['prover: literal expects violation refuted', `fn root(n) expects n >= 0 { return n }
print(root(-4))
`, false],
  ['prover: const propagation refutes expects', `fn half(n) expects n >= 0 { return n / 2 }
let x = 5
print(half(x - 10))
`, false],
  ['prover: fn breaks its own ensures', `fn bad() ensures result > 0 { return 0 }
print(bad())
`, false],
  ['prover: const div by zero caught statically', 'let z = 0\nprint(10 / z)\n', false],
  ['prover: if-guard refinement proves call safe', `fn recip(d) expects d != 0 { return 1 / d }
fn safe(n) {
  if n > 0 { return recip(n) }
  return 0
}
print(safe(5))
print(safe(0))
`, true],
  ['prover: ensures chains into caller facts', `fn dist(n) ensures result >= 0 {
  if n < 0 { return 0 - n }
  return n
}
fn root(n) expects n >= 0 { return n }
print(root(dist(-9)))
`, true],
  ['prover: for-range binder satisfies expects', `fn root(n) expects n >= 0 { return n }
for i in range(0, 5) { print(root(i)) }
`, true],
  ['prover: unknown values stay quiet', `fn root(n) expects n >= 0 { return n }
fn use(n) { return root(n) }
print(use(16))
`, true],
  ['prover: mutation in loop kills stale facts', `fn root(n) expects n >= 0 { return n }
let x = 5
let i = 0
while i < 3 {
  x = x - 10
  i = i + 1
}
print(root(x + 100))
`, true],
  // v0.8 capability-scoped effects
  ['effects: undeclared net rejected', `fn fetch(url) {
  return httpGet(url)
}
match fetch("http://x") { ok(b) => print(b) err(e) => print(e) }
`, false],
  ['effects: declared net passes', `fn fetch(url) uses net {
  return httpGet(url)
}
match fetch("http://x") { ok(b) => print("got") err(e) => print(e) }
`, true],
  ['effects: transitive use must be declared', `fn fetch(url) uses net {
  return httpGet(url)
}
fn report(url) {
  return fetch(url)
}
match report("http://x") { ok(b) => print(b) err(e) => print(e) }
`, false],
  ['effects: declared but unused rejected', `fn pure(a) uses fs {
  return a + 1
}
print(pure(1))
`, false],
  ['effects: unknown capability rejected', `fn f(p) uses internet {
  return httpGet(p)
}
match f("x") { ok(b) => print(b) err(e) => print(e) }
`, false],
  ['effects: lambda charges enclosing fn', `fn sneak(u) {
  let g = () => httpGet(u)
  return g()
}
match sneak("http://x") { ok(b) => print(b) err(e) => print(e) }
`, false],
  ['effects: fn passed as value charges', `fn fetch(url) uses net {
  return httpGet(url)
}
fn router(u) {
  let h = fetch
  return h(u)
}
match router("http://x") { ok(b) => print(b) err(e) => print(e) }
`, false],
  ['effects: top level needs no declaration', `match env("HOME") { ok(v) => print("have home") err(e) => print(e) }
`, true],
  ['v0.9: block arm in expression match produces last-line value', `let v = match num("12") {
  ok(n) => {
    let d = n * 2
    print("doubling")
    d
  }
  err(e) => 0 - 1
}
print(v)
`, true],
  ['v0.9: block arm unifies with expression arm', `let v = match num("x") {
  ok(n) => n
  err(e) => {
    print("fell back")
    0
  }
}
print(v)
`, true],
  ['v0.9: block arm type mismatch rejected', `let v = match num("7") {
  ok(n) => { "n = \${n}" }
  err(e) => 0
}
print(v)
`, false],
  ['v0.9: loop with break inside block arm is fine', `let total = match ok([1, 2, 3]) {
  ok(xs) => {
    let t = 0
    for x in xs {
      if x == 99 { break }
      t = t + x
    }
    t
  }
  err(e) => 0
}
print(total)
`, true],
  // built-in tests: test blocks parse and type-check, and a normal run never enters them
  ['test blocks parse and are skipped by a normal run', 'fn sq(n) { return n * n }\nprint(sq(3))\ntest "sq" {\n  expectEq(sq(2), 4)\n  expect(false)\n}\ntest "cli" { expectEq(run(["x"], "in"), "9\\n") }\n', true],
  ['expect outside a test block is rejected', 'expect(1 == 1)\n', false],
  ['a test block inside a fn is rejected', 'fn f() {\n  test "inner" { expect(true) }\n  return 1\n}\nprint(f())\n', false],
  ['a type error inside a test block is reported', 'fn sq(n) { return n * n }\ntest "t" {\n  let x = sq(2)\n  x = "four"\n}\n', false],
  ['a test calling a fn with the wrong type is reported', 'fn sq(n) { return n * n }\ntest "t" { expectEq(sq("2"), 4) }\n', false],
];

for (const [name, src, shouldPass] of extra) {
  const res = runProgram(src);
  const pass = res.ok === shouldPass;
  console.log(`\n=== extra: ${name} — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (res.output) console.log(res.output);
  if (res.error) console.log(res.error);
  if (!pass) failures++;
}

// Diagnostic-quality tests: the program must fail AND the error must contain
// the repair hint — these errors are Vow's product surface for agents.
const diagTests = [
  ['diag: prover sees inside if/else values', 'fn f(x) {\n  let y = if x > 0 { 10 / 0 } else { 1 }\n  return y\n}\nprint(f(1))\n', 'division by zero'],
  ['diag: discarded sort says assign it back', 'let xs = [2, 1]\nsort(xs)\n', 'xs = sort(xs)'],
  ['diag: len on str param infers str', 'fn pad(s) {\n  let o = s\n  while len(o) < 3 { o = o + "." }\n  return o\n}\nprint(len(5))\n', 'but this is a num'],
  ['diag: shared field still ambiguous when nothing pins it', 'struct A { n, a }\nstruct B { n, b }\nfn f(x) { return x.n }\n', 'is ambiguous here'],
  ['diag: uncalled main is an error', 'fn main() {\n  print(1)\n}\n', 'never called'],
  ['diag: mixed map suggests struct', 'let m = {"a": 1, "b": "x"}\n', 'declare a struct'],
  ['diag: serve handler must return a response', 'fn h(req) { return "hi" }\nmatch serve(8080, h) {\n  ok(v) => {}\n  err(e) => print(e)\n}\n', 'returns a response'],
  ['diag: serve outside top level needs uses net', 'fn h(req) { return text("x") }\nfn start() {\n  match serve(8080, h) {\n    ok(v) => {}\n    err(e) => print(e)\n  }\n}\nstart()\n', 'net'],
  ['diag: bad code inside ${} says how to write a literal ${', 'let c = "${a: 1}"\n', 'escape the dollar: \\${'],
  ['diag: str subject with ok/err suggests literal patterns', 'let s = "q"\nmatch s { ok(v) => print(v)  err(e) => print(e) }\n', '"a" => ...'],
  ['diag: missing _ says add a catch-all', 'print(match "x" { "a" => 1 })\n', '_ => ...'],
  ['diag: ? on jsonKeys says it is a plain list now', 'fn f(j) {\n  let ks = jsonKeys(j)?\n  return ok(ks)\n}\n', 'drop the ?'],
  ['diag: old-style {name} with name in scope', 'let name = "Ada"\nprint("hi {name}")\n', '"{name}" is literal text in Vow; to insert the value write ${name}'],
  ['diag: old-style {param} inside a fn', 'fn greet(who) { return "hi {who}!" }\nprint(greet("x"))\n', 'Likely fix: "hi ${who}!"'],
  ['diag: $ outside a string', 'let x = $5\n', 'only means something inside a string'],
  ['diag: unterminated interpolation points at ${', 'print("hi ${name', 'closing "}" never arrives'],
  ['diag: top-level return with a value says print then return', 'return 5\n', 'then return'],
  ['diag: value-arm block must end with expression', `let v = match num("1") {
  ok(n) => { let x = n }
  err(e) => 0
}
print(v)
`, "block's last line"],
  ['diag: escaping break in value-arm block', `while true {
  let v = match num("1") {
    ok(n) => { break }
    err(e) => 0
  }
  print(v)
}
`, "'break' would jump out"],
  ['diag: ok() suggests ok(true)', `fn f() {
  return ok()
}
match f() { ok(v) => print(v) err(e) => print(e) }
`, 'ok(true)'],
  // standard library: regex, numbers, higher-order list builtins
  ["invalid regex literal is a compile-time error", "print(matches(\"a\", `(ab`))\n", "invalid regular expression in matches()"],
  ["invalid regex literal in replaceAll", "print(replaceAll(\"a\", `[a-`, \"b\"))\n", "backtick raw string"],
  ["invalid runtime regex traps", "let p = \"(\" + \"x\"\nprint(findAll(\"a\", p))\n", "invalid regular expression: \"(x\""],
  ["regex escape in a quoted string points to raw strings", "print(matches(\"a1\", \"\\d\"))\n", "write it as a backtick raw string"],
  ["matches on a num says convert", "print(matches(5, `5`))\n", "matches(str(5), ...)"],
  ["ignored find Result", "find(\"a\", `a`)\n", "this Result is ignored"],
  ["words on a list", "print(words([\"a\"]))\n", "words() takes a str"],
  ["chars on a num", "print(chars(5))\n", "chars() takes a str"],
  ["chars on a list says it is already a list", "print(chars([\"a\"]))\n", "already a list"],
  ["json() of a Result is rejected at check time", "print(json(num(\"1\")))\n", "json() can't convert a Result"],
  ["json() of a function is rejected", "print(json(x => x))\n", "json() can't convert a function"],
  ["json() of JSON-looking text points at parseJson", "print(json(`{\"a\": 1}`))\n", "use parseJson(`{\"a\": 1}`)"],
  ["json() of a list of Results traps at runtime", "print(json([num(\"1\")]))\n", "json() can't serialize ok(1)"],
  ["jsonDelete key must be a str", "let j = json({\"a\": 1})\nprint(jsonDelete(j, 0))\n", "json objects have string keys"],
  ["jsonDelete on a json array traps with the kind found", "print(jsonDelete(json([1]), \"a\"))\n", "jsonDelete() needs a JSON object, but this JSON value is an array ([1])"],
  ["jsonDelete on a non-json value", "print(jsonDelete({\"a\": 1}, \"a\"))\n", "jsonDelete()"],
  ["discarded jsonDelete says use the value", "let j = json({\"a\": 1})\njsonDelete(j, \"a\")\n", "the result of jsonDelete(...) is thrown away"],
  ["a json param with a map argument suggests json()", "fn f(j) { return jsonKeys(j) }\nprint(f({\"a\": 1}))\n", "convert: json({\"a\": 1})"],
  ["sig digits literal out of range", "print(sig(1.5, 0))\n", "from 1 to 21"],
  ["sig digits out of range at runtime", "let d = 22\nprint(sig(1.5, d))\n", "sig() digits must be a whole number from 1 to 21, got 22"],
  ["int of a num suggests isInt", "print(int(5))\n", "isInt(5)"],
  ["isInt of a str suggests int()", "print(isInt(\"5\"))\n", "match int("],
  ["map lambda with two params", "print(map([1], (x, i) => x))\n", "no index"],
  ["fold lambda with one param", "print(fold([1], 0, x => x))\n", "(acc, x)"],
  ["filter predicate must return bool", "print(filter([1, 2], x => x * 2))\n", "returns a bool for each item, but this one returns a num"],
  ["count over a map suggests values()", "let m = {\"a\": 1}\nprint(count(m, x => x > 0))\n", "count(values(m), ...)"],
  ["map with a unit function says use a loop", "print(map([1], x => print(x)))\n", "use a loop: for x in [1]"],
  ["discarded filter says assign it back", "let xs = [1, 2]\nfilter(xs, x => x > 1)\n", "xs = filter(xs, x => x > 1)"],
  ["discarded map says use a loop", "let xs = [1, 2]\nmap(xs, x => x + 1)\n", "for x in xs"],
  ["fold step must keep the accumulator type", "print(fold([1], 0, (acc, x) => \"s\"))\n", "same type as the start value"],
  ["values of a list", "print(values([1]))\n", "values() takes a map"],
  ["map function arg that is not a function", "print(map([1], 5))\n", "pass a lambda: map(xs, x => x * 2)"],
  // JSON redesign: diagnostics for the old json mistakes
  ["json: null explains json null / isNull / Results","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nlet x = null\n","Vow has no null"],
  ["json: passing json where a map is expected suggests field()","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nfn f(m) { return keys(m) }\nprint(f(j))\n","read m as json instead: field(m, \"key\")"],
  ["json: if on a json value suggests truthy()","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nif j { print(1) }\n","truthy(j) is false for null"],
  ["json: for over a json value suggests jsonList/jsonKeys","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nfor x in j { print(x) }\n","for x in jsonList(j)"],
  ["json: jsonType(get(...)) suggests field()","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nprint(jsonType(get(j, \"a\")))\n","use field(j, \"a\")"],
  ["json: jsonType(get(j, 0)) suggests at()","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nprint(jsonType(get(j, 0)))\n","use at(j, 0)"],
  ["json: str on one path and json on another suggests str(v)","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nfn r(v) {\n  if isNull(v) { return \"\" }\n  return v\n}\nprint(r(j))\n","return str(v)"],
  ["json: jsonNum vs jsonStr returns suggest str(v)","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nfn r(v) {\n  if jsonType(v) == \"number\" { return jsonNum(v) }\n  return jsonStr(v)\n}\n","To turn any json value into text, return str(v)"],
  ["json: bool vs jsonBool Result suggests truthy","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nfn b(v) {\n  if isNull(v) { return false }\n  return jsonBool(v)\n}\n","truthy(v) or isNull(v) give a plain bool"],
  ["json: json + str suggests str(j)","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nprint(field(j, \"a\") + \"x\")\n","str(field(j, \"a\")) renders a json value"],
  ["json: json == str suggests comparing str(j)","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nif j == \"a\" { print(1) }\n","str(j) == ..."],
  ["json: truthy on a str","print(truthy(\"x\"))\n","truthy() reads a json value, but this is a str"],
  ["json: field with a num key suggests at()","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nprint(field(j, 0))\n","use at(j, 0)"],
  ["json: at with a str key suggests field()","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nprint(at(j, \"a\"))\n","use field(j, \"a\")"],
  ["json: has on a json array index","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nprint(has(j, 1))\n","has() on a json object takes a str key"],
  ["json: len of a json value suggests jsonList/jsonKeys","let j = match parseJson(\"{}\") { ok(v) => v err(e) => match parseJson(\"1\") { ok(w) => w err(e2) => return } }\nlet s = field(j, \"a\")\nprint(len(s))\n","len(jsonList(s))"],
  // math, random, dates
  ["sqrt of a negative traps", "let x = 0 - 4\nprint(sqrt(x))\n", "sqrt() of a negative number: sqrt(-4)"],
  ["ln of zero traps", "let z = 0\nprint(ln(z))\n", "ln() of zero: ln(0)"],
  ["log of a negative traps", "print(log(0 - 1))\n", "guard it: if x > 0"],
  ["pow(0, -1) divides by zero", "print(pow(0, 0 - 1))\n", "pow(0, -1) divides by zero"],
  ["pow of a negative to a fraction traps", "print(pow(0 - 8, 0.5))\n", "has no real value"],
  ["exp overflow traps", "print(exp(1000))\n", "exp(1000) is too large"],
  ["randomInt low above high traps", "print(randomInt(5, 1))\n", "the low bound is above the high bound"],
  ["randomInt fractional bound traps", "print(randomInt(1.5, 3))\n", "bounds must be whole numbers"],
  ["sqrt of a str says parse it", "print(sqrt(\"4\"))\n", "match num(\"4\")"],
  ["random with an argument suggests randomInt", "print(random(6))\n", "randomInt(lo, hi)"],
  ["pi used without a call", "print(pi * 2)\n", "'pi' is a builtin function"],
  ["parseDate of a num", "print(parseDate(5))\n", "already a time in milliseconds"],
  ["parseDate Result must be handled", "parseDate(\"2024-01-01\")\n", "this Result is ignored"],
  ["dateParts of a str says parseDate", "print(dateParts(\"2024-01-01\"))\n", "match parseDate(\"2024-01-01\")"],
  ["isoDate of a huge time traps", "print(isoDate(pow(10, 300)))\n", "not a usable time"],
  ["isoDate year beyond 9999 traps", "print(isoDate(300000000000000))\n", "can't write the year"],
  ["own struct DateParts clashes with dateParts()", "struct DateParts { a }\nprint(dateParts(0))\n", "is the struct that dateParts() returns"],
  ["discarded sqrt", "sqrt(4)\n", "the result of sqrt(...) is thrown away"],
  ["atan2 arity", "print(atan2(1))\n", "atan2(y, x)"],
  // stress-test round: new builtins and behaviors
  ["top-level let below the fn that uses it", "fn f() { return x + 1 }\nlet x = 1\nprint(f())\n", "move 'let x = 1' above this"],
  ["httpRequest needs uses net", "fn f() { return httpRequest(\"GET\", \"https://x\", {}, \"\") }\nmatch f() { ok(r) => print(r.status)  err(e) => print(e) }\n", "uses the 'net' capability"],
  ["httpRequest headers must be a map<str, str>", "fn f() uses net { return httpRequest(\"GET\", \"https://x\", {\"n\": 1}, \"\") }\nmatch f() { ok(r) => print(r.status)  err(e) => print(e) }\n", "headers as a map<str, str>"],
  ["httpRequest body must be a str", "fn f() uses net { return httpRequest(\"POST\", \"https://x\", {}, {\"a\": 1}) }\nmatch f() { ok(r) => print(r.status)  err(e) => print(e) }\n", "toJson({\"a\": 1})"],
  ["own struct HttpResponse clashes with httpRequest()", "struct HttpResponse { a }\nfn f() uses net { return httpRequest(\"GET\", \"https://x\", {}, \"\") }\nmatch f() { ok(r) => print(r.status)  err(e) => print(e) }\n", "is the struct that httpRequest() returns"],
  ["readLine takes no arguments", "match readLine(\"> \") { ok(l) => print(l)  err(e) => print(e) }\n", "readLine takes 0 arguments"],
  ["readLine Result must be handled", "readLine()\n", "this Result is ignored"],
  ["indexOf on a list checks the item type", "match indexOf([1, 2], \"2\") { ok(i) => print(i)  err(e) => print(e) }\n", "this list holds num, but you're searching for a str"],
  ["indexOf on a map suggests has/get", "match indexOf({\"a\": 1}, \"a\") { ok(i) => print(i)  err(e) => print(e) }\n", "for maps, use has"],
  ["ord of a num suggests chr", "print(ord(65))\n", "use chr(65)"],
  ["chr of a str suggests ord", "print(chr(\"A\"))\n", "use ord(\"A\")"],
  ["ord of an empty string traps", "print(ord(\"\"))\n", "ord() of an empty string"],
  ["chr of a non code point traps", "print(chr(1.5))\n", "is not a code point"],
  ["jsonSet on a json array traps", "match parseJson(\"[1]\") { ok(j) => print(jsonSet(j, \"a\", 1))  err(e) => print(e) }\n", "jsonSet() needs a JSON object, but this JSON value is an array ([1])"],
  ["jsonSet rejects a Result value", "match parseJson(\"{}\") { ok(j) => print(jsonSet(j, \"a\", num(\"1\")))  err(e) => print(e) }\n", "jsonSet() can't store a Result"],
  ["jsonMerge takes json on both sides", "match parseJson(\"{}\") { ok(j) => print(jsonMerge(j, {\"a\": 1}))  err(e) => print(e) }\n", "jsonMerge() reads a json value, but this is a map"],
  ["prettyJson rejects a Result", "print(prettyJson(num(\"1\")))\n", "prettyJson() can't serialize a Result"],
  ["urlDecode Result must be handled", "let s = urlDecode(\"a%20b\")\nprint(s + \"!\")\n", "Result"],
  ["a pattern invalid with and without the u flag is still a compile error", "print(matches(\"a\", `(`))\n", "invalid regular expression in matches()"],
  // built-in tests: every test-only mistake names the fix
  ['diag: expect outside a test block says where tests live', 'expect(1 == 1)\n', 'only works inside a test block'],
  ['diag: a test cannot see a top-level variable', 'let base = 10\nfn f(x) { return x + 1 }\ntest "t" { expectEq(f(base), 11) }\n', "is a top-level variable, which a test can't see"],
  ['diag: ? inside a test suggests comparing the Result', 'fn f(s) { return num(s) }\ntest "t" {\n  let n = f("4")?\n  expectEq(n, 4)\n}\n', 'expectEq(f("4"), ok(...))'],
  ['diag: a nested test block', 'fn f() {\n  test "inner" { expect(true) }\n  return 1\n}\nprint(f())\n', 'test blocks go at the top level'],
  ['diag: duplicate test names', 'test "a" { expect(true) }\ntest "a" { expect(true) }\n', 'test "a" is declared twice'],
  ['diag: expectEq of run() output against a num', 'test "t" { expectEq(run([], ""), 5) }\n', 'run(...) returns the printed output as a str'],
  ['diag: expectEq of a Result against a plain value', 'fn f() { return ok(1) }\ntest "t" { expectEq(f(), 1) }\n', 'wrap the expected value: ok(1)'],
  ['diag: run() with a str instead of an args list', 'test "t" { expectEq(run("a", ""), "x") }\n', 'put it in a list: run(["a"], "")'],
  ['diag: expect() with a non-bool', 'fn f() { return ok(1) }\ntest "t" { expect(f()) }\n', 'expectErr(f())'],
  ['diag: a type error inside a test block names the line', 'fn sq(n) { return n * n }\ntest "t" {\n  let x = sq(2)\n  x = "four"\n}\n', "'x' would change type from num to str"],
  ['diag: a test name is required', 'test "" { expect(true) }\n', 'a test needs a name'],
  ['diag: the brace goes on the test line', 'test "x"\n{ expect(true) }\n', "expected '{' after the test name"],
  // nested fns with early returns: diagnostics name the fn the author wrote, never "this lambda"
  ['diag: nested fn missing a return on one path is named, not called a lambda', `fn topo(graph) {
  let state = {}
  fn visit(n) {
    if has(state, n) { return state[n] == "visiting" }
    state[n] = "visiting"
    for m in graph[n] {
      if visit(m) { return true }
    }
    state[n] = "done"
  }
  for n in keys(graph) {
    if visit(n) { return "cycle" }
  }
  return "ok"
}
print(topo({"a": ["b"], "b": []}))
`, 'fn visit might finish without returning a value'],
  ['diag: nested fn returning bool and ok(...) is named', `fn topo(graph) {
  let state = {}
  fn visit(n) {
    if has(state, n) { return state[n] == "visiting" }
    state[n] = "visiting"
    for m in graph[n] {
      if visit(m) { return true }
    }
    state[n] = "done"
    return ok(false)
  }
  for n in keys(graph) {
    if visit(n) { return "cycle" }
  }
  return "ok"
}
print(topo({"a": ["b"], "b": []}))
`, 'fn visit returns two different types'],
  ['diag: nested fn with a bare return and a later return c', `fn count(graph, start) {
  let seen = {}
  fn walk(n) {
    if has(seen, n) { return }
    seen[n] = true
    let c = 1
    for m in graph[n] { c = c + walk(m) }
    return c
  }
  return walk(start)
}
print(count({"a": ["b"], "b": []}, "a"))
`, 'An earlier return (line 4) made this function return unit, but this return gives back num'],
  ['diag: nested closure called above its declaration says so and how to fix it', `fn topo(graph) {
  let seen = {}
  let order = []
  for n in sort(keys(graph)) { visit(n) }
  fn visit(n) {
    if has(seen, n) { return }
    seen[n] = true
    for m in graph[n] { visit(m) }
    push(order, n)
  }
  return order
}
print(topo({"a": ["b"], "b": []}))
`, 'fn visit is declared below this call, at line 5'],
  ['diag: two nested closures calling each other', `fn topo(graph) {
  let seen = {}
  let order = []
  fn visit(n) {
    if has(seen, n) { return }
    seen[n] = true
    visitAll(graph[n])
    push(order, n)
  }
  fn visitAll(ns) {
    for m in ns { visit(m) }
  }
  visitAll(sort(keys(graph)))
  return order
}
print(topo({"a": ["b"], "b": []}))
`, 'fn visitAll and fn visit call each other, so neither can come first; move both to the top level and pass seen, graph, order in as parameters'],
  ['diag: while true with a break can still fall off the end', 'fn first(xs) {\n  let i = 0\n  while true {\n    if i >= len(xs) { break }\n    if xs[i] > 0 { return xs[i] }\n    i = i + 1\n  }\n}\nprint(first([0, 2]))\n', 'fn first might finish without returning a value'],
  ['diag: unknown escape lists the supported ones', 'print("a\\qb")\n', 'Vow strings support \\n, \\t, \\r, \\0, \\", \\\\, \\$ and \\u{1F600} / \\u00E9'],
  ['diag: short \\u escape says the two forms', 'print("\\u12")\n', '\\u{hex} with 1 to 6 hex digits, or \\u followed by exactly 4 hex digits'],
  ['diag: \\u escape above U+10FFFF', 'print("\\u{110000}")\n', 'above the last code point U+10FFFF'],
  ['diag: contains() on an unknown param stays list-or-str, so a num is rejected at the call', 'fn f(src) {\n  if contains(src, "x") { return 1 }\n  return 0\n}\nprint(f(5))\n', 'argument 1 of f should be (list or str), but this is a num'],
  ['diag: a let named like a builtin hides the builtin in its scope', 'let lines = lines("a\\nb")\nprint(lines("c"))\n', "'lines' is also a builtin; rename your variable"],
];
for (const [name, src, mustContain] of diagTests) {
  const res = runProgram(src);
  const pass = !res.ok && (res.error || '').includes(mustContain);
  console.log(`\n=== diag: ${name} — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) { console.log(res.error || res.output || '(no error)'); failures++; }
}

// programs whose exact output is checked: ${} interpolation, literal braces, escapes, recursive closures
const outputTests = [
  ['json keeps document key order, integer-like keys included', 'match parseJson(`{"b":1,"10":2,"2":{"z":0,"1":3}}`) {\n  ok(j) => {\n    print(jsonKeys(j))\n    print(toJson(jsonDelete(jsonSet(j, "0", json(true)), "10")))\n    print(toJson(json({"z": 1, "3": 2})))\n  }\n  err(e) => print(e)\n}\n', '["b", "10", "2"]\n{"b":1,"2":{"z":0,"1":3},"0":true}\n{"z":1,"3":2}'],
  ['${} interpolates, plain braces are text', 'let name = "Ada"\nlet n = 2\nprint("hi ${name}, ${n + 1} {x} {} {")\nprint("{\\"k\\": ${n}}")\n', 'hi Ada, 3 {x} {} {\n{"k": 2}'],
  ['template text {{name}} is not flagged', 'let name = "Ada"\nlet t = "Hello {{name}}!"\nprint(replace(t, "{{name}}", name))\n', 'Hello Ada!'],
  ['\\{name} silences the {ident} guard', 'let name = "Ada"\nprint("\\{name} is ${name}")\n', '{name} is Ada'],
  ['{ident} guard is off in backtick strings', 'let name = "Ada"\nprint(`{name}`)\n', '{name}'],
  ['{fn name} and unknown names are not flagged', 'fn total() { return 1 }\nprint("{total} {missing}")\n', '{total} {missing}'],
  ['\\$ escapes a dollar, lone $ is literal', 'let p = 5\nprint("\\${p} costs $${p} or $ 3")\n', '${p} costs $5 or $ 3'],
  ['nested strings inside ${}', 'let m = {"k": 7}\nprint("v=${m["k"]} ${join(["a", "b"], "-")} ${"in${m["k"]}"}")\n', 'v=7 a-b in7'],
  ['recursive closure: DFS over the parent\'s visited map', 'fn reach(graph, start) {\n  let seen = {}\n  let order = []\n  fn dfs(n) {\n    if has(seen, n) { return 0 }\n    seen[n] = true\n    push(order, n)\n    let count = 1\n    for m in graph[n] { count = count + dfs(m) }\n    return count\n  }\n  let total = dfs(start)\n  return "${total}: ${join(order, ",")}"\n}\nprint(reach({"a": ["b", "c"], "b": ["c"], "c": ["a"], "d": []}, "a"))\n', '3: a,b,c'],
  ['recursive closure reading a parent param', 'fn f(k) {\n  fn g(n) {\n    if n == 0 { return 0 }\n    return g(n - 1) + k\n  }\n  return g(3)\n}\nprint(f(2))\n', '6'],
  ['recursive closure inside top-level code returns a Result', 'let limit = 3\nfor i in range(0, 1) {\n  fn count(n) {\n    if n > limit { return err("too far") }\n    if n == limit { return ok(n) }\n    return count(n + 1)\n  }\n  match count(0) {\n    ok(v) => print(v)\n    err(e) => print(e)\n  }\n}\n', '3'],
  // standard library: regex, numbers, higher-order list builtins, and user names shadowing them
  ["regex: matches, find, findAll, replaceAll, splitOn", "print(matches(\"abc123\", `\\d+`), matches(\"abc\", `^\\d+$`))\nmatch find(\"ada@lovelace.org\", `(\\w+)@(\\w+)(x)?`) {\n  ok(m) => print(m)\n  err(e) => print(e)\n}\nmatch find(\"abc\", `\\d`) {\n  ok(m) => print(m)\n  err(e) => print(e)\n}\nprint(findAll(\"a1 b22 c333\", `\\d+`), findAll(\"xyz\", `\\d`))\nprint(replaceAll(\"2024-01-15\", `(\\d+)-(\\d+)-(\\d+)`, \"$3/$2/$1\"), replace(\"a.b\", \".\", \"-\"), replaceAll(\"a.b\", `\\.`, \"-\"))\nprint(splitOn(\"a, b;c  ;d\", `\\s*[,;]\\s*`), splitOn(\"a1b2c\", `(\\d)`))\nlet p = \"^[a-z]+$\"\nprint(matches(\"abc\", p), matches(\"ab1\", p))\n", "true false\n[\"ada@lovelace\", \"ada\", \"lovelace\", \"\"]\nno match\n[\"1\", \"22\", \"333\"] []\n15/01/2024 a-b a-b\n[\"a\", \"b\", \"c\", \"d\"] [\"a\", \"b\", \"c\"]\ntrue false"],
  ["words, sig, isInt, int", "print(words(\"  hello \\t world\\nfoo  \"), len(words(\" \\n \")))\nprint(sig(1234.5678, 3), sig(0.000123456, 2), sig(2.5, 5), sig(98765, 2), sig(0 - 0.0045678, 3))\nprint(isInt(3), isInt(3.5), isInt(0 - 2))\nfor s in [\"42\", \"-7\", \"007\", \"4.2\", \" 5\", \"+3\", \"\", \"-\", \"1e3\"] {\n  match int(s) {\n    ok(n) => print(\"ok ${n}\")\n    err(e) => print(e)\n  }\n}\n", "[\"hello\", \"world\", \"foo\"] 0\n1230 0.00012 2.5 99000 -0.00457\ntrue false true\nok 42\nok -7\nok 7\n\"4.2\" is not a whole number (int() accepts an optional \"-\" then digits only: no spaces, \"+\", decimals or exponents)\n\" 5\" is not a whole number (int() accepts an optional \"-\" then digits only: no spaces, \"+\", decimals or exponents)\n\"+3\" is not a whole number (int() accepts an optional \"-\" then digits only: no spaces, \"+\", decimals or exponents)\n\"\" is not a whole number (int() accepts an optional \"-\" then digits only: no spaces, \"+\", decimals or exponents)\n\"-\" is not a whole number (int() accepts an optional \"-\" then digits only: no spaces, \"+\", decimals or exponents)\n\"1e3\" is not a whole number (int() accepts an optional \"-\" then digits only: no spaces, \"+\", decimals or exponents)"],
  ["map, filter, any, all, count, fold", "struct P { name, price }\nlet ps = [P { name: \"pen\", price: 3 }, P { name: \"ink\", price: 10 }]\nfn double(x) { return x * 2 }\nprint(map([1, 2, 3], x => x * 2), map(ps, p => p.name), map([5], double), map([], x => x + 1))\nprint(filter([1, 2, 3, 4], x => x % 2 == 0), count(ps, p => p.price > 5))\nprint(any([1, 2], x => x > 1), all([1, 2], x => x > 1), any([], x => x > 1), all([], x => x > 1))\nprint(fold([1, 2, 3], 0, (acc, x) => acc + x), fold(ps, \"\", (acc, p) => acc + p.name + \";\"))\nlet seen = 0\nlet hit = any([1, 2, 3, 4], x => {\n  seen = seen + 1\n  x == 2\n})\nprint(hit, seen)\nlet lens = map([\"a\", \"bbb\"], w => {\n  let n = len(w)\n  n * 10\n})\nprint(lens)\n", "[2, 4, 6] [\"pen\", \"ink\"] [10] []\n[2, 4] 1\ntrue false false true\n6 pen;ink;\ntrue 2\n[10, 30]"],
  ["uniq and values", "struct P { a }\nprint(uniq([3, 1, 3, 2, 1]), uniq([\"b\", \"a\", \"b\"]), uniq([[1], [2], [1]]), uniq([P { a: 1 }, P { a: 1 }]))\nlet m = {\"z\": 1, \"a\": 2}\nm[\"m\"] = 3\nm[\"z\"] = 9\nprint(values(m), keys(m), sum(values(m)))\n", "[3, 1, 2] [\"b\", \"a\"] [[1], [2]] [P { a: 1 }]\n[9, 2, 3] [\"z\", \"a\", \"m\"] 14"],
  ["user fns and variables shadow the new builtins", "fn map(xs, f) {\n  let out = []\n  for x in reverse(xs) { push(out, f(x)) }\n  return out\n}\nfn count(xs) { return len(xs) * 100 }\nfn matches(open, close) { return open == \"(\" and close == \")\" }\nfn find(xs, v) {\n  for i in range(0, len(xs)) {\n    if xs[i] == v { return i }\n  }\n  return 0 - 1\n}\nfn values(a, b) { return [b, a] }\nprint(map([1, 2, 3], x => x + 1), count([1, 2]), matches(\"(\", \")\"), find([4, 5], 5), values(1, 2))\nlet words = split(\"a b\", \" \")\nlet fold = 7\nfold = fold + 1\nprint(words, fold)\nlet filter = (xs) => len(xs)\nprint(filter([1, 2, 3]))\nlet all = all([1, 2], x => x > 0)\nprint(all)\nfn outer(k) {\n  fn uniq(n) {\n    if n == 0 { return k }\n    return uniq(n - 1) + 1\n  }\n  return uniq(3)\n}\nprint(outer(10))\n", "[4, 3, 2] 200 true 1 [2, 1]\n[\"a\", \"b\"] 8\n3\ntrue\n13"],
  // JSON redesign: display, convenient access, truthiness (run on both backends by compile-test)
  ["json: str/print, field, at, has, isNull, truthy on every kind","let src = `{\"name\":\"Ada\",\"n\":3,\"f\":3.5,\"t\":true,\"z\":null,\"xs\":[1,\"two\",{\"a\":1}],\"o\":{},\"e\":[],\"s\":\"\",\"zero\":0}`\nmatch parseJson(src) {\n  ok(j) => {\n    print(str(field(j, \"name\")), field(j, \"n\"), field(j, \"f\"), field(j, \"t\"), field(j, \"z\"), field(j, \"xs\"), field(j, \"missing\"))\n    print(\"hi ${field(j, \"name\")}!\")\n    for k in jsonKeys(j) { print(k, truthy(field(j, k)), isNull(field(j, k))) }\n    print(at(field(j, \"xs\"), 1), at(field(j, \"xs\"), 9), at(j, 0), field(field(j, \"xs\"), \"a\"), at(field(j, \"xs\"), 0.5))\n    print(has(j, \"z\"), has(j, \"nope\"), has(field(j, \"xs\"), \"a\"), has(j, \"constructor\"), isNull(field(j, \"constructor\")))\n    print([field(j, \"name\")], j)\n  }\n  err(e) => print(e)\n}\n","Ada 3 3.5 true null [1,\"two\",{\"a\":1}] null\nhi Ada!\nname true false\nn true false\nf true false\nt true false\nz false true\nxs true false\no false false\ne false false\ns false false\nzero false false\ntwo null null null null\ntrue false false false true\n[\"Ada\"] {\"name\":\"Ada\",\"n\":3,\"f\":3.5,\"t\":true,\"z\":null,\"xs\":[1,\"two\",{\"a\":1}],\"o\":{},\"e\":[],\"s\":\"\",\"zero\":0}"],
  ["json: walking an object and rendering values","fn render(v) {\n  if isNull(v) { return \"\" }\n  let k = jsonType(v)\n  if k == \"array\" or k == \"object\" { return \"<${k}>\" }\n  return str(v)\n}\nmatch parseJson(`{\"user\":{\"name\":\"Ada\",\"age\":36,\"admin\":false,\"tags\":[\"x\"],\"pet\":null}}`) {\n  ok(data) => {\n    let user = field(data, \"user\")\n    for k in jsonKeys(user) {\n      let v = field(user, k)\n      print(\"${k}=${render(v)} truthy=${truthy(v)}\")\n    }\n    print(render(field(user, \"missing\")), isNull(at(field(user, \"tags\"), 1)), str(at(field(user, \"tags\"), 0)))\n    print(str(field(data, \"user\")))\n  }\n  err(e) => print(e)\n}\n","name=Ada truthy=true\nage=36 truthy=true\nadmin=false truthy=false\ntags=<array> truthy=true\npet= truthy=false\n true x\n{\"name\":\"Ada\",\"age\":36,\"admin\":false,\"tags\":[\"x\"],\"pet\":null}"],
  ["json: has() and slice() on un-annotated params stay generic","fn known(scope, name) { return has(scope, name) }\nfn tagAt(t, i) {\n  let j = i\n  while j < len(t) and t[j] != \"}\" { j = j + 1 }\n  return trim(slice(t, i, j))\n}\nfn mid(xs) { return slice(xs, 1, len(xs) - 1) }\nlet m = {\"a\": 1}\nmatch parseJson(`{\"a\":null,\"b\":[]}`) {\n  ok(j) => print(known(m, \"a\"), known(m, \"z\"), known(j, \"a\"), known(j, \"z\"), known(field(j, \"b\"), \"a\"))\n  err(e) => print(e)\n}\nprint(tagAt(\"{{ name }}\", 2), mid([1, 2, 3, 4]), mid(\"abcd\"))\n","true false true false false\nname [2, 3] bc"],
  ["json: user fns and variables shadow field/at/truthy/isNull","fn field(a, b) { return a + b }\nfn truthy(x) { return x > 0 }\nlet at = 3\nlet isNull = \"no\"\nprint(field(1, 2), truthy(5), at, isNull)\nfn outer(j) {\n  fn at(i) { return i * 10 }\n  return at(2) + len(jsonKeys(j))\n}\nmatch parseJson(`{\"a\":1}`) {\n  ok(j) => print(outer(j), has(j, \"a\"))\n  err(e) => print(e)\n}\n","3 true 3 no\n21 true"],
  // math, random, dates
  ["math: sqrt pow exp ln log trig ceil trunc pi", "print(sqrt(16), sqrt(2) * sqrt(2) == 2, pow(2, 10), pow(2, 0.5) == sqrt(2), pow(0 - 2, 3), exp(0), ln(1), log(exp(2)), ln(exp(1)))\nprint(round(sin(pi() / 2), 6), cos(0), round(tan(pi() / 4), 6), atan2(1, 1) * 4 == pi(), atan2(0 - 1, 0 - 1) < 0)\nprint(ceil(1.2), ceil(0 - 1.2), trunc(1.7), trunc(0 - 1.7), floor(0 - 1.7), fixed(pi(), 5), round(exp(1), 4))\n", "4 false 1024 true -8 1 0 2 1\n1 1 1 true true\n2 -1 1 -1 -2 3.14159 2.7183"],
  ["dates: dateParts, isoDate, parseDate, daysBetween (all UTC)", "let d = dateParts(0)\nprint(d)\nprint(d.year, d.month, d.day, d.weekday, isoDate(0), isoDate(1700000000000), isoDate(0 - 86400000))\nfor s in [\"2024-02-29\", \"2024-02-29T12:30:05Z\", \"2024-02-29 12:30\", \"2024-02-29T12:30:05.250Z\", \"2024-03-01T01:00:00+02:00\", \"0099-01-01\", \"2023-02-29\", \"2024-13-01\", \"2024-01-01T24:00:00\", \"2024-1-1\", \"yesterday\", \"2024-01-01Z\"] {\n  match parseDate(s) {\n    ok(ms) => print(\"${s} -> ${ms} ${isoDate(ms)}\")\n    err(e) => print(e)\n  }\n}\nlet jan1 = match parseDate(\"2026-01-01T23:59:00Z\") { ok(ms) => ms  err(e) => 0 }\nlet jan2 = match parseDate(\"2026-01-02T00:01:00Z\") { ok(ms) => ms  err(e) => 0 }\nprint(daysBetween(jan1, jan2), daysBetween(jan2, jan1), daysBetween(jan1, jan1 + 30 * 86400000), dateParts(jan2).weekday, dateParts(jan2).hour, dateParts(jan2).minute)\nprint(now() > 1700000000000)\n", "DateParts { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0, weekday: 4 }\n1970 1 1 4 1970-01-01T00:00:00Z 2023-11-14T22:13:20Z 1969-12-31T00:00:00Z\n2024-02-29 -> 1709164800000 2024-02-29T00:00:00Z\n2024-02-29T12:30:05Z -> 1709209805000 2024-02-29T12:30:05Z\n2024-02-29 12:30 -> 1709209800000 2024-02-29T12:30:00Z\n2024-02-29T12:30:05.250Z -> 1709209805250 2024-02-29T12:30:05Z\n2024-03-01T01:00:00+02:00 -> 1709247600000 2024-02-29T23:00:00Z\n0099-01-01 -> -59042995200000 0099-01-01T00:00:00Z\n\"2023-02-29\" is not a valid date: day 29 is out of range (2023-02 has 28 days)\n\"2024-13-01\" is not a valid date: month 13 is out of range (1-12)\n\"2024-01-01T24:00:00\" is not a valid date: hour 24 is out of range (0-23)\n\"2024-1-1\" is not an ISO date (expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS, optionally ending in Z or an offset like +02:00)\n\"yesterday\" is not an ISO date (expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS, optionally ending in Z or an offset like +02:00)\n\"2024-01-01Z\" is not a valid date: a time zone needs a time (YYYY-MM-DDTHH:MM:SSZ)\n1 -1 30 5 0 1\ntrue"],
  ["printing: nums exact up to 15 significant digits, float noise dropped past that", "print(0.1 + 0.2, 2 / 3, 0.123456789012, 1.0000000001, 0.0000123456789, -12.5)\nmatch parseJson(`[1.50000000000001, 0.30000000000000004]`) { ok(j) => print(str(at(j, 0)), str(at(j, 1)), str(match jsonNum(at(j, 0)) { ok(v) => v err(e) => 0 })) err(e) => print(e) }\nprint(toJson(json({})))\n", "0.3 0.666666666666667 0.123456789012 1.0000000001 0.0000123456789 -12.5\n1.50000000000001 0.30000000000000004 1.50000000000001\n{}"],
  ["random: seeded sequence, randomInt bounds inclusive", "print(random(), random())\nprint(randomInt(1, 6), randomInt(1, 6), randomInt(1, 6), randomInt(0 - 3, 3), randomInt(10, 10))\nlet seen = {}\nlet inRange = true\nfor i in range(0, 600) {\n  let n = randomInt(1, 3)\n  if n < 1 or n > 3 or not isInt(n) { inRange = false }\n  seen[str(n)] = true\n}\nprint(sort(keys(seen)), inRange)\nlet r = random()\nprint(r >= 0 and r < 1)\n", "0.627073940588798 0.527447040188371\n6 4 3 0 10\n[\"1\", \"2\", \"3\"] true\ntrue"],
  ["user fns and variables shadow the math/random/date builtins", "fn log(msg) { return \"[log] \" + msg }\nfn random(xs) { return xs[0] }\nlet pi = 3\nlet e = 2\nfn sqrt(a, b) { return a + b }\nprint(log(\"hi\"), random([7, 8]), pi, e, sqrt(1, 2))\nfn outer() {\n  let ceil = 10\n  let trunc = x => x * 2\n  return ceil + trunc(4) + floor(2.5)\n}\nprint(outer())\nlet dateParts = \"none\"\nprint(dateParts, exp(0))\n", "[log] hi 7 3 2 3\n20\nnone 1"],
  // stress-test round: new builtins and behaviors
  ["number literals with exponents", "print(1e9, 2.5e-3, 1E+2, 3e2 + 1, 1e21)\n", "1000000000 0.0025 100 301 1e+21"],
  ["JSON numbers past 15 digits stay exact; num() is decimal-only", "match parseJson(`[9219976635399687875, 9219976635399687876, 0.30000000000000004, 12.5]`) {\n  ok(j) => {\n    print(str(at(j, 0)), at(j, 0) == at(j, 1), toJson(j), at(j, 2) == json(0.1 + 0.2), jsonType(at(j, 0)))\n    print(jsonNum(at(j, 0)))\n  }\n  err(e) => print(e)\n}\nfor s in [\"1e3\", \" 5\", \"0x1A\", \"Infinity\", \"\"] { print(num(s)) }\n", "9219976635399687875 false [9219976635399687875,9219976635399687876,0.30000000000000004,12.5] true number\nerr(\"the JSON value at index 0 is a number (9219976635399687875), a whole number too large for a num to hold exactly (nums are exact up to 9007199254740991); use str(j) for its exact digits, e.g. as an id\")\nok(1000)\nok(5)\nerr(\"\\\"0x1A\\\" is not a number\")\nerr(\"\\\"Infinity\\\" is not a number\")\nerr(\"\\\"\\\" is not a number\")"],
  ["cmpNum and num() past 2^53", "print(cmpNum(\"9007199254740993\", \"9007199254740992\"), cmpNum(\"-1\", \"-2\"), cmpNum(\"12.50\", \"12.5\"), cmpNum(\"-0\", \"0\"), cmpNum(\"0.001\", \"0.01\"), cmpNum(\"100\", \"99.999\"))\nprint(num(\"9007199254740993\"), num(\"9007199254740991\"))\n", "1 1 0 0 -1 1\nerr(\"\\\"9007199254740993\\\" is a whole number too large for a num to hold exactly (nums are exact up to 9007199254740991); keep it as text, and compare such numbers with cmpNum(a, b)\") ok(9007199254740991)"],
  ["sortWith with cmpNum: stable, exact past 2^53", "struct P { name, score }\nlet ps = [P { name: \"a\", score: \"9007199254740992\" }, P { name: \"b\", score: \"9007199254740993\" }, P { name: \"c\", score: \"-1.5\" }, P { name: \"d\", score: \"9007199254740993\" }, P { name: \"e\", score: \"12.50\" }]\nlet ranked = sortWith(ps, (x, y) => cmpNum(y.score, x.score))\nprint(join(map(ranked, p => p.name), \",\"))\nprint(sortWith([5, 3, 9, 1], (a, b) => a - b), sortWith([], (a, b) => a - b))\n", "b,d,a,e,c\n[1, 3, 5, 9] []"],
  ["remove(map, key)", "let m = {\"a\": 1, \"b\": 2}\nprint(remove(m, \"a\"), remove(m, \"zz\"), keys(m), len(keys(m)))\n", "true false [\"b\"] 1"],
  ["casefold / normalize", "print(casefold(\"Straße\"), casefold(\"ẞ\") == casefold(\"SS\"), lower(\"ß\"), normalize(\"Jose\\u{301}\") == \"José\", len(normalize(\"José\", \"NFD\")), len(normalize(\"ﬁ\", \"NFKC\")))\n", "strasse true ß true 5 2"],
  ["parseCsv: BOM, CRLF, quotes, newlines, blank lines, errors", "match parseCsv(\"\\u{FEFF}a,b\\r\\n\\\"x, y\\\",\\\"1\\n\\\"\\\"2\\\"\\\"\\\"\\r\\n\\r\\nz,\") { ok(r) => print(toJson(json(r)))  err(e) => print(e) }\nmatch parseCsv(\"a\\n\\\"b\") { ok(r) => print(r)  err(e) => print(e) }\nmatch parseCsv(\"\") { ok(r) => print(len(r))  err(e) => print(e) }\n", "[[\"a\",\"b\"],[\"x, y\",\"1\\n\\\"2\\\"\"],[\"z\",\"\"]]\nline 2: a quoted field is never closed (missing \")\n0"],
  ["urlEncode / urlDecode / ord / chr", "print(urlEncode(\"a b&c=d/é\"), ord(\"A\"), ord(\"é\"), ord(\"😀\"), chr(65), chr(9731), chr(128512))\nmatch urlDecode(\"a%20b%26c\") { ok(s) => print(s)  err(e) => print(e) }\nmatch urlDecode(\"bad%zz\") { ok(s) => print(s)  err(e) => print(e) }\nmatch urlDecode(\"%C3%28\") { ok(s) => print(s)  err(e) => print(e) }\n", "a%20b%26c%3Dd%2F%C3%A9 65 233 128512 A ☃ 😀\na b&c\n\"bad%zz\" is not valid URL encoding (a % must be followed by two hex digits)\n\"%C3%28\" is not valid URL encoding (the %-escapes are not valid UTF-8)"],
  ["indexOf works on lists (== equality) and strs", "struct P { x }\nmatch indexOf([10, 20, 30], 20) { ok(i) => print(i)  err(e) => print(e) }\nmatch indexOf([\"a\", \"b\"], \"z\") { ok(i) => print(i)  err(e) => print(e) }\nmatch indexOf(\"hello\", \"ll\") { ok(i) => print(i)  err(e) => print(e) }\nmatch indexOf([P { x: 1 }, P { x: 3 }], P { x: 3 }) { ok(i) => print(i)  err(e) => print(e) }\nfn pos(xs, v) { return indexOf(xs, v) }\nmatch pos([[1], [2]], [2]) { ok(i) => print(i)  err(e) => print(e) }\n", "1\n\"z\" is not in the list\n2\n1\n1"],
  ["regex: u flag (\\p{L}, code points) with fallback for old-style escapes", "print(matches(\"héllo wörld\", `^\\p{L}+ \\p{L}+$`), findAll(\"ab-cd-ef\", `\\-`), matches(\"a{\", `a{`), len(findAll(\"😀😀\", `.`)), replaceAll(\"αβ 12\", `\\p{Script=Greek}+`, \"G\"))\n", "true [\"-\", \"-\"] true 2 G 12"],
  ["prettyJson indents with 2 spaces", "struct U { name, tags }\nprint(prettyJson(U { name: \"Ada\", tags: [\"x\"] }))\nprint(prettyJson(7), prettyJson(\"s\"), prettyJson({}))\n", "{\n  \"name\": \"Ada\",\n  \"tags\": [\n    \"x\"\n  ]\n}\n7 \"s\" {}"],
  ["jsonSet / jsonMerge build new json; == compares type and value", "match parseJson(`{\"user\": {\"name\": \"Ada\", \"age\": 36}, \"n\": 1}`) {\n  ok(j) => {\n    let u = field(j, \"user\")\n    let u2 = jsonSet(u, \"age\", 37)\n    print(u2, u, u2 == u, jsonSet(u, \"age\", 36) == u)\n    print(jsonSet(field(j, \"missing\"), \"k\", [1, 2]))\n    match parseJson(`{\"user\": {\"age\": 40, \"role\": \"admin\"}, \"n\": \"1\"}`) {\n      ok(o) => print(jsonMerge(j, o), jsonMerge(o, j), jsonMerge(j, field(o, \"n\")))\n      err(e) => print(e)\n    }\n    print(jsonSet(j, \"n\", {\"a\": 1}) != j, field(j, \"n\") == field(j, \"n\"))\n  }\n  err(e) => print(e)\n}\n", "{\"name\":\"Ada\",\"age\":37} {\"name\":\"Ada\",\"age\":36} false true\n{\"k\":[1,2]}\n{\"user\":{\"name\":\"Ada\",\"age\":40,\"role\":\"admin\"},\"n\":\"1\"} {\"user\":{\"age\":36,\"role\":\"admin\",\"name\":\"Ada\"},\"n\":1} 1\ntrue true"],
  ["jsonNum/jsonStr/jsonBool errs say what was found and where it came from", "match parseJson(`{\"user\": {\"name\": \"Ada\", \"age\": \"36\", \"tags\": [1, \"x\"], \"on\": null}}`) {\n  ok(j) => {\n    let u = field(j, \"user\")\n    match jsonNum(field(u, \"age\")) { ok(n) => print(n)  err(e) => print(e) }\n    match jsonStr(at(field(u, \"tags\"), 0)) { ok(n) => print(n)  err(e) => print(e) }\n    match jsonBool(j) { ok(n) => print(n)  err(e) => print(e) }\n    match jsonNum(field(u, \"missing\")) { ok(n) => print(n)  err(e) => print(e) }\n    match jsonBool(field(u, \"on\")) { ok(n) => print(n)  err(e) => print(e) }\n    for t in jsonList(field(u, \"tags\")) {\n      match jsonNum(t) { ok(n) => print(\"num\", n)  err(e) => print(e) }\n    }\n    match get(u, \"name\") {\n      ok(v) => match jsonNum(v) { ok(n) => print(n)  err(e) => print(e) }\n      err(e) => print(e)\n    }\n    match jsonStr(u[\"age\"]) { ok(n) => print(n)  err(e) => print(e) }\n    match jsonStr(u) { ok(n) => print(n)  err(e) => print(e) }\n  }\n  err(e) => print(e)\n}\n", "the JSON value at \"age\" is a string (\"36\"), not a number\nthe JSON value at index 0 is a number (1), not a string\nthis JSON value is an object ({\"user\":{\"name\":\"Ada\",\"age\":\"36\",\"tag...), not a bool\nthe JSON value at \"missing\" is null, not a number\nthe JSON value at \"on\" is null, not a bool\nnum 1\nthe JSON value at index 1 is a string (\"x\"), not a number\nthe JSON value at \"name\" is a string (\"Ada\"), not a number\n36\nthe JSON value at \"user\" is an object ({\"name\":\"Ada\",\"age\":\"36\",\"tags\":[1,\"x...), not a string"],
  ["chars: one str per code point; <, sort and sortBy order strs by code point", "print(chars(\"h\u00e9llo\ud83d\ude00\"), len(chars(\"a\ud83d\ude00b\")), chars(\"\"), len(\"a\ud83d\ude00b\"))\nprint(sort([\"\ud83d\ude00\", \"\uff5a\", \"a\", \"Z\"]), \"\ud83d\ude00\" > \"\uff5a\", \"\uff5a\" < \"\ud83d\ude00\", \"a\" <= \"a\", \"b\" >= \"a\", \"ab\" < \"abc\", \"\" < \"a\")\nprint(sortBy([\"\ud83d\ude00x\", \"\uff5a\", \"a\"], w => w), sortBy([3, 1, 2], n => 0 - n), sortBy([\"bb\", \"a\", \"cc\", \"d\"], w => len(w)))\nfn lt(a, b) { return a < b }\nfn ge(a, b) { return a >= b }\nprint(lt(\"\ud83d\ude00\", \"\uff5a\"), lt(1, 2), lt(\"\uff5a\", \"\ud83d\ude00\"), ge(\"\uff5a\", \"\ud83d\ude00\"), ge(2, 2))\nlet n = 1\nlet t = \"\uff5a\"\nprint(n < 2, t < \"\ud83d\ude00\", t > \"\ud83d\ude00\", join(reverse(chars(\"ab\ud83d\ude00\")), \"\"))\n", "[\"h\", \"\u00e9\", \"l\", \"l\", \"o\", \"\ud83d\ude00\"] 3 [] 4\n[\"Z\", \"a\", \"\uff5a\", \"\ud83d\ude00\"] true true true true true true\n[\"a\", \"\uff5a\", \"\ud83d\ude00x\"] [3, 2, 1] [\"a\", \"d\", \"bb\", \"cc\"]\nfalse true true false true\ntrue true false \ud83d\ude00ba"],
  ["json() converts directly; jsonDelete drops a key", "struct U { name, tags }\nlet j = json({\"a\": [1, 2], \"b\": []})\nprint(j, jsonType(j), json(U { name: \"Ada\", tags: [\"x\"] }), json([1, 2, 3]), json(7), json(\"s\"), json([]), json(true), jsonType(json({})))\nlet j2 = jsonSet(j, \"c\", 3)\nprint(jsonDelete(j2, \"a\"), jsonDelete(j2, \"zzz\"), j2, jsonDelete(json({}), \"a\"), json(j2) == j2)\nmatch parseJson(`{\"user\": {\"pw\": \"x\", \"name\": \"Ada\"}, \"n\": null}`) {\n  ok(d) => {\n    print(jsonDelete(field(d, \"user\"), \"pw\"), jsonDelete(field(d, \"n\"), \"k\"), jsonDelete(field(d, \"missing\"), \"k\"))\n    print(jsonKeys(jsonDelete(field(d, \"user\"), \"name\")), json(jsonList(json([1, 2]))), jsonSet(d, \"user\", jsonDelete(field(d, \"user\"), \"pw\")))\n  }\n  err(e) => print(e)\n}\nlet json = 5\nlet jsonDelete = (a, b) => a + b\nprint(json, jsonDelete(1, 2))\n", "{\"a\":[1,2],\"b\":[]} object {\"name\":\"Ada\",\"tags\":[\"x\"]} [1,2,3] 7 s [] true object\n{\"b\":[],\"c\":3} {\"a\":[1,2],\"b\":[],\"c\":3} {\"a\":[1,2],\"b\":[],\"c\":3} {} true\n{\"name\":\"Ada\"} {} {}\n[\"pw\"] [1,2] {\"user\":{\"name\":\"Ada\"},\"n\":null}\n5 3"],
  ["readLine / readAll / httpRequest fail softly outside the CLI", "match readLine() { ok(l) => print(l)  err(e) => print(e) }\nmatch readAll() { ok(l) => print(l)  err(e) => print(e) }\nfn f() uses net { return httpRequest(\"GET\", \"https://x\", {\"User-Agent\": \"vow\"}, \"\") }\nmatch f() { ok(r) => print(r.status)  err(e) => print(e) }\n", "readLine is only available in the Vow CLI; the browser playground has no standard input\nreadAll is only available in the Vow CLI; the browser playground has no standard input\nhttpRequest is only available in the Vow CLI; the browser playground cannot reach the network"],
  // test blocks never run as part of the program (the playground runs programs this way too)
  ["test blocks are skipped by a normal run, even when they would fail", "fn sq(n) { return n * n }\nprint(\"main\", sq(3))\ntest \"would fail\" { expect(false) }\ntest \"would trap\" { print([1][5]) }\nprint(\"end\")\n", "main 9\nend"],
  // nested fns with early returns (topological sort / DFS shapes an agent writes)
  ['nested fn: topo sort, bool cycle flag, early returns in branches and loops', `fn topo(graph) {
  let state = {}
  let order = []
  fn visit(n) {
    if has(state, n) {
      if state[n] == "visiting" { return true }
      return false
    }
    state[n] = "visiting"
    for m in graph[n] {
      if visit(m) { return true }
    }
    state[n] = "done"
    push(order, n)
    return false
  }
  for n in sort(keys(graph)) {
    if visit(n) { return err("cycle detected at \${n}") }
  }
  return ok(order)
}
match topo({"a": ["b"], "b": ["c"], "c": []}) { ok(o) => print(o) err(e) => print(e) }
match topo({"a": ["b"], "b": ["a"]}) { ok(o) => print(o) err(e) => print(e) }
`, '["c", "b", "a"]\ncycle detected at a'],
  ['nested fn: recursive Result closure with ? on itself and on get()', `fn topo(graph) {
  let visiting = {}
  let done = {}
  let order = []
  fn visit(n) {
    if has(done, n) { return ok(true) }
    if has(visiting, n) { return err("cycle through \${n}") }
    visiting[n] = true
    let deps = get(graph, n)?
    for d in deps {
      visit(d)?
    }
    done[n] = true
    push(order, n)
    return ok(true)
  }
  for n in sort(keys(graph)) { visit(n)? }
  return ok(order)
}
match topo({"a": ["b"], "b": ["c"], "c": []}) { ok(o) => print(o) err(e) => print(e) }
match topo({"a": ["b"], "b": ["a"]}) { ok(o) => print(o) err(e) => print(e) }
match topo({"a": ["zz"]}) { ok(o) => print(o) err(e) => print(e) }
`, '["c", "b", "a"]\ncycle through a\nkey "zz" not found'],
  ['nested fn: bare early return, loop last', 'fn collect(graph, start) {\n  let seen = {}\n  let out = []\n  fn walk(n) {\n    if has(seen, n) { return }\n    seen[n] = true\n    push(out, n)\n    for m in graph[n] { walk(m) }\n  }\n  walk(start)\n  return out\n}\nprint(collect({"a": ["b", "c"], "b": ["c"], "c": ["a"]}, "a"))\n', '["a", "b", "c"]'],
  ['nested fn: bare early return, push(...) as the last line is a statement, not the value', 'fn collect(graph, start) {\n  let seen = {}\n  let out = []\n  fn walk(n) {\n    if has(seen, n) { return }\n    seen[n] = true\n    for m in graph[n] { walk(m) }\n    push(out, n)\n  }\n  walk(start)\n  return out\n}\nprint(collect({"a": ["b", "c"], "b": ["c"], "c": ["a"]}, "a"))\n', '["c", "b", "a"]'],
  ['top-level fn: bare early return, push(...) as the last line', 'let seen = {}\nlet out = []\nfn walk(graph, n) {\n  if has(seen, n) { return }\n  seen[n] = true\n  for m in graph[n] { walk(graph, m) }\n  push(out, n)\n}\nwalk({"a": ["b"], "b": []}, "a")\nprint(out)\n', '["b", "a"]'],
  ['nested fn: while true that only leaves by return', `fn roots(parent, names) {
  let hits = {}
  fn find(a) {
    let cur = a
    while true {
      let p = parent[cur]
      if p == cur { return cur }
      cur = p
    }
  }
  let out = []
  for n in names {
    let r = find(n)
    hits[r] = true
    push(out, r)
  }
  print(len(keys(hits)))
  return out
}
print(roots({"a": "a", "b": "a", "c": "b", "d": "d"}, ["c", "b", "d"]))
`, '2\n["a", "a", "d"]'],
  ['top-level fn: while true that only leaves by return', 'fn find(parent, a) {\n  let cur = a\n  while true {\n    let p = parent[cur]\n    if p == cur { return cur }\n    cur = p\n  }\n}\nprint(find({"a": "a", "b": "a"}, "b"))\n', 'a'],
  ['nested fn: returns from match arms inside a loop, value match with a returning arm', `fn topo(graph) {
  let visiting = {}
  let done = {}
  let order = []
  fn visit(n) {
    if has(done, n) { return ok(0) }
    if has(visiting, n) { return err("cycle through \${n}") }
    visiting[n] = true
    let deps = match get(graph, n) {
      ok(ds) => ds
      err(e) => { return err("unknown node \${n}") }
    }
    for d in deps {
      match visit(d) {
        ok(v) => {}
        err(e) => { return err(e) }
      }
    }
    done[n] = true
    push(order, n)
    return ok(len(order))
  }
  for n in sort(keys(graph)) {
    match visit(n) {
      ok(v) => {}
      err(e) => { return err(e) }
    }
  }
  return ok(order)
}
match topo({"a": ["b"], "b": ["c"], "c": []}) { ok(o) => print(o) err(e) => print(e) }
match topo({"a": ["b"], "b": ["a"]}) { ok(o) => print(o) err(e) => print(e) }
match topo({"a": ["zz"]}) { ok(o) => print(o) err(e) => print(e) }
`, '["c", "b", "a"]\ncycle through a\nunknown node zz'],
  ['nested fn: memoized recursive depth with a returning err arm', `fn depths(deps) {
  let cache = {}
  fn depth(n) {
    if has(cache, n) { return cache[n] }
    let best = 0
    match get(deps, n) {
      ok(ds) => {
        for d in ds {
          let v = depth(d) + 1
          if v > best { best = v }
        }
      }
      err(e) => { return 0 }
    }
    cache[n] = best
    return best
  }
  let out = {}
  for n in sort(keys(deps)) { out[n] = depth(n) }
  return out
}
print(depths({"a": ["b", "c"], "b": ["c"], "c": [], "d": ["x"]}))
`, '{"a": 2, "b": 1, "c": 0, "d": 1}'],
  ['nested fn: bare return arm inside a loop plus ? on the recursive call', `fn resolve(graph) {
  let order = []
  let seen = {}
  fn visit(n) {
    if has(seen, n) { return ok(true) }
    seen[n] = true
    for m in graph[n] {
      match get(graph, m) {
        ok(ds) => {}
        err(e) => return err("unknown dep \${m} of \${n}")
      }
      visit(m)?
    }
    push(order, n)
    return ok(true)
  }
  for n in sort(keys(graph)) { visit(n)? }
  return ok(order)
}
match resolve({"a": ["b"], "b": []}) { ok(o) => print(o) err(e) => print(e) }
match resolve({"a": ["q"]}) { ok(o) => print(o) err(e) => print(e) }
`, '["b", "a"]\nunknown dep q of a'],
  ['nested fn: first return is inside a loop, reads a parent param', 'fn reach(graph, start, target) {\n  let seen = {}\n  fn dfs(n) {\n    seen[n] = true\n    for m in graph[n] {\n      if m == target { return true }\n      if not has(seen, m) {\n        if dfs(m) { return true }\n      }\n    }\n    return false\n  }\n  return dfs(start)\n}\nprint(reach({"a": ["b"], "b": ["c"], "c": []}, "a", "c"))\nprint(reach({"a": ["b"], "b": ["c"], "c": []}, "c", "a"))\n', 'true\nfalse'],
  // string escapes: \r \0 \u{...} \uXXXX in plain and interpolated strings; backtick strings stay raw
  ['escapes: \\r \\0 \\u{} \\uXXXX, also inside ${} strings, raw in backticks', 'let s = "a\\r\\nb\\t\\0c\\\\\\"\\u{1F600}\\u00e9\\$x"\nprint(len(s))\nprint(s == "a" + chr(13) + chr(10) + "b" + chr(9) + chr(0) + "c\\\\\\"" + chr(128512) + chr(233) + "$x")\nprint("v=${"\\u{41}\\r" + "|"}" == "v=A" + chr(13) + "|")\nprint(`\\r\\u{41}`)\n', '14\ntrue\ntrue\n\\r\\u{41}'],
  // builtin shadowing: a fn, let, param, loop variable or lambda named like a builtin wins in its
  // scope (including the effectful ones: no spurious `uses` error), and the builtin is back outside it
  ['shadowing: user names hide builtins only in their scope', 'fn env(k) { return k + "!" }\nfn greet(name) {\n  fn httpGet(u) { return "got " + u }\n  let readFile = x => x\n  let rest = slice(name, 1, len(name))\n  return env(name) + " " + httpGet("u") + " " + readFile("r") + " " + rest\n}\nfn count(len) { return len + 1 }\nfn g() {\n  let text = "t"\n  for sort in [1, 2] { text = text + str(sort) }\n  return text\n}\nprint(greet("ada"))\nprint(count(2), g(), len("abc"), sort([2, 1]), text("x"))\n', 'ada! got u r da\n3 t12 3 [1, 2] <response 200 text/plain; charset=utf-8>'],
  // contains/indexOf on an unannotated param: list<item> or str, settled by other uses or per call
  ['generic contains/indexOf: str and list callers of one fn', 'fn f(src) {\n  let i = match indexOf(src, "x") { ok(i) => i  err(e) => 0 - 1 }\n  if i < 0 { return src }\n  return slice(src, 0, i) + "y"\n}\nprint(f("abxc"))\nfn has2(xs, x) {\n  if contains(xs, x) { return len(xs) }\n  return 0\n}\nprint(has2("abx", "x"), has2(["a", "b"], "b"), has2([1, 2], 3))\nfn firstPos(xs, x) { return indexOf(xs, x) }\nmatch firstPos([5, 6], 6) { ok(i) => print(i)  err(e) => print(e) }\nmatch firstPos("hello", "l") { ok(i) => print(i)  err(e) => print(e) }\n', 'aby\n3 2 0\n1\n2'],
  ['empty map filled later, at top level and in a fn', 'let m = {}\nm["a"] = 1\nm["b"] = m["a"] + 1\nfn tally(ws) {\n  let c = {}\n  for w in ws { c[w] = if has(c, w) { c[w] + 1 } else { 1 } }\n  return c\n}\nprint(m, tally(["a", "b", "a"]))\n', '{"a": 1, "b": 2} {"a": 2, "b": 1}'],
  ['str(json null) is the text null; isNull gives empty output', 'match parseJson(`{"a": null}`) {\n  ok(j) => {\n    let v = field(j, "a")\n    print("[${str(v)}] [${if isNull(v) { "" } else { str(v) }}] [${str(field(j, "zz"))}]")\n  }\n  err(e) => print(e)\n}\n', '[null] [] [null]'],
  ['checkLogin/askLogin: Basic auth helpers outside serve', 'print(checkLogin("Basic eDpwdw==", "pw"), checkLogin("Basic eDpwdw==", "no"), checkLogin("", "pw"), askLogin("admin"))\n', 'true false false <response 401 text/plain; charset=utf-8>'],
];
for (const [name, src, want] of outputTests) {
  const res = runProgram(src);
  const pass = res.ok && res.output === want;
  console.log(`\n=== output: ${name} — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) { console.log(res.error || res.output); console.log('wanted:\n' + want); failures++; }
}

// ---------- modules: multi-file programs (compile-test runs the good ones on both backends) ----------
const here = dirname(fileURLToPath(import.meta.url));
const modRoot = join(here, 'compile-test', 'modules');
const badRoot = join(here, 'compile-test', 'modules-bad');
const goodHost = await nodeHost(modRoot), badHost = await nodeHost(badRoot);
const loadDir = (root, host, dir) => () => { const f = join(root, dir, 'main.vow'); return loadProgram(readFileSync(f, 'utf8'), f, host); };
const moduleOutputTests = [
  ['basics', 'V { x: 4, y: 6 } 10 52\n4 square at 1,2 with area 4 (corner length 2.2)\n2 x 6\n52 4\n[5, 52] true\ntrue {"corner":{"x":0,"y":0},"side":5}'],
  ['shadow', "[2, 4] 2 main's map 99 main helper module helper"],
  ['random', '[4, 4, 6, 4, 3] heads\n[1, 2, 3]'],
  ['caps', 'failed: httpGet is only available in the Vow CLI; the browser playground cannot reach the network\nenv is only available in the Vow CLI; the browser playground has no environment variables'],
  ['tests', '12'], // the imported module's test blocks (one fails on purpose) are skipped
];
for (const [dir, want] of moduleOutputTests) {
  const res = runProgram('', loadDir(modRoot, goodHost, dir));
  const pass = res.ok && res.output === want;
  console.log(`\n=== modules output: ${dir} — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) { console.log(res.error || res.output); console.log('wanted:\n' + want); failures++; }
}
// runs until a trap: output so far + the diagnostic (with file paths and call stack)
const moduleTrapTests = [
  ['contract-caller', '6\n3', ['ContractViolation: fn bank.withdraw was called with arguments that break its contract', '→ contract-caller/main.vow, line 5', 'The bug is in the CALLER']],
  ['contract-callee', '3\n4', ['fn stats.spread broke its own promise', '→ contract-callee/stats.vow, line 3', 'The bug is INSIDE fn stats.spread']],
  ['trap', '3', ['→ trap/deep.vow, line 3', 'at fn deep.toNum (trap/deep.vow, line 3)', 'at fn (lambda) (trap/parse.vow, line 2)', 'at fn parse.total (trap/parse.vow, line 2)']],
];
for (const [dir, out, needles] of moduleTrapTests) {
  const res = runProgram('', loadDir(modRoot, goodHost, dir));
  const pass = !res.ok && res.output === out && needles.every(n => res.error.includes(n));
  console.log(`\n=== modules trap: ${dir} — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) { console.log(res.output); console.log(res.error); failures++; }
}
const moduleDiagTests = [
  ['field-needs-import', ["'.terms' is a field of struct Cat in rules.vow, which this file does not import", 'import "./rules.vow" as rules']],
  ['missing', ['ImportError: can\'t find the module "./geom.vow"', '→ missing/main.vow, line 1', 'missing/geom.vow (', 'did you mean "./geo.vow"?']],
  ['cycle', ['import cycle: cycle/a.vow -> cycle/b.vow -> cycle/a.vow', '→ cycle/b.vow, line 1']],
  ['unknown-name', ["module geo has no fn or struct named 'aera'", 'did you mean geo.area?']],
  ['dup-alias', ["the name 'g' is already used for another import", 'Line 1 imports "./geo.vow" as g']],
  ['same-file-twice', ['same-file-twice/geo.vow is already imported as g', 'use g.name everywhere']],
  ['alias-no-dot', ["'geo' is a module, not a value", 'geo.area']],
  ['alias-called', ["'geo' is a module, not a value", 'call a fn from it: geo.area']],
  ['private', ['geo._sq is private to private/geo.vow', 'without the _ to export it']],
  ['nested-not-exported', ['geo.helper is not exported', 'nested fn inside fn area']],
  ['module-top-level-code', ['modules may only contain fn, struct and import at the top level', '→ module-top-level-code/config.vow, line 1']],
  ['bare-call-hint', ["'area' is in an imported module: write geo.area(...)"]],
  ['bare-struct-hint', ['write geo.Point { x: ..., y: ... }']],
  ['struct-without-literal', ['geo.Point is a struct, not a value', 'geo.Point { x: ..., y: ... }']],
  ['import-after-code', ['imports go at the top of the file', '→ import-after-code/main.vow, line 2']],
  ['import-without-as', ["expected 'as' after the import path", 'import "./geo.vow" as geo']],
  ['import-not-relative', ['import paths start with ./ or ../', 'import "./geo.vow" as geo']],
  ['import-no-extension', ['an import path names a .vow file', 'import "./geo.vow" as geo']],
  ['alias-is-builtin', ["'text' is a builtin function, so it can't name a module", 'as textMod']],
  ['alias-reused-as-variable', ["'geo' is the name of an imported module"]],
  ['type-error-in-module', ["'n' would change type from num to str", '→ type-error-in-module/geo.vow, line 3', '3 |   n = "five"']],
  ['syntax-error-in-module', ['→ syntax-error-in-module/geo.vow, line 3']],
  ['module-cannot-see-main', ["'unit' is defined in the main file, which a module can't see", '→ module-cannot-see-main/geo.vow, line 1']],
  ['undeclared-effect-in-module', ["fn get uses the 'net' capability without declaring it", '→ undeclared-effect-in-module/net.vow, line 2']],
  ['caller-must-declare-imported-effect', ["fn page uses the 'net' capability without declaring it", "calls fn net.get, which declares 'uses net'", 'fn page(...) uses net']],
  ['wrong-arg-count-shows-alias', ['fn geo.area takes 1 argument, but got 2', 'call it as geo.area(arg1)']],
  ['unknown-field-of-module-struct', ["struct geo.Point has no field 'z'", "did you mean 'x'?"]],
];
for (const [dir, needles] of moduleDiagTests) {
  let res;
  try { res = runProgram('', loadDir(badRoot, badHost, dir)); }
  catch (e) { res = { ok: false, error: `crash: ${e.stack}` }; }
  const pass = !res.ok && needles.every(n => (res.error || '').includes(n));
  console.log(`\n=== modules diag: ${dir} — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) { console.log(res.error || res.output || '(no error)'); failures++; }
}
// hosts with no files around the program: a clear message instead of a confusing failure
{
  const res = runProgram('import "./geo.vow" as geo\nprint(geo.area(1))\n');
  const pass = !res.ok && res.error.includes('imports work in the Vow CLI; this runs one file');
  console.log(`\n=== modules: import without a file system — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) { console.log(res.error || res.output); failures++; }
}
// the CLI sandbox sees capabilities declared in imported modules before running anything
{
  const cli = (args) => spawnSync(process.execPath, [join(here, 'cli.js'), ...args], { cwd: modRoot, encoding: 'utf8' });
  const checks = [
    ['--sandbox refuses a program whose imported module declares net', cli(['--sandbox', 'caps/main.vow']),
      r => r.status === 3 && r.stdout === '' && r.stderr.includes('SandboxError') && r.stderr.includes("net: calls fn report") && r.stderr.includes("env: calls fn fetch.home, which declares 'uses env'") && r.stderr.includes('Nothing was run')],
    ['--sandbox: a main file with no net code of its own still cannot reach the network through a module', cli(['--sandbox', '../modules-bad/sandbox-net-through-import/main.vow']),
      r => r.status === 3 && r.stdout === '' && r.stderr.includes("net: calls fn greeting.hello, which declares 'uses net'") && r.stderr.includes('Likely fix: remove that access, or run with --allow net')],
    ['--allow fs does not grant net to an imported module', cli(['--allow', 'fs=.', '../modules-bad/sandbox-net-through-import/main.vow']), r => r.status === 3 && r.stderr.includes('net: calls fn greeting.hello')],
    ['--allow env alone still refuses the imported net use', cli(['--allow', 'env', 'caps/main.vow']), r => r.status === 3 && r.stderr.includes('net:') && !r.stderr.includes('env:')],
    ['--allow net,env grants it (checked with --check, no network)', cli(['--allow', 'net,env', '--check', 'caps/main.vow']), r => r.status === 0 && r.stdout.includes('and 1 imported module type-check')],
    ['--check checks the whole module graph', cli(['--check', '../modules-bad/type-error-in-module/main.vow']), r => r.status === 1 && r.stderr.includes('type-error-in-module/geo.vow, line 3')],
    ['a pure multi-file program runs under --sandbox', cli(['--sandbox', 'basics/main.vow']), r => r.status === 0 && r.stdout.startsWith('V { x: 4, y: 6 } 10 52')],
  ];
  for (const [name, r, ok] of checks) {
    const pass = ok(r);
    console.log(`\n=== modules cli: ${name} — ${pass ? 'PASS' : 'FAIL'} ===`);
    if (!pass) { console.log(`exit ${r.status}\n${r.stdout}\n${r.stderr}`); failures++; }
  }
}

// stdin, the step cap, output ordering and httpRequest's sandbox: real CLI processes
{
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const tmpDir = mkdtempSync(join((await import('node:os')).tmpdir(), 'vow-test-'));
  const prog = (name, src) => { const f = join(tmpDir, name + '.vow'); writeFileSync(f, src); return f; };
  const exampleFromMd = (id) => {
    const md = readFileSync(join(here, 'bench', 'EXAMPLES.md'), 'utf8');
    const section = md.slice(md.indexOf(`\n## ${id}\n`) + 1).split('\n## ')[0];
    const blocks = [...section.matchAll(/\n```\n([\s\S]*?)\n```/g)]; // the program is the section's last code block
    if (!blocks.length) throw new Error(`bench/EXAMPLES.md has no ## ${id} program`);
    return blocks[blocks.length - 1][1] + '\n';
  };
  const cli = (args, input) => spawnSync(process.execPath, [join(here, 'cli.js'), ...args], { cwd: here, encoding: 'utf8', input: input ?? '' });
  const guess = prog('guess', 'let secret = 42\nlet tries = 0\nprint("guess:")\nwhile true {\n  match readLine() {\n    err(e) => {\n      print("bye (${e})")\n      break\n    }\n    ok(line) => {\n      tries = tries + 1\n      match int(trim(line)) {\n        err(e) => print("not a number: ${line}")\n        ok(g) => {\n          if g < secret { print("higher") }\n          else if g > secret { print("lower") }\n          else {\n            print("got it in ${tries}")\n            break\n          }\n        }\n      }\n    }\n  }\n}\n');
  const all = prog('all', 'match readLine() { ok(l) => print("first: ${l}")  err(e) => print(e) }\nmatch readAll() { ok(t) => print("rest:", lines(t), len(t))  err(e) => print(e) }\nmatch readLine() { ok(l) => print(l)  err(e) => print("then: ${e}") }\n');
  const loop = prog('loop', 'let i = 0\nwhile true { i = i + 1 }\n');
  // the form-signups program in bench/EXAMPLES.md (keep the two in sync) and its stated output
  const urlq = prog('urlq', exampleFromMd('form-signups'));
  const urlqIn = 'name=Zo%C3%AB+Li&city=S%C3%A3o+Paulo\ncity=Oslo\nname=Al&city=New+York\nname=x&city=bad%zz\n';
  const urlqOut = 'Zo\u00eb Li from S\u00e3o Paulo, map: https://maps.example.com/?q=S%C3%A3o%20Paulo\nskipped: missing name\nAl from New York, map: https://maps.example.com/?q=New%20York\nskipped: "bad%zz" is not valid URL encoding (a % must be followed by two hex digits)\n2 signups\n';
  const heavy = prog('heavy', 'let n = 0\nfor i in range(0, 3000) { n = n + 1 }\nprint(n)\n');
  const order = prog('order', 'for i in range(0, 3000) { print("line ${i}") }\nlet xs = [1]\nprint(xs[5])\n');
  const net = prog('net', 'fn f() uses net { return httpRequest("GET", "https://api.github.com/x", {"User-Agent": "vow"}, "") }\nmatch f() { ok(r) => print(r.status)  err(e) => print(e) }\n');
  const guessOut = 'guess:\nhigher\nlower\nnot a number: abc\ngot it in 4\n';
  const checks = [
    ['readLine: piped input, \\r\\n and a partial last line', cli([guess], '10\r\n50\nabc\n42'), r => r.status === 0 && r.stdout === guessOut && r.stderr === ''],
    ['readLine on --interp', cli(['--interp', guess], '10\n50\nabc\n42\n'), r => r.status === 0 && r.stdout === guessOut],
    ['readLine at end of input is an err', cli([guess], '1\n'), r => r.status === 0 && r.stdout === 'guess:\nhigher\nbye (end of input)\n'],
    ['readAll takes the rest after readLine, then readLine sees the end', cli([all], 'a\nb\nc\n'), r => r.status === 0 && r.stdout === 'first: a\nrest: ["b", "c"] 4\nthen: end of input\n'],
    ['readAll on empty input is ok("")', cli(['--interp', all], ''), r => r.status === 0 && r.stdout === 'end of input\nrest: [] 0\nthen: end of input\n'],
    ['EXAMPLES.md form-signups: urlDecode/urlEncode/readLine (compiled)', cli([urlq], urlqIn), r => r.status === 0 && r.stdout === urlqOut && r.stderr === ''],
    ['EXAMPLES.md form-signups on --interp', cli(['--interp', urlq], urlqIn), r => r.status === 0 && r.stdout === urlqOut],
    ['--max-steps N stops an infinite loop and names the flag', cli(['--max-steps', '1000', loop]), r => r.status === 1 && r.stderr.includes('ran over 1,000 steps') && r.stderr.includes('heavy legitimate work') && r.stderr.includes('--max-steps 10000')],
    ['--max-steps on --interp gives the same message', cli(['--interp', '--max-steps', '1000', loop]), r => r.status === 1 && r.stderr.includes('ran over 1,000 steps') && r.stderr.includes('--max-steps 10000')],
    ['--check on a file without tests suggests writing them', cli(['--check', heavy]), r => r.status === 0 && r.stdout.includes('No tests yet') && r.stdout.includes('vow test')],
    ['--max-steps 0 means no limit', cli(['--max-steps', '0', heavy]), r => r.status === 0 && r.stdout === '3000\n'],
    ['--max-steps rejects a non-number', cli(['--max-steps', 'lots', heavy]), r => r.status === 2 && r.stderr.includes('--max-steps takes a whole number')],
    ['output printed before a trap stays before the error (same destination)', cli([order]), r => r.status === 1 && r.stdout.endsWith('line 2999\n') && r.stderr.includes('index 5 is out of range')],
    ['httpRequest obeys the net allow-list', cli(['--sandbox', '--allow', 'net=example.com', net]), r => r.status === 0 && r.stdout === 'sandbox: net access to api.github.com is not allowed (--allow net=...)\n'],
    ['httpRequest needs net under --sandbox', cli(['--sandbox', net]), r => r.status === 3 && r.stderr.includes("net: calls fn f, which declares 'uses net'")],
  ];
  // the same destination for stdout and stderr: every printed line must come before the error text
  const both = spawnSync(process.execPath, [join(here, 'cli.js'), order], { cwd: here, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  checks.push(['stdout+stderr interleave in program order', { status: both.status, stdout: both.stdout, stderr: both.stderr }, r => r.stdout.split('\n').length === 3001]);
  for (const [name, r, ok] of checks) {
    const pass = ok(r);
    console.log(`\n=== cli: ${name} — ${pass ? 'PASS' : 'FAIL'} ===`);
    if (!pass) { console.log(`exit ${r.status}\n${r.stdout}\n${r.stderr}`); failures++; }
  }
}

// ---------- built-in tests: test "name" { ... } blocks, `vow test`, run(args, stdin) on both backends ----------
{
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const tmpDir = mkdtempSync(join((await import('node:os')).tmpdir(), 'vow-test-blocks-'));
  const prog = (name, src) => { const f = join(tmpDir, name + '.vow'); writeFileSync(f, src); return f; };
  const exampleFromMd = (id) => {
    const md = readFileSync(join(here, 'bench', 'EXAMPLES.md'), 'utf8');
    const section = md.slice(md.indexOf(`\n## ${id}`) + 1).split('\n## ')[0];
    const blocks = [...section.matchAll(/\n```\n([\s\S]*?)\n```/g)];
    if (!blocks.length) throw new Error(`bench/EXAMPLES.md has no ## ${id} program`);
    return { program: blocks[blocks.length - 1][1] + '\n', report: blocks[0][1] + '\n' };
  };
  const cli = (args, input) => spawnSync(process.execPath, [join(here, 'cli.js'), ...args], { cwd: here, encoding: 'utf8', input: input ?? '' });

  // in-process, both backends: the same report, with the failure messages an agent reads
  const suite = 'fn sq(n) { return n * n }\nfn parse(s) { return num(s) }\nlet a = args()\nif len(a) == 0 { print("usage") } else {\n  match readLine() {\n    ok(l) => print("${a[0]}:${l}")\n    err(e) => print("${a[0]}:${e}")\n  }\n}\n'
    + 'test "passes" {\n  expectEq(sq(3), 9)\n  expectErr(parse("x"))\n  expectEq(parse("4"), ok(4))\n  expect(sq(2) == 4)\n}\n'
    + 'test "run captures args and stdin" {\n  expectEq(run([], ""), "usage\\n")\n  expectEq(run(["k"], "v1\\nv2"), "k:v1\\n")\n  expectEq(run(["k"], ""), "k:end of input\\n")\n}\n'
    + 'test "expectEq failure" { expectEq(run(["k"], "v"), "usage\\nk:v\\n") }\n'
    + 'test "expect failure" { expect(sq(2) == 5) }\n'
    + 'test "expectErr failure" { expectErr(parse("7")) }\n'
    + 'test "trap in the test" { print(sq([1][3])) }\n';
  const report = async (make) => {
    const lines = [];
    const ast = parse(suite); check(suite, ast);
    const tests = make(ast, lines);
    const results = await runTests(tests, { src: suite });
    return { ...formatReport(results, { total: tests.length }), printed: lines.join('\n') };
  };
  const interp = await report((ast, lines) => createRun(suite, ast, { out: (s) => lines.push(s) }).tests);
  const compiled = await report((ast, lines) => createCompiledRun(suite, ast, { out: (s) => lines.push(s) }).tests);
  const needles = ['✓ passes', '✓ run captures args and stdin', '✗ expectEq failure', 'expected: "usage\\nk:v\\n"', 'actual:   "k:v\\n"',
    'first difference at line 1: expected "usage", actual "k:v"', '✗ expect failure', 'The condition sq(2) == 5 is false.', '✗ expectErr failure',
    'expected an err, actual: ok(7)', '✗ trap in the test', 'index 3 is out of range', '6 tests, 2 passed, 4 failed'];
  const checks = [
    ['in-process: the interpreter report has every message and nothing printed outside run()', interp, r => r.code === 1 && r.printed === '' && needles.every(n => r.text.includes(n))],
    ['in-process: the compiled backend prints the identical report', compiled, r => r.text === interp.text && r.code === interp.code && r.printed === ''],
  ];

  // the CLI: exit codes, one line per test, the summary, --filter, imports, the EXAMPLES.md program
  const f = prog('suite', suite);
  const temp = exampleFromMd('temperature-converter');
  const tempF = prog('temp', temp.program);
  const noTests = prog('notests', 'print(1)\n');
  const modMain = join(here, 'compile-test', 'modules', 'tests', 'main.vow');
  const modGeo = join(here, 'compile-test', 'modules', 'tests', 'geo.vow');
  checks.push(
    ['vow test: exit 1 with the report on stdout (compiled)', cli(['test', f]), r => r.status === 1 && r.stderr === '' && r.stdout === interp.text + '\n'],
    ['vow test --interp prints the same report', cli(['--interp', 'test', f]), r => r.status === 1 && r.stdout === interp.text + '\n'],
    ['vow test --filter runs only matching tests and exits 0 when they pass', cli(['test', f, '--filter', 'passes']), r => r.status === 0 && r.stdout === '✓ passes\n1 test, 1 passed\n'],
    ['vow test --filter with no match exits 1', cli(['test', f, '--filter', 'zzz']), r => r.status === 1 && r.stdout.includes('no test name contains "zzz" (6 tests')],
    ['vow test on a file without tests exits 1 and says how to write one', cli(['test', noTests]), r => r.status === 1 && r.stdout.includes('no tests in') && r.stdout.includes('test "name" { ... }')],
    ['vow test rejects a stray argument', cli(['test', f, 'extra']), r => r.status === 2 && r.stderr.includes('vow test takes a file')],
    ['a normal run never enters the test blocks', cli([f, 'k'], 'line\n'), r => r.status === 0 && r.stdout === 'k:line\n' && r.stderr === ''],
    ['--check type-checks the test blocks too', cli(['--check', prog('badtest', 'fn sq(n) { return n * n }\ntest "t" { expectEq(sq("2"), 4) }\n')]), r => r.status === 1 && r.stderr.includes('argument 1 of sq should be num')],
    ['imports: the module\'s tests are skipped, the main file\'s run', cli(['test', modMain]), r => r.status === 0 && r.stdout === '✓ main test calls the module\n✓ run from main\n2 tests, 2 passed\n'],
    ['imports: running the module file itself runs its tests', cli(['test', modGeo]), r => r.status === 1 && r.stdout.startsWith('✓ area\n✗ area wrong on purpose\n') && r.stdout.includes('expected: 4') && r.stdout.endsWith('2 tests, 1 passed, 1 failed\n')],
    ['--check on a file with tests does not nag', cli(['--check', tempF]), r => r.status === 0 && !r.stdout.includes('No tests yet')],
    ['EXAMPLES.md temperature-converter: vow test prints its stated report (compiled)', cli(['test', tempF]), r => r.status === 0 && r.stderr === '' && r.stdout === temp.report],
    ['EXAMPLES.md temperature-converter on --interp', cli(['--interp', 'test', tempF]), r => r.status === 0 && r.stdout === temp.report],
    ['EXAMPLES.md temperature-converter: the stated normal run', cli([tempF, '100C', '50F', 'abcC', '7']), r => r.status === 0 && r.stdout === '100C = 212F\n50F = 10C\nerror: not a number: abcC\nerror: unknown unit: 7\n'],
    ['EXAMPLES.md temperature-converter: stdin mode', cli([tempF], '10C\n\nbadF\n'), r => r.status === 0 && r.stdout === '10C = 50F\nerror: not a number: badF\n2 converted\n'],
  );
  for (const [name, r, ok] of checks) {
    const pass = ok(r);
    console.log(`\n=== test blocks: ${name} — ${pass ? 'PASS' : 'FAIL'} ===`);
    if (!pass) { console.log(r.status !== undefined ? `exit ${r.status}\n${r.stdout}\n${r.stderr}` : `code ${r.code}\n${r.text}\nprinted: ${r.printed}`); failures++; }
  }
}

console.log(failures === 0 ? '\nALL GOOD' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
