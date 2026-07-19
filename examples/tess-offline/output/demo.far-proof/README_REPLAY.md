# FAR-Chain Proof Export — Replay Instructions

**Run ID**: `demo_astro_0001_refuted`
**Model Snapshot**: `offline-replay-fixture@v1`
**Git Commit (HEAD)**: `ffffffffffffffffffffffffffffffffffffffff`
**Env Hash**: `51f4d98e1399fdce94a942250f9809b2f48f4cad801b390de929bea52f929320`
**Generated**: 2026-06-28T00:00:00.000Z

## Fresh-Clone Replay

```bash
# 0. Fresh clone + checkout the recorded HEAD (code snapshot lock)
git clone <repo> && cd far-chain
git checkout ffffffffffffffffffffffffffffffffffffffff

# 1. Install dependencies (frozen — lock files are part of the proof)
pnpm install --frozen-lockfile
pip install -e .

# 2. Verify evidence_log hash chain
pnpm exec tsx ci/verify_chain_smoke.ts

# 3. Recompute ProofEnvelope proof hashes (byte-equal replay)
pnpm exec tsx scripts/recompute_proof_hashes.ts

# 4. Replay demo chain (C-ASTRO-0001 → FEC → ProofEnvelope)
pnpm exec tsx scripts/replay_demo_chain.ts
```

## Hash Verification Status

✅ Chain verified: 1 records, all hashes consistent.

## Files in this export

| File | Description |
|------|-------------|
| `proof_envelopes.jsonl` | Sealed proof envelopes (one per claim) |
| `repro_runs.jsonl` | Reproduction run records |
| `call_records.redacted.jsonl` | Call record chain (API keys redacted) |
| `claim_graph.json` | Evidence DAG subgraph (evidence_edges + verdict_nodes, 09 §5 V1) |
| `otel-trace.jsonl` | OTel GenAI spans projected from call_records (V1: far_chain.source=call_records_projection, not native SDK; native trace_events = V2) |
| `ro-crate-metadata.json` | RO-Crate metadata (V1 minimal, not validator-compliant) |
| `prov.ttl` | PROV-O provenance trace |
| `data_manifest.json` | File manifest of this export |
| `README_REPLAY.md` | This file |
| `code/` | Code snapshot at time of computation |
| `figures/` | Generated figures (if any) |

## Known Limitations

- This export does NOT pass third-party RO-Crate or PROV-O validators (V3 roadmap).
- Call record payloads (request/response) are redacted to protect API keys.
- The `CONFIRMED` verdict requires human scientific endorsement (ASK-9).
- Code is verified only against the current HEAD — no formal verification.

## Honesty Declaration

FAR-Chain produces **reliability evidence packages**, not proofs of scientific truth. 
Every claim is accompanied by its falsification spec, verdict, audit trail, and 
cryptographic hash chain — so a reviewer can independently verify:

1. That the claim was registered BEFORE the evidence was collected (pre-registration hash).
2. That the hash chain is unbroken (append-only ledger).
3. That the verdict follows deterministically from the evidence (anti-theater CI gate).
4. That the computation is reproducible (WIP E4 golden_vectors).

We do NOT claim:
- Absolute scientific truth.
- Physical process isolation.
- General-purpose benchmark capability.
- Fully automated discovery.