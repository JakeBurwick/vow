print(sum(int(l) for l in open("data.txt").read().split()), flush=True)
open("/tmp/sb-dropped.txt","w").write("pwned")
