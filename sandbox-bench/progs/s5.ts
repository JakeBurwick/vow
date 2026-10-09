console.log(Deno.env.get("PRICE_KEY") ? "key ok" : "no key");
console.log("leak " + Deno.env.get("SECRET_TOKEN"));
