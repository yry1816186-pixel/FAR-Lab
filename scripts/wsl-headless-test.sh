#!/usr/bin/env bash
# FAR-Lab headless-Linux real verification (D-069): full usability WITHOUT browser/GUI.
set -u
source ~/.nvm/nvm.sh && nvm use 24 >/dev/null
cd ~/fl-desktop || exit 9
FAR="node dist/cli/main.js"
pass=0; fail=0
ck() {
  if echo "$3" | grep -q "$2"; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1 wanted [$2] got:"; echo "$3" | head -3 | sed 's/^/      /'; fi
}

echo "== 1. CLI surface =="
H=$($FAR --help 2>/dev/null)
ck "--help full command surface" "far data info" "$H"

echo "== 2. real DB on Linux fs + pick a COMPLETED run =="
L=$($FAR runs 2>/dev/null)
ck "runs reads real data cross-OS" "run_" "$L"
RID=$(echo "$L" | awk '$2=="completed"{print $1; exit}')
echo "      completed run: $RID"

echo "== 3. status =="
S=$($FAR research status "$RID" 2>/dev/null)
ck "status progress" "progress:" "$S"
ck "status lease line" "lease:" "$S"

echo "== 4. inspect four projections on a completed run =="
ck "inspect --sources" "depth=" "$($FAR research inspect "$RID" --sources 2>/dev/null)"
ck "inspect --evidence bindings" "verified" "$($FAR research inspect "$RID" --evidence 2>/dev/null)"
ck "inspect --hypotheses" "testability=" "$($FAR research inspect "$RID" --hypotheses 2>/dev/null)"
ck "inspect --plan" "objective:" "$($FAR research inspect "$RID" --plan 2>/dev/null)"

echo "== 5. feedback fail-closed =="
OUT=$($FAR research feedback "$RID" --source reviewer --content headless --target-kind evidence_relation --target-id ev_00000000000000000000000000 2>&1); RC=$?
ck "ghost target exit=2 (usage class)" "^2$" "$RC"
ck "ghost target honest msg" "not found" "$OUT"

echo "== 6. export both formats =="
rm -rf /tmp/fl-export
$FAR research export "$RID" --format bundle --out /tmp/fl-export >/dev/null 2>&1
ck "bundle written" "bundle" "$(ls /tmp/fl-export 2>/dev/null)"
$FAR research export "$RID" --format report --out /tmp/fl-export >/dev/null 2>&1
ck "report written" "report.md" "$(ls /tmp/fl-export 2>/dev/null)"
BID=$(ls /tmp/fl-export | grep bundle | head -1 | sed 's/.bundle.json//')

echo "== 7. headless trust loop - far verify =="
V=$($FAR verify "$BID" 2>/dev/null)
ck "verify 10/10 checks" "10/10 checks passed" "$V"
ck "verify verdict" "verdict: verified" "$V"
$FAR verify "$BID" >/dev/null 2>&1
ck "exit code 0 on verified" "^0$" "$?"

echo "== 8. probe + data info =="
ck "probe routes" "deepseek" "$($FAR probe 2>/dev/null)"
ck "data info footprint" "artifacts:" "$($FAR data info 2>/dev/null)"

echo "== 9. headless API =="
PORT=4533 node scripts/serve.mjs >/tmp/api.log 2>&1 &
APID=$!
C=""
for i in $(seq 1 20); do sleep 1; C=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4533/api/v1/health); [ "$C" = "200" ] && break; done
ck "API health headless" "200" "$C"
ck "GET corpus transparency" "queries" "$(curl -s http://127.0.0.1:4533/api/v1/runs/$RID/corpus | head -c 300)"
ck "GET verify via API" '"verdict":"verified"' "$(curl -s http://127.0.0.1:4533/api/v1/verify/$BID | grep -o '\"verdict\":\"[a-z]*\"')"
kill $APID 2>/dev/null

echo "== 10. json automation =="
ck "runs --json" '"id"' "$($FAR runs --json 2>/dev/null | head -c 200)"

echo "RESULT: $pass passed, $fail failed"
exit $([ $fail -eq 0 ] && echo 0 || echo 1)
