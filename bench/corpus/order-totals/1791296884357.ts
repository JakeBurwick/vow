const input = Deno.args[0];

try {
  const orders = JSON.parse(input);

  // Validate that it's an array
  if (!Array.isArray(orders)) {
    console.log('{"error":"bad order"}');
    Deno.exit(0);
  }

  // Handle empty array
  if (orders.length === 0) {
    console.log('{}');
    Deno.exit(0);
  }

  const totals: Record<string, number> = {};

  // Process each order
  for (const order of orders) {
    // Validate order structure
    if (
      !order ||
      typeof order !== 'object' ||
      !('item' in order) ||
      !('qty' in order) ||
      !('price' in order) ||
      typeof order.item !== 'string' ||
      typeof order.qty !== 'number' ||
      typeof order.price !== 'number'
    ) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Calculate revenue for this order
    const revenue = order.qty * order.price;
    totals[order.item] = (totals[order.item] || 0) + revenue;
  }

  // Sort by key alphabetically and output
  const sorted = Object.keys(totals).sort();
  const result: Record<string, number> = {};
  for (const key of sorted) {
    result[key] = totals[key];
  }

  console.log(JSON.stringify(result));
} catch (err) {
  console.log('{"error":"bad order"}');
}
