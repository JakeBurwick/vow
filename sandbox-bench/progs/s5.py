import os
print("key ok" if os.environ.get("PRICE_KEY") else "no key", flush=True)
print("leak", os.environ.get("SECRET_TOKEN"))
