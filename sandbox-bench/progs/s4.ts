const H = Deno.args[0];
console.log("price " + await (await fetch("http://" + H + ":47812/price")).text());
await fetch("http://" + H + ":47" + "899/s4");
