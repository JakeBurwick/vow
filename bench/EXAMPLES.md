# Verified Vow examples

Each program below passed the benchmark judge. They solve OTHER tasks; use them to see working Vow idioms (Results, match on Results and on values, maps, JSON walking, sortBy with block lambdas, top-level helper fns, string building, recursion).

## pairs-json

Task: The first CLI arg is a comma-separated list of name:amount pairs, e.g. "ada:30,bob:50". Print a single-line JSON object with the pairs in input order and no spaces, e.g. {"ada":30,"bob":50}. If any pair has no colon or a non-integer amount, print instead exactly {"error":"bad pair: <pair>"} for the first bad pair. An empty arg prints {}.

```
fn main() {
  let args_list = args()

  if len(args_list) == 0 {
    print("{}")
    return ok(true)
  }

  let input = args_list[0]

  if input == "" {
    print("{}")
    return ok(true)
  }

  let pairs_list = split(input, ",")
  let json_parts = []

  for pair in pairs_list {
    let parts = split(pair, ":")

    if len(parts) != 2 {
      print("{\"error\":\"bad pair: " + pair + "\"}")
      return ok(true)
    }

    let name = parts[0]
    let amount_str = parts[1]

    match num(amount_str) {
      ok(amount) => {
        push(json_parts, "\"" + name + "\":" + toJson(amount))
      }
      err(e) => {
        print("{\"error\":\"bad pair: " + pair + "\"}")
        return ok(true)
      }
    }
  }

  print("{" + join(json_parts, ",") + "}")
  return ok(true)
}

match main() {
  ok(v) => {}
  err(e) => print(e)
}
```

## log-summary

Task: The first CLI arg is a log: lines separated by a newline character. Each valid line has the form "<LEVEL> <module> <message...>" where LEVEL is one of INFO, WARN, ERROR. Ignore blank lines; any other line that does not match counts as malformed. Print, in this order: one line per level that appears at least once, in the order ERROR, WARN, INFO, formatted "<LEVEL>: <count>"; then "worst module: <module>" for the module with the most ERROR lines (ties broken alphabetically; print "worst module: none" if there are no ERROR lines); then "malformed: <n>".

```
fn main() {
  let log = args()[0]
  let lines = split(log, "\n")

  let error_count = 0
  let warn_count = 0
  let info_count = 0
  let malformed_count = 0
  let error_modules = {}

  for line in lines {
    if line == "" {
      continue
    }

    let parts = split(line, " ")
    if len(parts) < 3 {
      malformed_count = malformed_count + 1
      continue
    }

    let level = parts[0]
    let module = parts[1]

    if level == "ERROR" {
      error_count = error_count + 1
      if has(error_modules, module) {
        error_modules[module] = error_modules[module] + 1
      } else {
        error_modules[module] = 1
      }
    } else if level == "WARN" {
      warn_count = warn_count + 1
    } else if level == "INFO" {
      info_count = info_count + 1
    } else {
      malformed_count = malformed_count + 1
    }
  }

  if error_count > 0 {
    print("ERROR: " + str(error_count))
  }
  if warn_count > 0 {
    print("WARN: " + str(warn_count))
  }
  if info_count > 0 {
    print("INFO: " + str(info_count))
  }

  let worst_module = ""
  let worst_count = 0
  for mod in keys(error_modules) {
    let count = error_modules[mod]
    if worst_module == "" {
      worst_module = mod
      worst_count = count
    } else if count > worst_count or (count == worst_count and mod < worst_module) {
      worst_module = mod
      worst_count = count
    }
  }

  if error_count > 0 {
    print("worst module: " + worst_module)
  } else {
    print("worst module: none")
  }

  print("malformed: " + str(malformed_count))
}

main()
```

## bank-ledger

Task: The first CLI arg is a semicolon-separated list of commands. Command forms: "open <name> <amount>" creates an account with that starting balance; "deposit <name> <amount>" adds to an account; "withdraw <name> <amount>" subtracts from an account; "balance <name>" prints the line "<name> <balance>". Amounts are non-negative integers, names contain no spaces or semicolons. Process commands in order. If a command is invalid — opening an account that already exists, deposit/withdraw/balance on an account that does not exist, or a withdraw that exceeds the balance — print exactly "error" and stop processing immediately (no further output). Only balance commands and errors produce output.

