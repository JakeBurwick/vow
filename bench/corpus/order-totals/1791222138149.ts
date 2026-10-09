// order-totals: Parse orders and output item totals

try {
  const input = Deno.args[0];

  // Try to parse JSON
  let orders: any;
  try {
    orders = JSON.parse(input);
  } catch {
    console.log('{"error":"bad order"}');
    Deno.exit(0);
  }

  // Validate it's an array
  if (!Array.isArray(orders)) {
    console.log('{"error":"bad order"}');
    Deno.exit(0);
  }

  // Handle empty array
  if (orders.length === 0) {
    console.log('{}');
    Deno.exit(0);
  }

  // Process orders
  const totals: Record<string, number> = {};

  for (const order of orders) {
    // Check if it's an object
    if (typeof order !== 'object' || order === null || Array.isArray(order)) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Check required fields exist
    if (!('item' in order) || !('qty' in order) || !('price' in order)) {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Check field types
    if (typeof order.item !== 'string' || typeof order.qty !== 'number' || typeof order.price !== 'number') {
      console.log('{"error":"bad order"}');
      Deno.exit(0);
    }

    // Calculate total revenue for this order
    const revenue = order.qty * order.price;

    // Add to totals (sum if item already exists)
    if (order.item in totals) {
      totals[order.item] += revenue;
    } else {
      totals[order.item] = revenue;
    }
  }

  // Sort keys alphabetically and create output
  const sorted = Object.keys(totals).sort();
  const result: Record<string, number> = {};

  for (const key of sorted) {
    result[key] = totals[key];
  }

  // Output as JSON with no spaces
  console.log(JSON.stringify(result));

} catch (e) {
  console.log('{"error":"bad order"}');
}
