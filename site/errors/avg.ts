function average(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
const scores = Deno.args[0].split(",").filter((s) => s !== "").map(Number);
console.log(average(scores));
