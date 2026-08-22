#!/usr/bin/env bash
# One-shot WSL end-to-end test for the FAR-Lab desktop shell (D-068).
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null
# Launch -> real health probe -> window process alive -> force-kill -> orphan check.
set -u
export PATH="$HOME/.cargo/bin:$PATH"
cd ~/fl-desktop/desktop/src-tauri || exit 9
./target/debug/far-lab-desktop > /tmp/fl.log 2>&1 &
SHELL_PID=$!
ok=""
for i in $(seq 1 25); do
  sleep 1
  C=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4520/api/v1/health)
  if [ "$C" = "200" ]; then ok="yes"; echo "health=200 after ${i}s"; break; fi
done
[ -z "$ok" ] && { echo "health-timeout"; tail -5 /tmp/fl.log; exit 1; }
echo "window-proc=$(pgrep -fc far-lab-desktop)"
echo "--- force kill -9 shell ($SHELL_PID)"
kill -9 "$SHELL_PID" 2>/dev/null
sleep 2
if pgrep -f 'node.*serve\.mjs' > /dev/null; then
  echo "NODE-ORPHANED (Linux PDEATHSIG gap confirmed)"
  pkill -9 -f 'node.*serve\.mjs'
else
  echo "node-died-with-shell"
fi
C2=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:4520/api/v1/health)
echo "after-kill=$C2"
echo "--- shell log tail:"
tail -4 /tmp/fl.log