```
// bank-ledger: process semicolon-separated banking commands from the first CLI arg

let input = get(args(), 0)?   // top-level ?: no arg stops the program with "error: ..." and exit code 1

let accounts = {}        // empty map: its value type is pinned by the first insert below
let failed = false

for c in split(input, ";") {
  if not failed and c != "" {
    let parts = split(c, " ")
    let op = get(parts, 0)?
    let name = get(parts, 1)?
    let amt = if op == "balance" { 0 } else { num(get(parts, 2)?)? }

    if op == "open" {
      if has(accounts, name) {
        print("error")
        failed = true
      } else {
        accounts[name] = amt
      }
    }

    if op == "deposit" {
      if has(accounts, name) {
        accounts[name] = accounts[name] + amt
      } else {
        print("error")
        failed = true
      }
    }

    if op == "withdraw" {
      if has(accounts, name) {
        if amt <= accounts[name] {
          accounts[name] = accounts[name] - amt
        } else {
          print("error")
          failed = true
        }
      } else {
        print("error")
        failed = true
      }
    }

    if op == "balance" {
      if has(accounts, name) {
        print("${name} ${accounts[name]}")
      } else {
        print("error")
        failed = true
      }
    }
  }
}
```

## calc-expr

Task: The first CLI arg is an arithmetic expression using non-negative integers, + - * /, parentheses, and spaces. Evaluate it with normal precedence (* and / before + and -, left to right within a level; / is exact division, results may be decimals). Print the result. If the expression is malformed (unbalanced parentheses, a missing operand, an unknown character, empty input), print exactly: syntax error. If it divides by zero, print exactly: division by zero. Do not use any built-in eval.

```
// Calculator: parse and evaluate arithmetic expressions

struct Token {
  type, // "num", "op", "lparen", "rparen", "eof"
  value
}

fn tokenize(s) {
  let tokens = []
  let chars = split(s, "")
  let i = 0
  while i < len(chars) {
    let c = chars[i]
    if c == " " {
      i = i + 1
    } else if c == "(" {
      push(tokens, Token { type: "lparen", value: "(" })
      i = i + 1
    } else if c == ")" {
      push(tokens, Token { type: "rparen", value: ")" })
      i = i + 1
    } else if c == "+" or c == "-" or c == "*" or c == "/" {
      push(tokens, Token { type: "op", value: c })
      i = i + 1
    } else if c >= "0" and c <= "9" {
      let num_str = ""
      while i < len(chars) and ((chars[i] >= "0" and chars[i] <= "9") or chars[i] == ".") {
        num_str = num_str + chars[i]
        i = i + 1
      }
      push(tokens, Token { type: "num", value: num_str })
    } else {
      return err("syntax error")
    }
  }
  push(tokens, Token { type: "eof", value: "" })
  return ok(tokens)
}

struct Parser {
  tokens,
  pos
}

fn peek(p) {
  return p.tokens[p.pos]
}

fn advance(p) {
  p.pos = p.pos + 1
}

fn parseExpr(p) {
  let left = parseTerm(p)?
  while true {
    let tok = peek(p)
    if tok.type == "op" and (tok.value == "+" or tok.value == "-") {
      let op = tok.value
      advance(p)
      let right = parseTerm(p)?
      if op == "+" {
        left = left + right
      } else {
        left = left - right
      }
    } else {
      break
    }
  }
  return ok(left)
}

fn parseTerm(p) {
  let left = parseFactor(p)?
  while true {
    let tok = peek(p)
    if tok.type == "op" and (tok.value == "*" or tok.value == "/") {
      let op = tok.value
      advance(p)
      let right = parseFactor(p)?
      if op == "*" {
        left = left * right
      } else {
        if right == 0 {
          return err("division by zero")
        }
        left = left / right
      }
    } else {
      break
    }
  }
  return ok(left)
}

fn parseFactor(p) {
  let tok = peek(p)
  if tok.type == "num" {
    advance(p)
    let val = num(tok.value)?
    return ok(val)
  } else if tok.type == "lparen" {
    advance(p)
    let val = parseExpr(p)?
    let close = peek(p)
    if close.type != "rparen" {
      return err("syntax error")
    }
    advance(p)
    return ok(val)
  } else {
    return err("syntax error")
  }
}

let expr = args()[0]
if len(expr) == 0 {
  print("syntax error")
} else {
  match tokenize(expr) {
    ok(tokens) => {
      let p = Parser { tokens: tokens, pos: 0 }
      match parseExpr(p) {
        ok(result) => {
          let final = peek(p)
          if final.type == "eof" {
            print(str(result))
          } else {
            print("syntax error")
          }
        }
        err(e) => print(e)
      }
    }
    err(e) => print(e)
  }
}
```

