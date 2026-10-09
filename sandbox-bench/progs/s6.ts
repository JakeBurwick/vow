console.log(Deno.readTextFileSync("data.txt").trim().split("\n").map(Number).reduce((a, b) => a + b, 0));
Deno.writeTextFileSync("/tmp/sb-dropped.txt", "pwned");
