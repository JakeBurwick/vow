// Dev smoke tests (node test.js). The real product is the browser playground.
import { parse } from './lang/parser.js';
import { check } from './lang/checker.js';
import { createRun } from './lang/interp.js';
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
  ['ambiguous field rejected', 'struct A { x }\nstruct B { x }\nfn f(v) { return v.x }\nprint(f(A { x: 1 }))\n', false],
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
];
for (const [name, src, mustContain] of diagTests) {
  const res = runProgram(src);
  const pass = !res.ok && (res.error || '').includes(mustContain);
  console.log(`\n=== diag: ${name} — ${pass ? 'PASS' : 'FAIL'} ===`);
  if (!pass) { console.log(res.error || res.output || '(no error)'); failures++; }
}

// programs whose exact output is checked: ${} interpolation, literal braces, escapes, recursive closures
const outputTests = [
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
  ["random: seeded sequence, randomInt bounds inclusive", "print(random(), random())\nprint(randomInt(1, 6), randomInt(1, 6), randomInt(1, 6), randomInt(0 - 3, 3), randomInt(10, 10))\nlet seen = {}\nlet inRange = true\nfor i in range(0, 600) {\n  let n = randomInt(1, 3)\n  if n < 1 or n > 3 or not isInt(n) { inRange = false }\n  seen[str(n)] = true\n}\nprint(sort(keys(seen)), inRange)\nlet r = random()\nprint(r >= 0 and r < 1)\n", "0.6270739406 0.5274470402\n6 4 3 0 10\n[\"1\", \"2\", \"3\"] true\ntrue"],
  ["user fns and variables shadow the math/random/date builtins", "fn log(msg) { return \"[log] \" + msg }\nfn random(xs) { return xs[0] }\nlet pi = 3\nlet e = 2\nfn sqrt(a, b) { return a + b }\nprint(log(\"hi\"), random([7, 8]), pi, e, sqrt(1, 2))\nfn outer() {\n  let ceil = 10\n  let trunc = x => x * 2\n  return ceil + trunc(4) + floor(2.5)\n}\nprint(outer())\nlet dateParts = \"none\"\nprint(dateParts, exp(0))\n", "[log] hi 7 3 2 3\n20\nnone 1"],
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

console.log(failures === 0 ? '\nALL GOOD' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
