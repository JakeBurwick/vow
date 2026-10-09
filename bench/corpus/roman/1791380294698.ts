const arg = Deno.args[0] || "";

if (!arg) {
  console.log("error");
  Deno.exit(0);
}

// Check if it's a number (all digits)
if (/^\d+$/.test(arg)) {
  // It's a decimal number - convert to Roman

  // Check for leading zeros (except "0" itself, which is invalid anyway)
  if (arg.length > 1 && arg[0] === "0") {
    console.log("error");
    Deno.exit(0);
  }

  const num = parseInt(arg, 10);

  // Check if in valid range 1-3999
  if (num < 1 || num > 3999) {
    console.log("error");
    Deno.exit(0);
  }

  // Convert to Roman
  const romanMap = [
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

  for (const [value, symbol] of romanMap) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }

  console.log(result);
} else if (/^[IVXLCDM]+$/.test(arg)) {
  // It's a Roman numeral - validate and convert

  // Validate standard form
  // Standard form rules:
  // - I can only precede V or X
  // - X can only precede L or C
  // - C can only precede D or M
  // - V, L, D cannot be repeated or used as subtractive
  // - Can't have more than 3 of the same symbol in a row for I, X, C, M
  // - Can't have 0 of a symbol

  // Parse and calculate value
  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let total = 0;
  let isValid = true;

  for (let i = 0; i < arg.length; i++) {
    const current = values[arg[i]];
    const next = i + 1 < arg.length ? values[arg[i + 1]] : 0;

    if (next > current) {
      // This is a subtractive case
      // Check if it's a valid subtractive form
      const pair = arg[i] + arg[i + 1];
      if (pair !== "IV" && pair !== "IX" && pair !== "XL" && pair !== "XC" && pair !== "CD" && pair !== "CM") {
        isValid = false;
        break;
      }
      total += next - current;
      i++; // Skip next character
    } else {
      total += current;
    }
  }

  if (!isValid) {
    console.log("error");
    Deno.exit(0);
  }

  // Validate that this is the standard representation
  // Convert back to Roman and check if it matches
  const romanMap = [
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

  let standard = "";
  let remaining = total;

  for (const [value, symbol] of romanMap) {
    while (remaining >= value) {
      standard += symbol;
      remaining -= value;
    }
  }

  if (standard !== arg) {
    console.log("error");
    Deno.exit(0);
  }

  console.log(total);
} else {
  // Contains invalid characters or lowercase
  console.log("error");
  Deno.exit(0);
}
