# FAR-Lab — Judge Quick-Start Guide (5 minutes)

> **What is FAR-Lab?** FAR-Lab is a *lie-detector for AI-generated scientific claims*.
> When an LLM proposes a scientific hypothesis, FAR-Lab uses a **deterministic rule kernel**
> (no LLM self-judgment) to answer three questions:
> 1. **Can it be falsified?** (Falsifiability Enforcement Contract — FEC)
> 2. **Does the evidence support it?** (5-value verdict: CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED)
> 3. **Can you verify it yourself?** (portable `.far-proof` bundle — tamper-detectable, independently recomputable)

---

## 60-second verification (no API key needed)

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
node src/cli/far.ts demo
```

**Expected output:**
- 14/14 Golden Vectors PASS (deterministic R0-R9 kernel, no LLM in the loop)
- End-to-end demo claim sealed (UNTESTED → honest boundary: no statistics injected yet)
- Real-time statistics demo: oneSampleZTest → CONFIRMED → sealed as INCONCLUSIVE (ASK-9: machine cannot self-seal CONFIRMED)

## 2-minute hero demo — tamper detection

```bash
# 1. Export a proof bundle
node src/cli/far.ts export far-proof --demo-chain --force

# 2. Verify it's clean (exit 0)
node src/cli/far.ts verify --bundle .far-proof

# 3. Tamper with a data point
cp -r .far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl

# 4. Verify again — tamper detected! (exit 7)
node src/cli/far.ts verify --bundle /tmp/tampered
#   → tamperStatus: tampered · recomputation.node: fail · exit 7
```

This is the **HERO-TAMPER-PLUS** moment: a single byte change flips the verdict
from clean to tampered, detected by SHA-256 hash chain recomputation.

## 5-minute deep dive — the deterministic kernel

```bash
# Run the R0-R9 verdict kernel over 14 golden vectors
node src/cli/far.ts verify-golden --all
# Each vector tests a specific rule path:
#   GV-01: CONFIRMED via R7 (all hard gates pass)
#   GV-02: REFUTED via R6 (primary test refutes)
#   GV-07: INCONCLUSIVE via R8 (insufficient statistical power)
#   GV-10: UNTESTED via ANTI_THEATER_FAIL (statistical fraud detected)
#   GV-14: REFUTED via R_IDENTIFIER_FABRICATION (fake DOI detected)

# See the full rule trace for one case
node src/cli/far.ts verify-golden --case GV-08 --json
```

## Web dashboard (optional)

```bash
# Terminal 1: start the API server
node src/cli/far.ts api

# Terminal 2: start the frontend
cd frontend && npm run dev
# Open http://localhost:5173
```

The dashboard shows:
- **Honesty Wall**: all verdicts (including REFUTED — negative results matter)
- **Integrity root**: whole-chain Merkle root fingerprint
- **Evidence chain graph**: hash-linked DAG visualization
- **8-act demo tour**: interactive feature walkthrough

## What FAR-Lab cannot prove (honest boundary)

- It does **not** prove scientific truth — only contract consistency
- A CONFIRMED verdict still requires human scientific review
- Demo conclusions come from fixtures, not live experiments
- Cross-platform testing is Windows-verified; Linux CI expected green

## Architecture in 30 seconds

```
LLM hypothesis
      ↓
  [FEC gate] —— Can this claim be falsified?
      ↓
  [Evidence collection] —— Experiments, datasets, statistics
      ↓
  [R0-R9 verdict kernel] —— Deterministic 5-value verdict (NO LLM)
      ↓                         ↑
  [22 anti-theater detectors] —— p-hacking, cherry-picking, HARKing...
      ↓
  [Seal + .far-proof export] —— Tamper-evident, independently recomputable
```

**Key innovation**: The verdict kernel is 100% deterministic. No LLM judges the
evidence. The LLM only proposes hypotheses; the rule tree decides.