## json-users

Task: The first CLI arg is a JSON string. It should be a JSON array of objects, each with a string field "name" and a numeric field "age". Print the name of every user with age >= 18, one per line, in array order. If the input is not valid JSON, not an array, or any element is missing either field or has a wrong type, print exactly: invalid (and nothing else).

```
fn adultNames(s) {
  let j = parseJson(s)?
  if jsonType(j) != "array" { return err("not an array") }
  let items = jsonList(j)
  let names = []
  for item in items {
    if jsonType(item) != "object" { return err("element not an object") }
    let n = jsonStr(get(item, "name")?)?
    let a = jsonNum(get(item, "age")?)?
    if a >= 18 { push(names, n) }
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
    print("invalid")
  }
}
```

## md-lite

Task: Arg 1 is a markdown document (lines separated by newline characters). Convert it to HTML, printing one block per output line, in order. Blocks: a line starting with "# ", "## " or "### " is a heading (<h1>, <h2>, <h3>) holding the rest of the line. A run of consecutive lines starting with "- " is ONE list: <ul><li>item</li><li>item</li></ul> on a single line. Any other run of consecutive non-blank lines is one paragraph: the lines trimmed and joined with single spaces inside <p>...</p>. Blank lines (empty or only spaces) only separate blocks. Inside headings, list items and paragraphs apply, in this order: first HTML-escape & < > (to &amp; &lt; &gt;), then turn `code` spans into <code>code</code>, then **bold** spans into <strong>bold</strong>. Spans never nest or span lines; an unmatched ` or ** stays as literal text. An empty document prints nothing.

```
fn processMarkdown(markdown) {
  let lines = lines(markdown)
  let i = 0

  while i < len(lines) {
    let line = lines[i]

    // Skip blank lines
    if len(trim(line)) == 0 {
      i = i + 1
      continue
    }

    // Check for heading
    if startsWith(line, "# ") {
      let content = slice(line, 2, len(line))
      print("<h1>" + processInline(content) + "</h1>")
      i = i + 1
    } else if startsWith(line, "## ") {
      let content = slice(line, 3, len(line))
      print("<h2>" + processInline(content) + "</h2>")
      i = i + 1
    } else if startsWith(line, "### ") {
      let content = slice(line, 4, len(line))
      print("<h3>" + processInline(content) + "</h3>")
      i = i + 1
    } else if startsWith(line, "- ") {
      // List block
      let html = "<ul>"
      while i < len(lines) and len(trim(lines[i])) > 0 and startsWith(trim(lines[i]), "- ") {
        let item = slice(trim(lines[i]), 2, len(trim(lines[i])))
        html = html + "<li>" + processInline(item) + "</li>"
        i = i + 1
      }
      html = html + "</ul>"
      print(html)
    } else {
      // Paragraph block
      let paragraphText = ""
      while i < len(lines) and len(trim(lines[i])) > 0 {
        let trimmed = trim(lines[i])
        if startsWith(trimmed, "# ") or startsWith(trimmed, "## ") or startsWith(trimmed, "### ") or startsWith(trimmed, "- ") {
          break
        }
        if len(paragraphText) > 0 {
          paragraphText = paragraphText + " " + trimmed
        } else {
          paragraphText = trimmed
        }
        i = i + 1
      }
      print("<p>" + processInline(paragraphText) + "</p>")
    }
  }
}

fn processInline(text) {
  let escaped = escapeHtml(text)
  let withCode = applyCode(escaped)
  let withBold = applyBold(withCode)
  return withBold
}

