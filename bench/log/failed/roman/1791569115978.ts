function intToRoman(num: number): string {
  const val = [
    1000, 900, 500, 400,
    100, 90, 50, 40,
    10, 9, 5, 4,
    1
  ];
  const syb = [
    "M", "CM", "D", "CD",
    "C", "XC", "L", "XL",
    "X", "IX", "V", "IV",
    "I"
  ];
  let romanNum = '';
  let i = 0;
  while (num > 0) {
    for (; num >= val[i]; num -= val[i]) {
      romanNum += syb[i];
    }
    i++;
  }
  return romanNum;
}

function romanToInt(roman: string): number {
  const romanMap: { [key: string]: number } = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
  };
  let intVal = 0;
  for (let i = 0; i < roman.length; i++) {
    if (i > 0 && romanMap[roman[i]] > romanMap[roman[i - 1]]) {
      intVal += romanMap[roman[i]] - 2 * romanMap[roman[i - 1]];
    } else {
      intVal += romanMap[roman[i]];
    }
  }
  return intVal;
}

function processInput(input: string): string {
  if (!input) {
    return 'error';
  }
  if (!/^\d+$/.test(input)) {
    return 'error';
  }
  const num = parseInt(input);
  if (isNaN(num) || num < 1 || num > 3999) {
    return 'error';
  }
  if (num.toString().length > 1 && num.toString()[0] === '0') {
    return 'error';
  }
  if (num.toString().length > 1) {
    return 'error';
  }
  if (input.toUpperCase() === 'IV' || input.toUpperCase() === 'IX' || input.toUpperCase() === 'XL' || input.toUpperCase() === 'XC' || input.toUpperCase() === 'CD' || input.toUpperCase() === 'CM') {
    return romanToInt(input);
  } else {
    return intToRoman(num);
  }
}

console.log(processInput(Deno.args[1]));
