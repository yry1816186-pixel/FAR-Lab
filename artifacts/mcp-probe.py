import json, subprocess, sys, threading, time

proc = subprocess.Popen(
    ["docling-mcp-server", "--transport", "stdio", "conversion"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)

def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n")
    proc.stdin.flush()

def read_msg():
    line = proc.stdout.readline()
    return json.loads(line) if line.strip() else None

send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "probe", "version": "0"}}})
init = read_msg()
print("INIT:", init["result"]["serverInfo"] if init and "result" in init else init)
send({"jsonrpc": "2.0", "method": "notifications/initialized"})
send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
tools = None
deadline = time.time() + 60
while time.time() < deadline:
    m = read_msg()
    if m and m.get("id") == 2:
        tools = m["result"]["tools"]
        break
if tools:
    print(f"TOOLS: {len(tools)}")
    for t in tools[:10]:
        print(" -", t["name"])
else:
    print("TOOLS: TIMEOUT/FAIL")
proc.kill()