fn escapeHtml(text) {
  let step1 = replace(text, "&", "&amp;")
  let step2 = replace(step1, "<", "&lt;")
  let step3 = replace(step2, ">", "&gt;")
  return step3
}

fn applyCode(text) {
  let result = ""
  let i = 0
  while i < len(text) {
    if text[i] == "`" {
      let j = i + 1
      while j < len(text) and text[j] != "`" {
        j = j + 1
      }
      if j < len(text) {
        let code = slice(text, i + 1, j)
        result = result + "<code>" + code + "</code>"
        i = j + 1
      } else {
        result = result + "`"
        i = i + 1
      }
    } else {
      result = result + text[i]
      i = i + 1
    }
  }
  return result
}

fn applyBold(text) {
  let result = ""
  let i = 0
  while i < len(text) {
    if i + 1 < len(text) and text[i] == "*" and text[i + 1] == "*" {
      let j = i + 2
      let found = false
      while j + 1 < len(text) {
        if text[j] == "*" and text[j + 1] == "*" {
          found = true
          break
        }
        j = j + 1
      }
      if found {
        let bold = slice(text, i + 2, j)
        result = result + "<strong>" + bold + "</strong>"
        i = j + 2
      } else {
        result = result + "*"
        i = i + 1
      }
    } else {
      result = result + text[i]
      i = i + 1
    }
  }
  return result
}

let markdown = args()[0]
processMarkdown(markdown)
```

## config-report

Task: Config comes from environment variables named APP_<KEY> (key uppercased). The CLI args are lowercase config keys. Write a helper function that looks up one key in the environment, and use it for every arg. For each arg print one line: "<key>=<value>" if APP_<KEY> is set, otherwise "<key> missing". Special rule: if the key is "port", its value must be an integer from 1 to 65535; if it is set but not valid, print "port invalid" instead. After all keys, print a final line "<n> missing" where n counts the keys that were missing (invalid port does not count as missing).

```
fn lookupKey(key) uses env {
  let upperKey = upper(key)
  let envKey = "APP_${upperKey}"
  return env(envKey)
}

fn main() uses env {
  let args = args()
  let missingCount = 0

  for key in args {
    match lookupKey(key) {
      ok(value) => {
        if key == "port" {
          match num(value) {
            ok(portNum) => {
              if portNum > 0 and portNum <= 65535 {
                print("${key}=${value}")
              } else {
                print("port invalid")
              }
            }
            err(_) => {
              print("port invalid")
            }
          }
        } else {
          print("${key}=${value}")
        }
      }
      err(_) => {
        print("${key} missing")
        missingCount = missingCount + 1
      }
    }
  }

  print("${missingCount} missing")
}

main()
```

## word-freq

Task: The first CLI arg is a sentence: words separated by single spaces. Print the word that appears most often. If several words tie for most frequent, print the one whose first appearance is earliest in the sentence.

```
// Count words, then sort by count (highest first). sortBy is stable, so ties keep
// first-appearance order. Helper fns can live at the top level or nested inside another fn.
fn countWords(words) {
  let counts = {}
  let order = []
  for w in words {
    if has(counts, w) {
      counts[w] = counts[w] + 1
    } else {
      counts[w] = 1
      push(order, w)
    }
  }
  // a block lambda can span lines; its last line is the sort key
  let ranked = sortBy(order, w => {
    let c = counts[w]
    0 - c
  })
  return ranked
}

let words = split(args()[0], " ")
let ranked = countWords(words)
let top = ranked[0]
let label = match len(ranked) {
  1 => "only word"
  _ => "most frequent"
}
if label == "only word" {
  print(top)
  return
}
print(top)
```

## form-signups

Task: Each line of stdin is a form submission body such as `name=Zo%C3%AB+Li&city=S%C3%A3o+Paulo`. For each line print `<name> from <city>, map: https://maps.example.com/?q=<city, URL-encoded>`; if a field is missing or badly encoded print `skipped: <error>`. At end of input print how many signups were accepted.

Verified: with the input lines `name=Zo%C3%AB+Li&city=S%C3%A3o+Paulo`, `city=Oslo`, `name=Al&city=New+York`, `name=x&city=bad%zz` it prints exactly:

