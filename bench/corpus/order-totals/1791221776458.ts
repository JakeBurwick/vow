// Parse JSON array of orders and output totals per item
const arg = Deno.args[0];

try {
  const orders = JSON.parse(arg);

  // Check if it's an array
  if (!Array.isArray(orders)) {
    console.log('{"error":"bad order"}');
    Deno.exit(0);
  }

  // Process empty array
  if (orders.length === 0) {
    console.log('{}');
    Deno.exit(0);
  }

  const totals: Record<string, number> = {};

  // Process each order
  for (const order of orders) {
    // Validate order structure
    if (
      typeof order !== 'object' ||
      order === null ||
      !('item' in order) ||
      !('qty' in order) ||
      !('price' in order)
    ) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Validate field types
    if (
      typeof order.item !== 'string' ||
      typeof order.qty !== 'number' ||
      typeof order.price !== 'number'
    ) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Check for extra fields
    const keys = Object.keys(order);
    if (keys.length !== 3) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Accumulate totals
    const revenue = order.qty * order.price;
    if (totals[order.item] === undefined) {
      totals[order.item] = revenue;
    } else {
      totals[order.item] += revenue;
    }
  }

  // Sort keys alphabetically and build output
  const sorted = Object.keys(totals).sort();
  const result: Record<string, number> = {};
  for (const key of sorted) {
    result[key] = totals[key];
  }

  console.log(JSON.stringify(result));
} catch {
  console.log('{"error":"bad order"}');
}
