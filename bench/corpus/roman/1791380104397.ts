const arg = Deno.args[0] ?? "";

if (arg === "") {
  console.log("error");
  Deno.exit(0);
}

// Check if input is a decimal number
const isDecimal = /^\d+$/.test(arg);

if (isDecimal) {
  // Decimal to Roman
  const num = parseInt(arg, 10);

  // Check for leading zeros (except "0" itself, which we handle differently)
  if (arg.length > 1 && arg[0] === "0") {
    console.log("error");
    Deno.exit(0);
  }

  // Check range 1-3999
  if (num < 1 || num > 3999) {
    console.log("error");
    Deno.exit(0);
  }

  const romanValues = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const;

  let result = "";
  let remaining = num;

  for (const [value, symbol] of romanValues) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }

  console.log(result);
} else {
  // Roman to decimal - must be in standard form
  // First, check that it contains only valid characters (uppercase only)
  if (!/^[IVXLCDM]+$/.test(arg)) {
    console.log("error");
    Deno.exit(0);
  }

  // Try to parse and convert to decimal
  const romanToDecimal: { [key: string]: number } = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let result = 0;
  let prev = 0;

  for (let i = arg.length - 1; i >= 0; i--) {
    const val = romanToDecimal[arg[i]];
    if (val < prev) {
      // Subtractive case
      result -= val;
    } else {
      result += val;
    }
    prev = val;
  }

  // Check range
  if (result < 1 || result > 3999) {
    console.log("error");
    Deno.exit(0);
  }

  // Now convert back to Roman and check if it matches the input exactly (to ensure standard form)
  const romanValues = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const;

  let canonical = "";
  let remaining = result;

  for (const [value, symbol] of romanValues) {
    while (remaining >= value) {
      canonical += symbol;
      remaining -= value;
    }
  }

  // Check if the input matches the canonical form
  if (arg !== canonical) {
    console.log("error");
    Deno.exit(0);
  }

  console.log(result);
}
