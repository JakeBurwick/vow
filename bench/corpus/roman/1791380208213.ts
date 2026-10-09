const input = Deno.args[0] || "";

if (!input) {
  console.log("error");
  Deno.exit(0);
}

// Check if input is a decimal number
if (/^\d+$/.test(input)) {
  // Check for leading zeros
  if (input.length > 1 && input[0] === "0") {
    console.log("error");
    Deno.exit(0);
  }

  const num = parseInt(input, 10);

  if (num < 1 || num > 3999) {
    console.log("error");
    Deno.exit(0);
  }

  // Convert decimal to Roman numeral
  const values = [
    { val: 1000, numeral: "M" },
    { val: 900, numeral: "CM" },
    { val: 500, numeral: "D" },
    { val: 400, numeral: "CD" },
    { val: 100, numeral: "C" },
    { val: 90, numeral: "XC" },
    { val: 50, numeral: "L" },
    { val: 40, numeral: "XL" },
    { val: 10, numeral: "X" },
    { val: 9, numeral: "IX" },
    { val: 5, numeral: "V" },
    { val: 4, numeral: "IV" },
    { val: 1, numeral: "I" },
  ];

  let result = "";
  let n = num;

  for (const { val, numeral } of values) {
    while (n >= val) {
      result += numeral;
      n -= val;
    }
  }

  console.log(result);
  Deno.exit(0);
}

// Check if input is a Roman numeral
if (!/^[IVXLCDM]+$/.test(input)) {
  console.log("error");
  Deno.exit(0);
}

// Check if it's a valid standard Roman numeral
// Validate structure according to standard form rules
const romanRegex = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

if (!romanRegex.test(input)) {
  console.log("error");
  Deno.exit(0);
}

// Convert Roman to decimal
const romanValues: { [key: string]: number } = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

let result = 0;
for (let i = 0; i < input.length; i++) {
  const current = romanValues[input[i]];
  const next = romanValues[input[i + 1]];

  if (next && current < next) {
    result += next - current;
    i++; // Skip next character as it's part of subtractive pair
  } else {
    result += current;
  }
}

console.log(result);
