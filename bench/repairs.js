// Repair-mode cases: working programs with ONE planted bug, the same bug in
// both languages. The agent gets the broken program + the judge's output and
// must fix it. This isolates what the benchmark actually tests: do Vow's
// repair-prompt diagnostics fix bugs in fewer attempts than Python tracebacks?
//
// `note` describes the planted bug + which layer catches it — never shown to agents.

export const REPAIRS = [
  {
    id: 'typo-var',
    task: 'grade',
    note: 'Misspelled variable (scre). Vow: compile-time undefined-var with did-you-mean. Python: NameError at runtime, only on the score<90 path.',
    vow: `fn letter(score) {
  if score >= 90 { return "A" }
  if scre >= 80 { return "B" }
  if score >= 70 { return "C" }
  if score >= 60 { return "D" }
  return "F"
}
match num(args()[0]) {
  ok(s) => print(letter(s))
  err(e) => print(e)
}
`,
    py: `import sys

def letter(score):
    if score >= 90: return "A"
    if scre >= 80: return "B"
    if score >= 70: return "C"
    if score >= 60: return "D"
    return "F"

print(letter(int(sys.argv[1])))
`,
  },
  {
    id: 'type-init',
    task: 'sum-csv',
    note: 'Accumulator initialized to the string "0" instead of 0. Vow: compile-time type mismatch at the += line. Python: TypeError at runtime.',
    vow: `fn parseOr(p) {
  let r = match num(p) {
    ok(n) => ok(n)
    err(e) => err("bad input: " + p)
  }
  return r
}
fn total(input) {
  let pieces = split(input, ",")
  let sum = "0"
  for p in pieces {
    sum = sum + parseOr(p)?
  }
  return ok(sum)
}
match total(args()[0]) {
  ok(t) => print(t)
  err(e) => print(e)
}
`,
    py: `import sys

def main():
    pieces = sys.argv[1].split(",")
    total = "0"
    for p in pieces:
        try:
            n = int(p)
        except ValueError:
            print("bad input: " + p)
            return
        total = total + n
    print(total)

main()
`,
  },
  {
    id: 'off-by-one',
    task: 'fizzbuzz-n',
    note: 'Control case: range(1, n) instead of range(1, n + 1). Pure logic bug — neither language produces a diagnostic, only a wrong-output diff. Measures the repair floor.',
    vow: `match num(args()[0]) {
  ok(n) => {
    for i in range(1, n) {
      if i % 15 == 0 { print("FizzBuzz") }
      else {
        if i % 3 == 0 { print("Fizz") }
        else {
          if i % 5 == 0 { print("Buzz") }
          else { print(i) }
        }
      }
    }
  }
  err(e) => print(e)
}
`,
    py: `import sys

n = int(sys.argv[1])
for i in range(1, n):
    if i % 15 == 0:
        print("FizzBuzz")
    elif i % 3 == 0:
        print("Fizz")
    elif i % 5 == 0:
        print("Buzz")
    else:
        print(i)
`,
  },
  {
    id: 'missing-key',
    task: 'json-name',
    note: 'Indexes j["name"] without handling absence. Vow: runtime trap with repair prompt suggesting get(...). Python: KeyError traceback.',
    vow: `fn nameOf(s) {
  let j = parseJson(s)?
  return jsonStr(j["name"])
}
match nameOf(args()[0]) {
  ok(n) => print(n)
  err(e) => print("no name")
}
`,
    py: `import sys, json

try:
    j = json.loads(sys.argv[1])
except Exception:
    print("no name")
    sys.exit()

name = j["name"]
if isinstance(name, str):
    print(name)
else:
    print("no name")
`,
  },
  {
    id: 'empty-pop',
    task: 'brackets',
    note: 'Pops the stack without handling the empty case. Vow: compile error (pop returns a Result; the ? clashes with the fn\'s str returns). Python: IndexError at runtime on ")(".',
    vow: `fn check(s) {
  let stack = []
  for c in split(s, "") {
    if c == "(" or c == "[" or c == "{" {
      push(stack, c)
    } else {
      let open = pop(stack)?
      if c == ")" and open != "(" { return "no" }
      if c == "]" and open != "[" { return "no" }
      if c == "}" and open != "{" { return "no" }
    }
  }
  if len(stack) == 0 { return "yes" }
  return "no"
}

print(check(args()[0]))
`,
    py: `import sys

def check(s):
    stack = []
    pairs = {")": "(", "]": "[", "}": "{"}
    for c in s:
        if c in "([{":
            stack.append(c)
        else:
            opener = stack.pop()
            if pairs[c] != opener:
                return "no"
    return "yes" if not stack else "no"

print(check(sys.argv[1]))
`,
  },
  {
    id: 'multi-rpn',
    task: 'rpn-calc',
    note: 'THREE bugs: (1) typo bb in the + branch — Vow compile did-you-mean vs Python NameError; (2) pops swapped (a popped first) — silent wrong-output on - and /; (3) no division-by-zero guard — Vow trap vs Python ZeroDivisionError. Fixing one reveals the next.',
    vow: `fn applyOp(a, b, op) {
  if op == "+" { return ok(a + bb) }
  if op == "-" { return ok(a - b) }
  if op == "*" { return ok(a * b) }
  if op == "/" { return ok(a / b) }
  return err("unknown operator")
}

fn evalRpn(expr) {
  let tokens = split(expr, " ")
  let stack = []
  for t in tokens {
    if t == "+" or t == "-" or t == "*" or t == "/" {
      let a = pop(stack)?
      let b = pop(stack)?
      let r = applyOp(a, b, t)?
      push(stack, r)
    } else {
      let n = num(t)?
      push(stack, n)
    }
  }
  if len(stack) != 1 { return err("leftover operands") }
  return get(stack, 0)
}

fn main() {
  let argv = args()
  let expr = get(argv, 0)?
  let result = evalRpn(expr)?
  return ok(result)
}

match main() {
  ok(v)  => print(v)
  err(e) => print("error")
}
`,
    py: `import sys

def main():
    tokens = sys.argv[1].split(" ")
    stack = []
    for tok in tokens:
        if tok in ("+", "-", "*", "/"):
            if len(stack) < 2:
                print("error")
                return
            a = stack.pop()
            b = stack.pop()
            if tok == "+":
                stack.append(a + bb)
            elif tok == "-":
                stack.append(a - b)
            elif tok == "*":
                stack.append(a * b)
            else:
                stack.append(int(a / b))
        else:
            try:
                n = int(tok)
            except ValueError:
                print("error")
                return
            stack.append(n)
    if len(stack) != 1:
        print("error")
        return
    print(stack[0])

main()
`,
  },
  {
    id: 'multi-users',
    task: 'json-users',
    note: 'THREE bugs: (1) age > 18 instead of >= — silent wrong-output (Bo, exactly 18, dropped); (2) unsafe name access without presence handling — Vow index trap vs Python KeyError; (3) error handler prints the error message instead of the spec\'d "invalid" — wrong-output on bad inputs.',
    vow: `fn adultNames(s) {
  let j = parseJson(s)?
  if jsonType(j) != "array" { return err("not an array") }
  let items = jsonList(j)?
  let names = []
  for item in items {
    if jsonType(item) != "object" { return err("element not an object") }
    let n = jsonStr(item["name"])?
    let a = jsonNum(get(item, "age")?)?
    if a > 18 { push(names, n) }
  }
  return ok(names)
}

fn run() {
  let s = get(args(), 0)?
  let names = adultNames(s)?
  for n in names { print(n) }
  return ok(true)
}

match run() {
  ok(v) => {
    let done = v
  }
  err(e) => {
    print(e)
  }
}
`,
    py: `import sys, json

def adult_names(s):
    data = json.loads(s)
    if not isinstance(data, list):
        raise ValueError("not an array")
    names = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("element not an object")
        name = item["name"]
        if not isinstance(name, str):
            raise ValueError("name not a string")
        age = item.get("age")
        if isinstance(age, bool) or not isinstance(age, (int, float)):
            raise ValueError("age not a number")
        if age > 18:
            names.append(name)
    return names

try:
    for n in adult_names(sys.argv[1]):
        print(n)
except ValueError as e:
    print(e)
`,
  },
  {
    id: 'multi-freq',
    task: 'word-freq',
    note: 'FOUR bugs: (1) typo "winer" in the output line — Vow compile did-you-mean vs Python NameError; (2) output has a "most frequent: " prefix the spec forbids — every check fails on wrong output; (3) outer candidate loop starts at index 1, so the first word is never a candidate — fails "x y z"; (4) ">=" instead of ">" when updating the best breaks the earliest-first tie-break — fails "b a b a". Bugs 3 and 4 interact: both must be fixed before the tie-break check passes.',
    vow: `fn mostFrequent(sentence) {
  let words = split(sentence, " ")
  let bestWord = ""
  let bestCount = 0
  for i in range(1, len(words)) {
    let w = words[i]
    let count = 0
    for j in range(0, len(words)) {
      if words[j] == w { count = count + 1 }
    }
    if count >= bestCount {
      bestCount = count
      bestWord = w
    }
  }
  return ok(bestWord)
}

fn run() {
  let argv = args()
  let sentence = get(argv, 0)?
  let winner = mostFrequent(sentence)?
  print("most frequent: \${winer}")
  return ok(true)
}

match run() {
  ok(v) => {
    let done = v
  }
  err(e) => {
    print("error")
  }
}
`,
    py: `import sys

def most_frequent(sentence):
    words = sentence.split(" ")
    best_word = ""
    best_count = 0
    for i in range(1, len(words)):
        w = words[i]
        count = 0
        for j in range(len(words)):
            if words[j] == w:
                count += 1
        if count >= best_count:
            best_count = count
            best_word = w
    return best_word

winner = most_frequent(sys.argv[1])
print(f"most frequent: \${winer}")
`,
  },
];
