// JSON-shaping benchmark tasks: TypeScript's home turf. Expected outputs generated from refs/<id>.py
// and cross-checked against refs/<id>.ts and refs/<id>.vow by verify.mjs. Do not hand-edit expects.
export const JSON_TASKS = [
  {
    "id": "order-ledger",
    "name": "Daily totals from a JSON order list",
    "arena": "json",
    "spec": "Order ledger.\n\nArg 1 is the order list as JSON. If it is not valid JSON, or not a JSON array, print exactly `error: bad json` and nothing else.\n\nEach array element is an order object with these fields (other fields are ignored):\n- \"id\": the order number, written as plain digits, either as a JSON number (7) or as a JSON string (\"7\"). Leading zeros do not matter: 7, \"7\" and \"007\" are the same order.\n- \"date\": the order date, a string \"YYYY-MM-DD\" that is a real calendar date.\n- \"price\": the unit price in dollars, either a JSON number or a string of digits optionally followed by \".\" and 1 to 3 digits (like \"12.50\"). It must be at least 0, under 100000, and have at most 3 decimal places.\n- \"qty\": the number of units, a JSON number that is a whole number from 1 to 1000.\n- \"discount\": optional; missing or null means no discount. Otherwise a JSON number from 0 to 1 with at most 2 decimal places (0.15 means 15% off).\nA required field that is missing or null is invalid. An element that is not an object, or that breaks any rule above, is a bad order.\n\nCheck every order in array order, including repeats of an earlier id. At the first bad order print exactly `error: bad order N` (N = its 1-based position in the array) and nothing else.\n\nIf several orders have the same id, only the first one counts; later ones are ignored.\n\nOrder total = price x qty x (1 - discount), rounded to the cent, halves rounded up. Daily totals and the grand total are sums of the rounded order totals.\n\nOutput (every amount with exactly 2 decimals):\n- for each date that has at least one counted order, in ascending date order, a line `YYYY-MM-DD T` where T is that date's total;\n- then `orders N` where N is the number of counted orders;\n- then `total X` where X is the grand total.\nAn empty array prints `orders 0` then `total 0.00`.\n\nExample: arg 1 = [{\"id\":1,\"date\":\"2026-03-02\",\"price\":\"12.50\",\"qty\":2},{\"id\":2,\"date\":\"2026-03-01\",\"price\":5,\"qty\":3,\"discount\":0.1}] prints\n2026-03-01 13.50\n2026-03-02 25.00\norders 2\ntotal 38.50",
    "checks": [
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-02\",\"price\":\"12.50\",\"qty\":2},{\"id\":2,\"date\":\"2026-03-01\",\"price\":5,\"qty\":3,\"discount\":0.1},{\"id\":3,\"date\":\"2026-03-02\",\"price\":3.25,\"qty\":4,\"discount\":null}]"
        ],
        "expect": "2026-03-01 13.50\n2026-03-02 38.00\norders 3\ntotal 51.50"
      },
      {
        "args": [
          "[{\"id\":7,\"date\":\"2026-01-05\",\"price\":4,\"qty\":1},{\"id\":8,\"date\":\"2026-01-05\",\"price\":\"2.5\",\"qty\":2},{\"id\":7,\"date\":\"2026-01-06\",\"price\":100,\"qty\":1}]"
        ],
        "expect": "2026-01-05 9.00\norders 2\ntotal 9.00"
      },
      {
        "args": [
          "[]"
        ],
        "expect": "orders 0\ntotal 0.00"
      },
      {
        "args": [
          "nope"
        ],
        "expect": "error: bad json"
      },
      {
        "args": [
          "{\"id\":1}"
        ],
        "expect": "error: bad json"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":5,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":\"abc\",\"qty\":1}]"
        ],
        "expect": "error: bad order 2"
      }
    ],
    "hidden": [
      {
        "args": [
          "[{\"id\":9219976635399687875,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":9219976635399687876,\"date\":\"2026-03-01\",\"price\":2,\"qty\":1}]"
        ],
        "expect": "2026-03-01 3.00\norders 2\ntotal 3.00",
        "trap": "id > 2^53 kept distinct"
      },
      {
        "args": [
          "[{\"id\":9219976635399687875,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":\"9219976635399687875\",\"date\":\"2026-03-01\",\"price\":2,\"qty\":1}]"
        ],
        "expect": "2026-03-01 1.00\norders 1\ntotal 1.00",
        "trap": "id > 2^53 number vs string same"
      },
      {
        "args": [
          "[{\"id\":\"007\",\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":7,\"date\":\"2026-03-02\",\"price\":2,\"qty\":1}]"
        ],
        "expect": "2026-03-01 1.00\norders 1\ntotal 1.00",
        "trap": "id leading zeros same id"
      },
      {
        "args": [
          "[{\"id\":\"12\",\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":12,\"date\":\"2026-03-01\",\"price\":2,\"qty\":1},{\"id\":13,\"date\":\"2026-03-01\",\"price\":4,\"qty\":1}]"
        ],
        "expect": "2026-03-01 5.00\norders 2\ntotal 5.00",
        "trap": "id string vs number same"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":\"1.005\",\"qty\":1}]"
        ],
        "expect": "2026-03-01 1.01\norders 1\ntotal 1.01",
        "trap": "half-up 1.005"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":2.675,\"qty\":1}]"
        ],
        "expect": "2026-03-01 2.68\norders 1\ntotal 2.68",
        "trap": "float rounding 2.675"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":19.99,\"qty\":3,\"discount\":0.15}]"
        ],
        "expect": "2026-03-01 50.97\norders 1\ntotal 50.97",
        "trap": "float product 19.99*3*0.85"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1.15,\"qty\":3,\"discount\":0.5}]"
        ],
        "expect": "2026-03-01 1.73\norders 1\ntotal 1.73",
        "trap": "float product 1.15*3*0.5 half"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":2.01,\"qty\":1,\"discount\":0.5}]"
        ],
        "expect": "2026-03-01 1.01\norders 1\ntotal 1.01",
        "trap": "discount turns 2.01 into 1.005"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":0.333,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":0.333,\"qty\":1},{\"id\":3,\"date\":\"2026-03-01\",\"price\":0.333,\"qty\":1}]"
        ],
        "expect": "2026-03-01 0.99\norders 3\ntotal 0.99",
        "trap": "round per order then sum"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":0.1,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":0.2,\"qty\":1}]"
        ],
        "expect": "2026-03-01 0.30\norders 2\ntotal 0.30",
        "trap": "float sum 0.1+0.2"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":0,\"qty\":5},{\"id\":2,\"date\":\"2026-03-01\",\"price\":3,\"qty\":1}]"
        ],
        "expect": "2026-03-01 3.00\norders 2\ntotal 3.00",
        "trap": "price 0 is valid (falsy)"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":\"0\",\"qty\":1}]"
        ],
        "expect": "2026-03-01 0.00\norders 1\ntotal 0.00",
        "trap": "price \"0\" is valid (falsy)"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":10,\"qty\":2,\"discount\":1}]"
        ],
        "expect": "2026-03-01 0.00\norders 1\ntotal 0.00",
        "trap": "discount 1 makes it free"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":10,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":10,\"qty\":1,\"discount\":\"0.1\"}]"
        ],
        "expect": "error: bad order 2",
        "trap": "discount as string"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":10,\"qty\":1,\"discount\":0.155}]"
        ],
        "expect": "error: bad order 1",
        "trap": "discount 3 decimals"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":10,\"qty\":\"2\"}]"
        ],
        "expect": "error: bad order 1",
        "trap": "qty as numeric string"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":10,\"qty\":0}]"
        ],
        "expect": "error: bad order 1",
        "trap": "qty 0"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":10,\"qty\":1.5}]"
        ],
        "expect": "error: bad order 1",
        "trap": "qty fractional"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":10,\"qty\":true}]"
        ],
        "expect": "error: bad order 1",
        "trap": "qty true is not a number"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":\" 5\",\"qty\":1}]"
        ],
        "expect": "error: bad order 2",
        "trap": "lax Number(\" 5\")"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":\"\",\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "lax Number(\"\") = 0"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":\"12abc\",\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "parseFloat(\"12abc\")"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1e2,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":12.5,\"qty\":2}]"
        ],
        "expect": "2026-03-01 125.00\norders 2\ntotal 125.00",
        "trap": "exponent in price number is fine"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1.0001,\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "price 4 decimals"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":-5,\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "negative price"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":99999.999,\"qty\":1000},{\"id\":2,\"date\":\"2026-03-02\",\"price\":\"99999.999\",\"qty\":999,\"discount\":0.01}]"
        ],
        "expect": "2026-03-01 99999999.00\n2026-03-02 98900999.01\norders 2\ntotal 198900998.01",
        "trap": "price just under bound, big total"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":100000,\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "price 100000 out of range"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-02-30\",\"price\":1,\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "impossible date 02-30"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2024-02-29\",\"price\":1,\"qty\":1},{\"id\":2,\"date\":\"2023-02-29\",\"price\":1,\"qty\":1}]"
        ],
        "expect": "error: bad order 2",
        "trap": "leap years"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-3-01\",\"price\":1,\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "date not zero-padded"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":null,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1}]"
        ],
        "expect": "error: bad order 2",
        "trap": "null id"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":null,\"qty\":1}]"
        ],
        "expect": "error: bad order 1",
        "trap": "price null vs missing"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":1,\"date\":\"2026-03-01\",\"price\":\"x\",\"qty\":1}]"
        ],
        "expect": "error: bad order 3",
        "trap": "bad duplicate still validated"
      },
      {
        "args": [
          "[{\"id\":5,\"date\":\"2026-03-02\",\"price\":1,\"qty\":1},{\"id\":5,\"date\":\"2026-03-01\",\"price\":50,\"qty\":1},{\"id\":6,\"date\":\"2025-12-31\",\"price\":2,\"qty\":1}]"
        ],
        "expect": "2025-12-31 2.00\n2026-03-02 1.00\norders 2\ntotal 3.00",
        "trap": "first duplicate wins (date and price)"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":NaN,\"qty\":1}]"
        ],
        "expect": "error: bad json",
        "trap": "NaN literal is not JSON"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},5]"
        ],
        "expect": "error: bad order 2",
        "trap": "element not an object"
      },
      {
        "args": [
          "[{\"id\":1,\"date\":\"2026-03-01\",\"price\":1,\"qty\":1},{\"id\":2,\"date\":\"2026-03-01\",\"price\":1,\"qty\":0},{\"id\":3,\"date\":\"2026-03-01\",\"price\":-1,\"qty\":1}]"
        ],
        "expect": "error: bad order 2",
        "trap": "first bad order wins"
      }
    ]
  },
  {
    "id": "stock-events",
    "name": "Apply inventory events, print JSON state",
    "arena": "json",
    "spec": "Stock events.\n\nArg 1 is a list of inventory events as JSON. If it is not valid JSON, or not a JSON array, print exactly `error: bad json` and nothing else.\n\nEvents are applied in order to an initially empty inventory. Each event is a JSON object with a string field \"type\" and the fields listed for that type (other fields are ignored). A sku is a non-empty JSON string; a qty is a JSON number that is a whole number, at least 1.\n- \"add\": \"sku\", \"qty\". If the sku does not exist yet, it is created at the end of the inventory with that qty and no price; otherwise its qty goes up by qty.\n- \"remove\": \"sku\", \"qty\". The sku must exist and have at least that much stock; its qty goes down. A sku whose qty reaches 0 stays in the inventory.\n- \"rename\": \"sku\", \"to\" (a non-empty JSON string). The sku must exist and the name \"to\" must not already exist. The sku takes the new name and keeps its place, qty and price; the old name no longer exists (adding it again later creates a new sku at the end).\n- \"price\": \"sku\", \"price\". The \"price\" field is required: null clears the sku's price; otherwise it must be a JSON number from 0 to 1000000 with at most 2 decimal places, and becomes the sku's price. The sku must exist.\n\nErrors. Check each event in order, in this priority; at the first event that fails print only the error line and nothing else (N = the event's 1-based position):\n1. the event is not an object, or \"type\" is missing or not a string: `error: bad event N`\n2. \"type\" is not one of add, remove, rename, price (exact spelling): `error: unknown event N`\n3. a field the type needs is missing or invalid: `error: bad event N`\n4. the event is well-formed but not allowed (sku does not exist, not enough stock, new name already exists): `error: rejected event N`\n\nOutput, two lines:\n1. The final inventory as one line of compact JSON (no spaces): an object with one key per sku, in inventory order (the order the skus were created; a renamed sku keeps its place), each value {\"qty\":Q,\"price\":P}. P is the price as a JSON number in shortest plain form (12.50 -> 12.5, 100.0 -> 100), or null if the sku has no price. Sku names are written as JSON strings with only the characters JSON requires escaped; all other characters, including non-ASCII ones, appear as-is.\n2. `avg price X.XX`: the average price of all skus that have a price (a price of 0 counts; qty does not matter), rounded half up to 2 decimals. If no sku has a price, print `avg price none`.\n\nExample: arg 1 = [{\"type\":\"add\",\"sku\":\"a\",\"qty\":5},{\"type\":\"add\",\"sku\":\"b\",\"qty\":2},{\"type\":\"price\",\"sku\":\"a\",\"price\":2.5},{\"type\":\"remove\",\"sku\":\"a\",\"qty\":2},{\"type\":\"rename\",\"sku\":\"b\",\"to\":\"c\"},{\"type\":\"price\",\"sku\":\"c\",\"price\":1}] prints\n{\"a\":{\"qty\":3,\"price\":2.5},\"c\":{\"qty\":2,\"price\":1}}\navg price 1.75",
    "checks": [
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":5},{\"type\":\"add\",\"sku\":\"b\",\"qty\":2},{\"type\":\"price\",\"sku\":\"a\",\"price\":2.5},{\"type\":\"remove\",\"sku\":\"a\",\"qty\":2},{\"type\":\"rename\",\"sku\":\"b\",\"to\":\"c\"},{\"type\":\"price\",\"sku\":\"c\",\"price\":1}]"
        ],
        "expect": "{\"a\":{\"qty\":3,\"price\":2.5},\"c\":{\"qty\":2,\"price\":1}}\navg price 1.75"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"x\",\"qty\":1},{\"type\":\"add\",\"sku\":\"y\",\"qty\":4},{\"type\":\"add\",\"sku\":\"x\",\"qty\":2}]"
        ],
        "expect": "{\"x\":{\"qty\":3,\"price\":null},\"y\":{\"qty\":4,\"price\":null}}\navg price none"
      },
      {
        "args": [
          "[]"
        ],
        "expect": "{}\navg price none"
      },
      {
        "args": [
          "{\"type\":\"add\"}"
        ],
        "expect": "error: bad json"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"restock\",\"sku\":\"a\",\"qty\":1}]"
        ],
        "expect": "error: unknown event 2"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\"}]"
        ],
        "expect": "error: bad event 2"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"remove\",\"sku\":\"a\",\"qty\":2}]"
        ],
        "expect": "error: rejected event 2"
      }
    ],
    "hidden": [
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"add\",\"sku\":\"10\",\"qty\":2},{\"type\":\"add\",\"sku\":\"2\",\"qty\":3}]"
        ],
        "expect": "{\"b\":{\"qty\":1,\"price\":null},\"10\":{\"qty\":2,\"price\":null},\"2\":{\"qty\":3,\"price\":null}}\navg price none",
        "trap": "integer-like keys reorder"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"__proto__\",\"qty\":2},{\"type\":\"price\",\"sku\":\"__proto__\",\"price\":3}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":null},\"__proto__\":{\"qty\":2,\"price\":3}}\navg price 3.00",
        "trap": "__proto__ sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":2},{\"type\":\"rename\",\"sku\":\"a\",\"to\":\"z\"}]"
        ],
        "expect": "{\"z\":{\"qty\":1,\"price\":null},\"b\":{\"qty\":2,\"price\":null}}\navg price none",
        "trap": "rename keeps position"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":2},{\"type\":\"rename\",\"sku\":\"b\",\"to\":\"1\"}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":null},\"1\":{\"qty\":2,\"price\":null}}\navg price none",
        "trap": "rename to integer-like keeps position"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":2},{\"type\":\"rename\",\"sku\":\"a\",\"to\":\"c\"},{\"type\":\"add\",\"sku\":\"a\",\"qty\":7}]"
        ],
        "expect": "{\"c\":{\"qty\":1,\"price\":null},\"b\":{\"qty\":2,\"price\":null},\"a\":{\"qty\":7,\"price\":null}}\navg price none",
        "trap": "old name re-added goes to end"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":2},{\"type\":\"rename\",\"sku\":\"a\",\"to\":\"b\"}]"
        ],
        "expect": "error: rejected event 3",
        "trap": "rename onto existing"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"rename\",\"sku\":\"a\",\"to\":\"a\"}]"
        ],
        "expect": "error: rejected event 2",
        "trap": "rename to itself"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"rename\",\"sku\":\"q\",\"to\":\"r\"}]"
        ],
        "expect": "error: rejected event 2",
        "trap": "rename unknown sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":0},{\"type\":\"price\",\"sku\":\"b\",\"price\":3}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":0},\"b\":{\"qty\":1,\"price\":3}}\navg price 1.50",
        "trap": "price 0 counts as set"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":5},{\"type\":\"price\",\"sku\":\"a\",\"price\":null}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":null}}\navg price none",
        "trap": "price null clears"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\"}]"
        ],
        "expect": "error: bad event 2",
        "trap": "price field missing vs null"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":2}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":null},\"b\":{\"qty\":2,\"price\":null}}\navg price none",
        "trap": "no prices -> none, not NaN"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":0.01},{\"type\":\"price\",\"sku\":\"b\",\"price\":0.02}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":0.01},\"b\":{\"qty\":1,\"price\":0.02}}\navg price 0.02",
        "trap": "avg 0.015 float rounding"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":1},{\"type\":\"price\",\"sku\":\"b\",\"price\":1.01}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":1},\"b\":{\"qty\":1,\"price\":1.01}}\navg price 1.01",
        "trap": "avg 1.005 half-up"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":1.12},{\"type\":\"price\",\"sku\":\"b\",\"price\":1.13}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":1.12},\"b\":{\"qty\":1,\"price\":1.13}}\navg price 1.13",
        "trap": "avg 1.125 half-up"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"add\",\"sku\":\"c\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":1},{\"type\":\"price\",\"sku\":\"b\",\"price\":1},{\"type\":\"price\",\"sku\":\"c\",\"price\":2}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":1},\"b\":{\"qty\":1,\"price\":1},\"c\":{\"qty\":1,\"price\":2}}\navg price 1.33",
        "trap": "avg of thirds"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":12.50},{\"type\":\"price\",\"sku\":\"b\",\"price\":100.0}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":12.5},\"b\":{\"qty\":1,\"price\":100}}\navg price 56.25",
        "trap": "price shortest form 12.50/100.0"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":1e2}]"
        ],
        "expect": "{\"a\":{\"qty\":1,\"price\":100}}\navg price 100.00",
        "trap": "price exponent 1e2"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":\"5\"}]"
        ],
        "expect": "error: bad event 2",
        "trap": "price as string"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":1.234}]"
        ],
        "expect": "error: bad event 2",
        "trap": "price 3 decimals"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":-1}]"
        ],
        "expect": "error: bad event 2",
        "trap": "negative price"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":0}]"
        ],
        "expect": "error: bad event 1",
        "trap": "qty 0"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":\"2\"}]"
        ],
        "expect": "error: bad event 1",
        "trap": "qty numeric string"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"add\",\"sku\":\"a\",\"qty\":1.5}]"
        ],
        "expect": "error: bad event 2",
        "trap": "qty fractional"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":true}]"
        ],
        "expect": "error: bad event 1",
        "trap": "qty true"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":2},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"remove\",\"sku\":\"a\",\"qty\":2},{\"type\":\"price\",\"sku\":\"a\",\"price\":4}]"
        ],
        "expect": "{\"a\":{\"qty\":0,\"price\":4},\"b\":{\"qty\":1,\"price\":null}}\navg price 4.00",
        "trap": "remove to exactly 0 keeps sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":2},{\"type\":\"remove\",\"sku\":\"b\",\"qty\":1}]"
        ],
        "expect": "error: rejected event 2",
        "trap": "remove unknown sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":2},{\"type\":\"price\",\"sku\":\"b\",\"price\":1}]"
        ],
        "expect": "error: rejected event 2",
        "trap": "price unknown sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":2},{\"sku\":\"a\",\"qty\":1}]"
        ],
        "expect": "error: bad event 2",
        "trap": "type missing"
      },
      {
        "args": [
          "[{\"type\":\"Add\",\"sku\":\"a\",\"qty\":1}]"
        ],
        "expect": "error: unknown event 1",
        "trap": "type case-sensitive"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"delete\"}]"
        ],
        "expect": "error: unknown event 2",
        "trap": "unknown type beats missing fields"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},{\"type\":\"price\",\"sku\":\"a\",\"price\":2},{\"type\":\"add\",\"sku\":\"b\",\"qty\":1},{\"type\":\"archive\",\"sku\":\"b\"}]"
        ],
        "expect": "error: unknown event 4",
        "trap": "unknown event after valid ones: no partial output"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"\",\"qty\":1}]"
        ],
        "expect": "error: bad event 1",
        "trap": "empty sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":10,\"qty\":1}]"
        ],
        "expect": "error: bad event 1",
        "trap": "numeric sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"café\",\"qty\":1},{\"type\":\"add\",\"sku\":\"a\\\"b\",\"qty\":2},{\"type\":\"add\",\"sku\":\"ü\\\\x\",\"qty\":3}]"
        ],
        "expect": "{\"café\":{\"qty\":1,\"price\":null},\"a\\\"b\":{\"qty\":2,\"price\":null},\"ü\\\\x\":{\"qty\":3,\"price\":null}}\navg price none",
        "trap": "non-ASCII and quote in sku"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":1},\"add\"]"
        ],
        "expect": "error: bad event 2",
        "trap": "event not an object"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":NaN}]"
        ],
        "expect": "error: bad json",
        "trap": "NaN literal is not JSON"
      },
      {
        "args": [
          "{\"type\":\"add\",\"sku\":\"a\",\"qty\":1}"
        ],
        "expect": "error: bad json",
        "trap": "object instead of array"
      },
      {
        "args": [
          "[{\"type\":\"add\",\"sku\":\"a\",\"qty\":3},{\"type\":\"price\",\"sku\":\"a\",\"price\":2},{\"type\":\"remove\",\"sku\":\"a\",\"qty\":3},{\"type\":\"rename\",\"sku\":\"a\",\"to\":\"b\"},{\"type\":\"add\",\"sku\":\"c\",\"qty\":1},{\"type\":\"price\",\"sku\":\"c\",\"price\":3}]"
        ],
        "expect": "{\"b\":{\"qty\":0,\"price\":2},\"c\":{\"qty\":1,\"price\":3}}\navg price 2.50",
        "trap": "price survives rename; qty-0 sku in average"
      }
    ]
  },
  {
    "id": "leaderboard",
    "name": "Merge two score files into a ranked leaderboard",
    "arena": "json",
    "spec": "Leaderboard.\n\nArgs 1 and 2 are two score files as JSON. Each must be a JSON object mapping a player name to a score. If arg 1 is not valid JSON or not an object print exactly `error: bad json`; then the same check for arg 2. A file never lists the same name twice.\n\nA score is a JSON number; a JSON string holding a plain decimal number (an optional \"-\", digits, and optionally \".\" followed by digits, like \"7.5\" or \"-3\"); or null, meaning \"no score in this file\". Anything else is a bad score. If either file has a bad score, print exactly `error: bad score NAME`, where NAME is the first of the bad entries' names in Unicode code point order, and nothing else.\n\nThen arg 3 is N. It must be digits only, with value at least 1; otherwise print exactly `error: bad n`.\n\nA player's score is the highest of their non-null scores across both files. A player with no non-null score in either file is not ranked.\n\nOrder the ranked players by score, highest first, ties by name in Unicode code point order. Ranks are competition ranks: 1 + the number of players with a strictly higher score (scores 10, 10, 9 get ranks 1, 1, 3). Print the first N players in this order (all of them if there are fewer; a tie at the cut-off is not extended), one line each: `RANK. NAME SCORE`. SCORE is the value in shortest plain decimal form: no exponent, no leading zeros in the whole-number part, no trailing zeros after the point, no point for whole values, and zero as 0 (never -0): 12.50 -> 12.5, \"007\" -> 7, 1e2 -> 100. If no player is ranked, print nothing.\n\nExample: args '{\"ann\":10,\"bob\":\"7.5\",\"cy\":null}' '{\"bob\":9,\"dee\":10.0}' '3' print\n1. ann 10\n1. dee 10\n3. bob 9",
    "checks": [
      {
        "args": [
          "{\"ann\":10,\"bob\":\"7.5\",\"cy\":null}",
          "{\"bob\":9,\"dee\":10.0}",
          "3"
        ],
        "expect": "1. ann 10\n1. dee 10\n3. bob 9"
      },
      {
        "args": [
          "{\"ann\":3,\"bob\":\"4.25\"}",
          "{\"cy\":1}",
          "10"
        ],
        "expect": "1. bob 4.25\n2. ann 3\n3. cy 1"
      },
      {
        "args": [
          "{\"ann\":1}",
          "not json",
          "3"
        ],
        "expect": "error: bad json"
      },
      {
        "args": [
          "{\"ann\":\"ten\",\"bob\":2}",
          "{}",
          "3"
        ],
        "expect": "error: bad score ann"
      },
      {
        "args": [
          "{\"ann\":1}",
          "{}",
          "0"
        ],
        "expect": "error: bad n"
      },
      {
        "args": [
          "{}",
          "{\"cy\":null}",
          "5"
        ],
        "expect": ""
      }
    ],
    "hidden": [
      {
        "args": [
          "{\"a\":10,\"b\":9,\"c\":1,\"d\":100}",
          "{}",
          "9"
        ],
        "expect": "1. d 100\n2. a 10\n3. b 9\n4. c 1",
        "trap": "default sort compares as strings"
      },
      {
        "args": [
          "{\"b\":5,\"10\":5,\"2\":5}",
          "{}",
          "9"
        ],
        "expect": "1. 10 5\n1. 2 5\n1. b 5",
        "trap": "numeric-looking names in tie order"
      },
      {
        "args": [
          "{\"😀\":5,\"ｚ\":5,\"a\":5}",
          "{}",
          "9"
        ],
        "expect": "1. a 5\n1. ｚ 5\n1. 😀 5",
        "trap": "UTF-16 vs code point name order"
      },
      {
        "args": [
          "{\"a\":\"9007199254740992\",\"b\":\"9007199254740993\"}",
          "{}",
          "9"
        ],
        "expect": "1. b 9007199254740993\n2. a 9007199254740992",
        "trap": "big string scores beyond 2^53"
      },
      {
        "args": [
          "{\"a\":9007199254740992,\"b\":9007199254740993}",
          "{}",
          "9"
        ],
        "expect": "1. b 9007199254740993\n2. a 9007199254740992",
        "trap": "big JSON number scores beyond 2^53"
      },
      {
        "args": [
          "{\"a\":\"0.3\",\"b\":0.30000000000000004}",
          "{}",
          "9"
        ],
        "expect": "1. b 0.30000000000000004\n2. a 0.3",
        "trap": "float noise 0.30000000000000004"
      },
      {
        "args": [
          "{\"a\":\"12.50\",\"b\":12.50}",
          "{}",
          "9"
        ],
        "expect": "1. a 12.5\n1. b 12.5",
        "trap": "shortest form 12.50"
      },
      {
        "args": [
          "{\"a\":\"007\",\"b\":\"-0012.0\"}",
          "{}",
          "9"
        ],
        "expect": "1. a 7\n2. b -12",
        "trap": "leading zeros \"007\""
      },
      {
        "args": [
          "{\"a\":0,\"b\":-1}",
          "{\"c\":\"0\"}",
          "9"
        ],
        "expect": "1. a 0\n1. c 0\n3. b -1",
        "trap": "score 0 kept (falsy)"
      },
      {
        "args": [
          "{\"a\":null,\"b\":null}",
          "{\"a\":3}",
          "9"
        ],
        "expect": "1. a 3",
        "trap": "null in one file, number in other"
      },
      {
        "args": [
          "{\"a\":5}",
          "{\"a\":\"12\"}",
          "9"
        ],
        "expect": "1. a 12",
        "trap": "max of string \"12\" vs number 5"
      },
      {
        "args": [
          "{\"a\":\"9.5\"}",
          "{\"a\":9.25}",
          "9"
        ],
        "expect": "1. a 9.5",
        "trap": "max across files keeps higher first file"
      },
      {
        "args": [
          "{\"a\":-1,\"b\":-10,\"c\":\"-0.5\"}",
          "{}",
          "9"
        ],
        "expect": "1. c -0.5\n2. a -1\n3. b -10",
        "trap": "negative scores order"
      },
      {
        "args": [
          "{\"a\":\"-0\",\"b\":\"-0.00\"}",
          "{}",
          "9"
        ],
        "expect": "1. a 0\n1. b 0",
        "trap": "-0 prints 0"
      },
      {
        "args": [
          "{\"a\":\" 5\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "lax Number(\" 5\")"
      },
      {
        "args": [
          "{\"a\":\"\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "lax Number(\"\") = 0"
      },
      {
        "args": [
          "{\"a\":\"0x1A\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "lax Number(\"0x1A\")"
      },
      {
        "args": [
          "{\"a\":\"12abc\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "parseFloat(\"12abc\")"
      },
      {
        "args": [
          "{\"a\":\"1e3\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "exponent in score string"
      },
      {
        "args": [
          "{\"a\":\"+5\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "plus sign in score string"
      },
      {
        "args": [
          "{\"a\":true}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "bool score"
      },
      {
        "args": [
          "{\"a\":[5]}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "array score"
      },
      {
        "args": [
          "{\"a\":\"5.\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "trailing dot \"5.\""
      },
      {
        "args": [
          "{\"a\":\".5\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score a",
        "trap": "leading dot \".5\""
      },
      {
        "args": [
          "{\"a\":1e2,\"b\":1.5e-3}",
          "{}",
          "9"
        ],
        "expect": "1. a 100\n2. b 0.0015",
        "trap": "exponent JSON numbers"
      },
      {
        "args": [
          "{\"a\":10,\"b\":10,\"c\":9,\"d\":9,\"e\":1}",
          "{}",
          "9"
        ],
        "expect": "1. a 10\n1. b 10\n3. c 9\n3. d 9\n5. e 1",
        "trap": "competition ranking 1,1,3,3"
      },
      {
        "args": [
          "{\"a\":10,\"b\":10,\"c\":10}",
          "{}",
          "2"
        ],
        "expect": "1. a 10\n1. b 10",
        "trap": "N cuts inside a tie"
      },
      {
        "args": [
          "{\"zed\":\"x\",\"b\":1}",
          "{\"amy\":\"y\"}",
          "3"
        ],
        "expect": "error: bad score amy",
        "trap": "bad score name priority across files"
      },
      {
        "args": [
          "{\"b\":\"x\",\"10\":\"y\",\"2\":\"z\"}",
          "{}",
          "3"
        ],
        "expect": "error: bad score 10",
        "trap": "bad score priority numeric names"
      },
      {
        "args": [
          "{\"a\":\"x\"}",
          "[1,2]",
          "3"
        ],
        "expect": "error: bad json",
        "trap": "bad json before bad score"
      },
      {
        "args": [
          "{\"a\":\"x\"}",
          "{}",
          "0"
        ],
        "expect": "error: bad score a",
        "trap": "bad score before bad n"
      },
      {
        "args": [
          "{\"a\":1}",
          "{}",
          "-1"
        ],
        "expect": "error: bad n",
        "trap": "n not digits"
      },
      {
        "args": [
          "{\"a\":1}",
          "{}",
          " 3"
        ],
        "expect": "error: bad n",
        "trap": "n with space"
      },
      {
        "args": [
          "{\"a\":1}",
          "{}",
          "1.0"
        ],
        "expect": "error: bad n",
        "trap": "n 1.0"
      },
      {
        "args": [
          "{\"a\":1,\"b\":2}",
          "{}",
          "007"
        ],
        "expect": "1. b 2\n2. a 1",
        "trap": "n \"007\""
      },
      {
        "args": [
          "null",
          "{}",
          "3"
        ],
        "expect": "error: bad json",
        "trap": "arg 1 null"
      },
      {
        "args": [
          "{\"__proto__\":5,\"a\":3}",
          "{\"__proto__\":\"7\"}",
          "9"
        ],
        "expect": "1. __proto__ 7\n2. a 3",
        "trap": "__proto__ name"
      },
      {
        "args": [
          "{\"a\":\"1.10\",\"b\":\"1.9\"}",
          "{}",
          "9"
        ],
        "expect": "1. b 1.9\n2. a 1.1",
        "trap": "decimal compare 1.10 vs 1.9"
      },
      {
        "args": [
          "{\"a\":NaN}",
          "{}",
          "3"
        ],
        "expect": "error: bad json",
        "trap": "NaN literal is not JSON"
      }
    ]
  }
];
