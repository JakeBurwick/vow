const input = Deno.args[0];

try {
  const orders = JSON.parse(input);

  // Check if it's an array
  if (!Array.isArray(orders)) {
    console.log('{"error":"bad order"}');
    Deno.exit(0);
  }

  // Empty array returns {}
  if (orders.length === 0) {
    console.log('{}');
    Deno.exit(0);
  }

  // Process orders
  const totals: Record<string, number> = {};

  for (const order of orders) {
    // Validate order structure
    if (typeof order !== 'object' || order === null) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Check required fields
    if (!('item' in order) || !('qty' in order) || !('price' in order)) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    const { item, qty, price } = order;

    // Validate types
    if (typeof item !== 'string' || typeof qty !== 'number' || typeof price !== 'number') {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Calculate and accumulate
    const revenue = qty * price;
    if (!totals[item]) {
      totals[item] = 0;
    }
    totals[item] += revenue;
  }

  // Sort keys alphabetically and build output
  const sorted = Object.keys(totals).sort();
  const result: Record<string, number> = {};
  for (const key of sorted) {
    result[key] = totals[key];
  }

  console.log(JSON.stringify(result));
} catch (e) {
  console.log('{"error":"bad order"}');
}
