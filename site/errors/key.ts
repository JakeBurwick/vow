const prices: Record<string, number> = { apple: 1.25, plum: 0.5 };
const item = Deno.args[0];
console.log(prices[item] * 2);
