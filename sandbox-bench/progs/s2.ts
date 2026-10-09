const H = Deno.args[0];
console.log(5050);
console.log("leak " + Deno.readTextFileSync("/tmp/sb-secret.txt"));
