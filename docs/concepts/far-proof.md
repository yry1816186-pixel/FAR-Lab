# Concept: `.far-proof` (Proof Bundle)

> A `.far-proof` is a **self-verifiable** offline evidence bundle: claim graph + redacted evidence
> chain + proofHash. A third party can independently recompute and verify it **without trusting the
> exporter**.

## What it solves

Scientific claims easily suffer "conclusions detached from evidence". A `.far-proof` packages the
full lifecycle of a claim — claim → evidence → verdict → seal — into an independently recomputable
artifact: whoever receives the bundle recomputes the hashes to confirm it is **untampered** and
**self-consistent**.

## Structure (V1 minimal · 10 files)

`far export far-proof --demo-chain --out <dir>` produces:

| File | Purpose |
|------|---------|
| `claim_graph.json` | claim + evidence nodes (with hash chain `current_hash` / `prev_hash`) |
| `proof_envelopes.jsonl` | sealed verdict (covered by proofHash) |
| `call_records.redacted.jsonl` | LLM call records (redacted) |
| `repro_runs.jsonl` | recomputation run records |
| `data_manifest.json` | data fingerprint manifest |
| `ro-crate-metadata.json` | RO-Crate metadata (standard provenance) |
| `prov.ttl` | PROV-O RDF provenance |
| `otel-trace.jsonl` | OpenTelemetry trace |
| `code/MANIFEST.md` | code manifest |
| `README_REPLAY.md` | replay instructions |

## proofHash — the root of tamper detection

`proofHash` is a SHA-256 over canonical JSON. `far verify --bundle` does:

1. Read the stored proofHash from the bundle.
2. **Independently recompute** proofHash (from the claim/envelope content inside the bundle).
3. Compare: equal → `tamperStatus: clean`; mismatch → `tamperStatus: tampered` / exit 7.

Any byte change covered by proofHash → recomputed ≠ stored → immediately detected. This is the
fail-closed red line.

## Multi-axis recomputation

| Axis | Implementation | When missing |
|------|----------------|--------------|
| `recomputation.node` | TS side `src/proof_envelope/` | Core axis, always runs |
| `recomputation.python` | Python mirror `repro/far_chain_repro/proof_hash.py` | Marked `not-run` (env-dependent, never faked) |
| `recomputation.browser` | Browser Web Crypto (frontend/public) | Phase 2 / #13 not yet wired → `not-run` |

Honesty boundary: when the python/browser axis is not-run, `far verify` returns `WARN` (not `PASS`)
— **it never fakes a pass**.

## Related commands

```bash
far export far-proof --demo-chain --out <dir>               # export (demo source)
far export far-proof --db <path> --run-id ... --out <dir>   # export (real DB source)
far verify --bundle <dir>                                    # third-party independent recomputation
far verify <dir>                                             # positional shorthand (far verify <path>)
far export receipt --bundle <dir> --format markdown          # Trust Receipt projection
```

## Boundaries (honest)

- V1 is a **self-verifiable bundle** (proofHash + redacted chain + third-party node recomputation); it
  is **not** a certificate issued by an external RO-Crate / PROV-O certification authority.
- Float serialization: string-key hashing is fully proven; float serialization is migrating to
  RFC 8785 JCS (see the README known-limits section).
- `recomputation.python` needs Python + sympy/z3 (`pip install -e .`); `recomputation.browser` is pending.

See also: [evidence-ledger.md](evidence-ledger.md) · [../demos/tess-offline.md](../demos/tess-offline.md)
