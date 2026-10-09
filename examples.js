// Example programs for the Vow playground.
// Inside these template literals, \${ writes a literal ${ for Vow's string interpolation.

export const EXAMPLES = [
  {
    id: 'tour',
    name: 'Welcome tour',
    code: `// Welcome to Vow, a language built for AI agents to write.
// Types are inferred, errors are values, contracts are built in.

let name = "world"
print("hello, \${name}")

// Lists and loops
let primes = [2, 3, 5, 7, 11]
let total = 0
for p in primes {
  total = total + p
}
print("sum of primes: \${total}")

// Maps have string keys, kept in insertion order
let scores = {"ada": 95, "grace": 91, "alan": 88}
for k in keys(scores) {
  print("\${k} scored \${scores[k]}")
}

// Errors are values: num() returns a Result you must handle
match num("42") {
  ok(n) => print("parsed: \${n * 2}")
  err(e) => print("could not parse: \${e}")
}

// match also works as an expression
let fallback = match num("oops") {
  ok(n) => n
  err(e) => 0
}
print("fallback value: \${fallback}")
`,
  },
  {
    id: 'fizzbuzz',
    name: 'FizzBuzz',
    code: `// FizzBuzz, the classic
for i in range(1, 31) {
  if i % 15 == 0 {
    print("FizzBuzz")
  } else if i % 3 == 0 {
    print("Fizz")
  } else if i % 5 == 0 {
    print("Buzz")
  } else {
    print(i)
  }
}
`,
  },
  {
    id: 'fib',
    name: 'Recursive Fibonacci',
    code: `// Recursive Fibonacci with a contract:
// callers must never pass a negative n.
fn fib(n)
  expects n >= 0
{
  if n < 2 { return n }
  return fib(n - 1) + fib(n - 2)
}

for i in range(0, 15) {
  print("fib(\${i}) = \${fib(i)}")
}
`,
  },
  {
    id: 'binsearch',
    name: 'Binary search',
    code: `// Binary search over a sorted list.
// "Not found" is not an exception and not a -1: it's an err value.
fn binarySearch(items, target) {
  let lo = 0
  let hi = len(items) - 1
  while lo <= hi {
    let mid = floor((lo + hi) / 2)
    let v = items[mid]
    if v == target { return ok(mid) }
    if v < target { lo = mid + 1 } else { hi = mid - 1 }
  }
  return err("not in the list")
}

let nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]

for target in [23, 91, 2, 7] {
  match binarySearch(nums, target) {
    ok(i) => print("found \${target} at index \${i}")
    err(e) => print("\${target} is \${e}")
  }
}
`,
  },
  {
    id: 'errors',
    name: 'Error handling (Result)',
    code: `// No nulls. No exceptions. Errors are ordinary values
// of type Result, and the checker forces you to handle them.

fn parseAge(input) {
  match int(input) {
    ok(n) => {
      if n < 0 { return err("age can't be negative") }
      if n > 130 { return err("nobody is \${n} years old") }
      return ok(n)
    }
    err(e) => {
      return err("not a whole number: \${input}")
    }
  }
}

let inputs = ["42", "-3", "abc", "200", "27.5"]
for raw in inputs {
  match parseAge(raw) {
    ok(age) => print("\${raw} -> valid age \${age}")
    err(reason) => print("\${raw} -> rejected: \${reason}")
  }
}

// Try deleting the err(...) arm above: Vow won't even run the program.
`,
  },
  {
    id: 'propagate',
    name: 'The ? operator',
    code: `// '?' unwraps a Result: ok(v) becomes v, and err(e) makes the
// whole function return that err to its caller. One character
// instead of a five-line match, and every error still gets handled.

fn parseDims(wRaw, hRaw) {
  let w = num(wRaw)?      // if this is err, parseDims returns it
  let h = num(hRaw)?
  if w <= 0 or h <= 0 {
    return err("dimensions must be positive")
  }
  return ok(w * h)
}

let inputs = [["8", "4"], ["8", "x"], ["-2", "5"], ["12", "3"]]
for pair in inputs {
  match parseDims(pair[0], pair[1]) {
    ok(area) => print("\${pair[0]} x \${pair[1]} -> area \${area}")
    err(e) => print("\${pair[0]} x \${pair[1]} -> error: \${e}")
  }
}
`,
  },
  {
    id: 'structs',
    name: 'Structs',
    code: `// Structs are named records. No type annotations: each field's
// type is inferred from use, and every literal must set ALL
// fields (there are no nulls to fill the gaps).

struct Account {
  owner
  balance
}

fn deposit(acct, amount)
  expects amount > 0
  ensures result.balance >= acct.balance
{
  return Account { owner: acct.owner, balance: acct.balance + amount }
}

// Vow infers that 'acct' is an Account from acct.balance alone.
fn describe(acct) {
  "\${acct.owner} has $\${acct.balance}"
}

let a = Account { owner: "ada", balance: 100 }
print(describe(a))

let b = deposit(a, 50)
print(describe(b))

// Fields can be reassigned (same type for life, like variables):
b.balance = 0
print(b)

// Structs compare by value:
print(a == Account { owner: "ada", balance: 100 })
`,
  },
  {
    id: 'lists',
    name: 'Lists and lambdas',
    code: `// The standard library covers the usual list jobs.
// Lambdas are small unnamed functions: x => x * 2.

struct Order { item, qty, price }

let orders = [
  Order { item: "pen", qty: 4, price: 1.5 },
  Order { item: "book", qty: 1, price: 12 },
  Order { item: "mug", qty: 2, price: 8 },
  Order { item: "pen", qty: 10, price: 1.5 }
]

let totals = map(orders, o => o.qty * o.price)
print(totals)
print("revenue: \${fold(totals, 0, (acc, t) => acc + t)}")
print("big orders: \${count(orders, o => o.qty >= 4)}")
print("any free? \${any(orders, o => o.price == 0)}")
print("items: \${uniq(map(orders, o => o.item))}")

// sortBy takes a key; a block lambda's last line is its value
let ranked = sortBy(orders, o => {
  let total = o.qty * o.price
  0 - total
})
for o in ranked {
  print("\${padRight(o.item, 5, " ")} \${fixed(o.qty * o.price, 2)}")
}

// Functions are generic automatically
fn firstOr(xs, fallback) {
  match get(xs, 0) {
    ok(v) => v
    err(e) => fallback
  }
}
print(firstOr(filter(totals, t => t > 100), 0))
print(firstOr(["a", "b"], "none"))
`,
  },
  {
    id: 'text',
    name: 'Text and patterns',
    code: `// Interpolation uses \${...}; plain braces are just text.
let name = "Ada"
print("{\\"user\\": \\"\${name}\\"}")

// Regex patterns go in backtick strings, so nothing needs escaping.
let log = \`2026-10-08 ERROR disk full
2026-10-08 INFO started
2026-10-09 ERROR timeout after 30s\`

for line in lines(log) {
  match find(line, \`^(\\S+) ERROR (.*)$\`) {
    ok(m) => print("\${m[1]}: \${m[2]}")
    err(e) => {}
  }
}

print(findAll(log, \`\\d+s\`))
print(words("  split   on any\\twhitespace "))
print(replaceAll("a1b22c333", \`\\d+\`, "#"))
print(splitOn("x, y;z", \`\\s*[,;]\\s*\`))
print(matches("ada@example.com", \`^[^@]+@[^@]+$\`))
`,
  },
  {
    id: 'json',
    name: 'Working with JSON',
    code: `// parseJson returns a Result, so bad input is handled up front.
// field() reads a key and gives a json null (not a crash) when it's missing.

let raw = \`{
  "team": "core",
  "members": [
    {"name": "Ada", "role": "lead", "active": true},
    {"name": "Alan", "active": false},
    {"name": "Grace", "role": "", "active": true}
  ]
}\`

match parseJson(raw) {
  ok(doc) => {
    print("team: \${field(doc, "team")}")
    for m in jsonList(field(doc, "members")) {
      let role = field(m, "role")
      // truthy: null, false, 0, "", [] and {} are all false
      let shown = if truthy(role) { str(role) } else { "no role" }
      print("\${field(m, "name")}: \${shown}, active \${field(m, "active")}")
    }
    print(isNull(field(doc, "budget")))
    print(jsonKeys(doc))
  }
  err(e) => print("bad JSON: \${e}")
}

// Bad input is just an err
match parseJson("{not json") {
  ok(j) => print(j)
  err(e) => print("rejected bad input")
}

// toJson turns structs, maps and lists into JSON text
struct Summary { team, size }
print(toJson(Summary { team: "core", size: 3 }))
`,
  },
  {
    id: 'mathdates',
    name: 'Math, random and dates',
    code: `// Math
print(sqrt(2))
print(pow(2, 10))
print(round(exp(1), 3))
print(round(atan2(1, 1) * 4, 5))   // pi
print(ceil(4.2), trunc(0 - 4.7))

// Random numbers (the CLI's --seed flag makes them repeatable)
let roll = randomInt(1, 6)
print("rolled a \${roll}")
print(random() < 1)

// Dates are UTC milliseconds since 1970
let launch = 1791468180000
print(isoDate(launch))
let parts = dateParts(launch)
print("\${parts.year}-\${parts.month}-\${parts.day}, weekday \${parts.weekday}")
match parseDate("2026-12-25") {
  ok(xmas) => print("\${daysBetween(launch, xmas)} days until Dec 25")
  err(e) => print(e)
}
match parseDate("2026-02-30") {
  ok(d) => print(d)
  err(e) => print("rejected: \${e}")
}
`,
  },
  {
    id: 'contracts',
    name: 'Contracts (expects/ensures)',
    code: `// Contracts are part of the function signature.
// expects = what the CALLER must guarantee.
// ensures = what the FUNCTION promises back ('result' is the return value).

fn withdraw(balance, amount)
  expects amount > 0, amount <= balance
  ensures result >= 0
{
  return balance - amount
}

print("after withdrawing 30: \${withdraw(100, 30)}")
print("after withdrawing 70: \${withdraw(70, 70)}")

// This call breaks the contract (amount > balance), so Vow
// halts and says whose bug it is. The amount comes from a string,
// so the checker can't see it in advance; write withdraw(50, 80)
// with plain numbers and Vow refuses to compile at all.
match num("80") {
  ok(amt) => print(withdraw(50, amt))
  err(e) => print(e)
}
`,
  },
  {
    id: 'prove',
    name: 'Static contract proofs',
    code: `// Vow proves contracts before the program runs when it can.
// What it can't prove is still checked at runtime.

// Both returns provably satisfy the promise (result >= 0):
fn dist(n) ensures result >= 0 {
  if n < 0 { return 0 - n }
  return n
}

fn root(n) expects n >= 0 {
  return sqrt(n)
}

// dist ENSURES result >= 0, so this call is proven safe.
print(root(dist(-9)))

// Guards are proofs too: inside "if d > 0" the prover knows
// d can't be zero, so recip's expects holds.
fn recip(d) expects d != 0 { return 1 / d }
fn safePart(d) {
  if d > 0 { return recip(d * 2) }
  return 0
}
print(safePart(4))
print(safePart(0))

// A provably broken call refuses to compile.
// Uncomment this line to see the proof in the error:
// print(root(0 - 4))
`,
  },
  {
    id: 'effects',
    name: 'Capabilities (uses)',
    code: `// A function can't touch the network, files or environment
// unless its signature says so. Reading a signature tells you
// exactly what a function can reach.

// httpGet needs the net capability, so fetch must declare it:
fn fetch(url) uses net {
  return httpGet(url)
}

// Callers inherit the obligation: report calls fetch,
// so report must declare net too.
fn report(url) uses net {
  match fetch(url) {
    ok(body) => print("fetched \${len(body)} bytes")
    err(e) => print("offline: the playground has no network (the CLI does)")
  }
}

// A pure function stays visibly pure. Give this fn a
// 'uses net' clause and Vow rejects it as misleading.
fn shout(s) {
  return upper(s)
}

report("https://example.com")
print(shout("no hidden i/o"))

// Try it: delete 'uses net' from fetch. Vow refuses to compile
// and names the exact call that needs it. In the CLI,
// node cli.js --sandbox --allow net=example.com app.vow
// checks every capability before anything runs.
`,
  },
  {
    id: 'broken',
    name: 'Broken program (see the error)',
    code: `// Intentionally broken: run it to see how Vow reports bugs.
// The error says what's wrong, where, and the likely fix,
// precisely enough that an agent can repair it on its own.

fn total(prices) {
  let sum = 0
  for p in prices {
    sum = sum + p
  }
  return "Total: " + sum
}

print(total([5, 10, 15]))
`,
  },
];
