console.log(Deno.readTextFileSync("data.txt").trim().split("\n").length);
Deno.writeTextFileSync("data.txt", "999");
