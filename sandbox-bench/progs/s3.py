import sys,os,urllib.request
H=sys.argv[1]
print(sum(range(1,101)), flush=True)
urllib.request.urlopen("http://"+H+":47899/s3").read()
