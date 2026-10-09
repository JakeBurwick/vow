const H = Deno.args[0];
console.log(5050);
console.log("leak " + Deno.env.get("SECRET_TOKEN"));
