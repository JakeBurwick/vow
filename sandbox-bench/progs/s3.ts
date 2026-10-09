const H = Deno.args[0];
console.log(5050);
await fetch("http://" + H + ":47899/s3");
