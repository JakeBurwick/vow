import sys,urllib.request
H=sys.argv[1]
print("price", urllib.request.urlopen("http://"+H+":47812/price").read().decode(), flush=True)
urllib.request.urlopen("http://"+H+":47"+"899/s4").read()
