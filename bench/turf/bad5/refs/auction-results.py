# Auction results: bids and outcome per lot, revenue, busiest bidder. Fails loudly on any record it cannot read.
import json, math, sys

def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)

def cents(v, where):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
        fail(f"{where}: bad amount {json.dumps(v)}")
    c = round(v * 100)
    if abs(v * 100 - c) > 1e-6:
        fail(f"{where}: amount {v} has more than 2 decimals")
    return c

if len(sys.argv) < 2:
    fail("missing argument")
try:
    data = json.loads(sys.argv[1])
except ValueError as e:
    fail(f"invalid JSON: {e}")
if not isinstance(data, dict):
    fail("expected a JSON object")
lots = data.get("lots")
if not isinstance(lots, list):
    fail("missing lots list")
out, counts, revenue = [], {}, 0
for i, lot in enumerate(lots, 1):
    if not isinstance(lot, dict):
        fail(f"lot {i}: expected an object")
    lid = lot.get("lot")
    if not isinstance(lid, str):
        fail(f"lot {i}: missing lot id")
    if "reserve" not in lot:
        fail(f"lot {i}: missing reserve")
    reserve = cents(lot["reserve"], f"lot {i} reserve")
    bids = lot.get("bids")
    if not isinstance(bids, list):
        fail(f"lot {i}: missing bids list")
    last = None
    for j, b in enumerate(bids, 1):
        if not isinstance(b, dict):
            fail(f"lot {i} bid {j}: expected an object")
        bidder = b.get("bidder")
        if not isinstance(bidder, str) or bidder == "":
            fail(f"lot {i} bid {j}: missing bidder")
        if "amount" not in b:
            fail(f"lot {i} bid {j}: missing amount")
        a = cents(b["amount"], f"lot {i} bid {j}")
        if last is not None and a <= last[1]:
            fail(f"lot {i} bid {j}: bid is not higher than the bid before it")
        last = (bidder, a)
        counts[bidder] = counts.get(bidder, 0) + 1
    if last is not None and last[1] >= reserve:
        revenue += last[1]
        out.append(f"{lid} {len(bids)} sold {last[0]} {last[1] // 100}.{last[1] % 100:02d}")
    else:
        out.append(f"{lid} {len(bids)} unsold")
if not counts:
    fail("no bids, there is no busiest bidder")
out.append(f"revenue {revenue // 100}.{revenue % 100:02d}")
top = min(counts, key=lambda k: (-counts[k], k))
out.append(f"busiest {top} {counts[top]}")
print("\n".join(out))
