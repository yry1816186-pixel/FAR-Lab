import json, subprocess, time

proc = subprocess.Popen(
    ["npx.cmd", "-y", "@playwright/mcp@latest"],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, shell=False)

def send(obj):
    proc.stdin.write(json.dumps(obj) + "\n"); proc.stdin.flush()

send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
    "protocolVersion": "2024-11-05", "capabilities": {},
    "clientInfo": {"name": "probe", "version": "0"}}})
send({"jsonrpc": "2.0", "method": "notifications/initialized"})
send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})

tools = None
deadline = time.time() + 90
while time.time() < deadline:
    line = proc.stdout.readline()
    if not line:
        time.sleep(0.2); continue
    try: m = json.loads(line)
    except Exception: continue
    if m.get("id") == 1:
        print("INIT ok:", m["result"]["serverInfo"])
    if m.get("id") == 2:
        tools = m["result"]["tools"]
        break
if tools:
    print(f"TOOLS: {len(tools)}")
    print(", ".join(t["name"] for t in tools))
else:
    print("TOOLS: TIMEOUT")
proc.kill()