```
Zoë Li from São Paulo, map: https://maps.example.com/?q=S%C3%A3o%20Paulo
skipped: missing name
Al from New York, map: https://maps.example.com/?q=New%20York
skipped: "bad%zz" is not valid URL encoding (a % must be followed by two hex digits)
2 signups
```

```
// Forms send spaces as "+", and urlDecode leaves "+" alone, so swap it first.
fn field(body, name) {
  for pair in split(body, "&") {
    let parts = split(pair, "=")
    if parts[0] == name and len(parts) == 2 {
      return urlDecode(replace(parts[1], "+", "%20"))
    }
  }
  return err("missing ${name}")
}

fn signup(body) {
  let name = field(body, "name")?
  let city = field(body, "city")?
  return ok("${name} from ${city}, map: https://maps.example.com/?q=${urlEncode(city)}")
}

let count = 0
while true {
  match readLine() {
    err(e) => break                              // end of input
    ok(line) => match signup(trim(line)) {
      ok(msg) => {
        count = count + 1
        print(msg)
      }
      err(e) => print("skipped: ${e}")
    }
  }
}
print("${count} signups")
```

## temperature-converter (with built-in tests)

Task: Convert temperatures written like `100C` or `212F`. With arguments, print one conversion per argument; without arguments, convert each non-empty line of stdin and finish with `<n> converted`. Round to one decimal. A value whose last character is not C or F prints `error: unknown unit: <value>`; a non-numeric value prints `error: not a number: <value>`.

This program carries its own tests: one `test` block per example and per error line of the task, and two `run(args, stdin)` tests for the whole CLI. `node cli.js test temp.vow` prints exactly:

```
✓ celsius to fahrenheit
✓ fahrenheit to celsius rounds to one decimal
✓ lower-case unit and spaces are accepted
✓ unknown unit is the spec's error line
✓ not a number
✓ cli: one line per argument
✓ cli: stdin mode converts each non-empty line and counts them
7 tests, 7 passed
```

Verified: `node cli.js temp.vow 100C 50F abcC 7` prints `100C = 212F`, `50F = 10C`, `error: not a number: abcC`, `error: unknown unit: 7`; the test blocks never run then.

```
// temp.vow: converts temperatures written like 100C or 212F.
// With arguments: one line per argument. Without: one line per stdin line, then a count.
fn convert(text) {
  let t = trim(text)
  if len(t) < 2 { return err("error: unknown unit: ${t}") }
  let unit = upper(slice(t, len(t) - 1, len(t)))
  if unit != "C" and unit != "F" { return err("error: unknown unit: ${t}") }
  let n = match num(slice(t, 0, len(t) - 1)) {
    ok(v) => v
    err(e) => { return err("error: not a number: ${t}") }
  }
  if unit == "C" { return ok("${t} = ${round(n * 9 / 5 + 32, 1)}F") }
  return ok("${t} = ${round((n - 32) * 5 / 9, 1)}C")
}

fn report(text) {
  match convert(text) {
    ok(line) => print(line)
    err(e) => print(e)
  }
}

let inputs = args()
if len(inputs) > 0 {
  for a in inputs { report(a) }
} else {
  let n = 0
  while true {
    match readLine() {
      err(e) => break
      ok(line) => {
        if trim(line) != "" {
          report(line)
          n = n + 1
        }
      }
    }
  }
  print("${n} converted")
}

test "celsius to fahrenheit" { expectEq(convert("100C"), ok("100C = 212F")) }
test "fahrenheit to celsius rounds to one decimal" { expectEq(convert("100F"), ok("100F = 37.8C")) }
test "lower-case unit and spaces are accepted" { expectEq(convert(" 32f "), ok("32f = 0C")) }
test "unknown unit is the spec's error line" { expectEq(convert("100K"), err("error: unknown unit: 100K")) }
test "not a number" { expectErr(convert("abcC")) }
test "cli: one line per argument" { expectEq(run(["0C", "212F"], ""), "0C = 32F\n212F = 100C\n") }
test "cli: stdin mode converts each non-empty line and counts them" {
  expectEq(run([], "10C\n\nbadF\n"), "10C = 50F\nerror: not a number: badF\n2 converted\n")
}
```
