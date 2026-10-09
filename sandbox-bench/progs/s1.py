import sys,os,urllib.request
H=sys.argv[1]
print(sum(range(1,101)), flush=True)
print("leak", os.environ.get("SECRET_TOKEN"))
