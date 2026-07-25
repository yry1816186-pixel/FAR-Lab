# Quickstart

> Goal: see FAR-Chain's core value in 5 minutes — **deterministic verdict + tamper-detectable**,
> fully offline, zero API keys.

## Prerequisites

- **Node.js ≥ 24** (hard dependency: the CLI uses Node 24 native type-stripping to run `.ts` directly,
  no dist build)
- pnpm 10.x (`corepack enable`)
- Python 3.11+ (optional, only for the SymPy/Z3 research axis; if missing, that axis skips and the
  offline demo is unaffected)
- git

## 1. Install

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
```

Detailed install (macOS/Linux/Windows/Docker): see [installation.md](installation.md).

## 2. Environment self-check

```bash
node src/cli/far.ts doctor
```

`far doctor` checks Node/pnpm/Python/git/Docker, project dependencies, native-module loading, and an
offline verify of the demo fixture. A missing API key only **WARNs, never FAILs** — the offline demo
does not need it. Exit codes: `0` all green / `1` FAIL present (core impaired) / `2` WARN only.

## 3. Run the offline demo

```bash
node src/cli/far.ts demo tess-offline
```

You will see: ① 14 Golden Vectors adjudicated by the real R0–R9 kernel; ② an end-to-end TESS claim
(`C-ASTRO-0001`) through FEC orchestration → kernel verdict → fail-closed sealing. Zero credentials,
zero network.

## 4. Export a proof bundle (needed by step 5 tamper demo)

```bash
node src/cli/far.ts export far-proof --demo-chain --force
#   → exports ./.far-proof/ (third-party independently recomputable bundle)
```

## 5. Verify a persisted proof bundle (third-party independent recomputation)

```bash
node src/cli/far.ts verify .far-proof
#   tamperStatus: clean · recomputation.node: pass · exit 0
```

`far verify` performs a **third-party independent recomputation** of the bundle: it recomputes the
proofHash and compares it with the stored value, and verifies hash-chain integrity.

## 6. Watch tamper detection

macOS / Linux / WSL (bash):
```bash
mkdir -p /tmp/tampered && cp -r .far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
node src/cli/far.ts verify /tmp/tampered
#   tamperStatus: tampered · recomputation.node: fail · exit 7
rm -rf /tmp/tampered
```

Windows (PowerShell 7+):
```powershell
New-Item -ItemType Directory -Force tampered | Out-Null
Copy-Item -Recurse .far-proof tampered
(Get-Content tampered/proof_envelopes.jsonl) -replace 'UNTESTED','CONFIRMED' | Set-Content tampered/proof_envelopes.jsonl
node src/cli/far.ts verify tampered
#   tamperStatus: tampered · recomputation.node: fail · exit 7
Remove-Item -Recurse -Force tampered
```

Any byte change covered by the proofHash → recomputed hash ≠ stored hash → immediately detected as
`tampered` / exit 7. This is the fail-closed red line: **a tampered proof can never pass
verification.**

## Next steps

- Full demo (incl. the MMLU hero pipeline · real statistics driving CONFIRMED): `far demo`
- Export your own proof bundle: `far export far-proof --demo-chain --out <dir>`
- Concepts deep-dive: [concepts/evidence-ledger.md](concepts/evidence-ledger.md) · [concepts/far-proof.md](concepts/far-proof.md)
- Real Qwen inference (needs a key): [providers/qwen-dashscope.md](providers/qwen-dashscope.md)

## Deep navigation

| What you want to know | Where to go |
|-----------------------|-------------|
| ProofEnvelope + independent verification | [concepts/far-proof.md](concepts/far-proof.md) |
| Evidence chain + verdict kernel | [concepts/evidence-ledger.md](concepts/evidence-ledger.md) |
| Install details | [installation.md](installation.md) |
