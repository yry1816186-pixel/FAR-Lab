# Concept: Evidence

> **Evidence** is a measurement or observation written into the content-addressed ledger. Every
> evidence row is hashed into an append-only chain; an LLM (or a human) may **propose** evidence, but
> an LLM-asserted anchor is flagged `forged` unless the harness independently re-derives it.

## What counts as evidence

| Kind | Example |
|------|---------|
| `measurement` | A primary metric value produced by running the FEC workflow |
| `statistical` | A p-value / effect size / CI computed by `src/statistics/` (never a literal) |
| `dataset_binding` | A resolved anchor to an external dataset (DOI / accession / hash) |
| `repro_run` | A recomputation run record (wall/cpu/peak-rss fingerprint + artifact hashes) |

A claim's `falsificationSpec` names **one** primary metric; the evidence ledger holds the actual
measured values that the R0–R9 kernel adjudicates. See [claim.md](claim.md).

## Provenance — the "source cannot self-fill" red line

Every evidence row carries a `provenanceClass`:

- `system_derived` — computed by the deterministic harness (hash recompute, statistics) → trusted.
- `human` — entered by a person → shown, never auto-trusted as a primary anchor.
- `llm_generated` — produced by an LLM → the `provenance` field is forced to **null** and the row is
  flagged `forged` unless the harness re-derives the value. An LLM may never self-attest an evidence
  anchor. This is the executable form of the anti-theater red line "sources cannot self-fill".

## Dataset bindings and source anchors

A `sourceAnchor` with `resolved=false` is a WARN, never silently trusted. A claim that carries a
verifiable identifier (DOI / arXiv / accession) with **no** harness-verified source is `REFUTED` by
`R_IDENTIFIER_FABRICATION` — not accepted on the author's say-so. Whitelisted hosts are fetched via a
real subprocess (`dataset_fetch.py`); the host whitelist is fail-closed (an unknown host is never
spawned).

## Execution fingerprint

Reproducible evidence rows carry a wall-clock / CPU / peak-RSS triple (collected by the sandbox) plus
artifact SHA-256s. A magnitude mismatch across recomputation runs (e.g. wall time 100× faster than
CPU time) is flagged and downgrades the verdict via `R_EXECUTION_FINGERPRINT_MISMATCH` — "agreement
is not verification": a re-run that produces the same number with a wildly different fingerprint is
suspect.

## Derivation form

A `StatisticalResult` declares its `derivationForm` (`literal` / `derived` / `formula` / `auto`). The
kernel downgrades a verdict when the form changes even if the **value** is equal — silently turning a
hardcoded literal into a "computed" value is `R_DERIVATION_FORM_MISMATCH`, not a silent pass.

## The ledger (mechanics)

How the hash chain itself works (genesis → head, append-only triggers, cross-language byte-identical
hashes) is covered in [evidence-ledger.md](evidence-ledger.md). This doc is about *what* evidence is
and *who* may assert it; that doc is about *how* it is stored tamper-detectably.

## Related commands

```bash
far status --db <path>                   # verify the ledger chain head
far verify --db <path> --mode chain       # third-party recomputation of the chain
far api (GET /api/v1/evidence/:id)        # fetch one evidence node
far api (GET /api/v1/evidence/chain/:h)   # fetch the sub-chain whose head hash matches
```

## Boundaries (honest)

- The ledger detects **tampering** (after-the-fact edits break the chain); it does not detect
  **fabrication at write time** — that is the anti-theater layer's job (see [anti-theater.md](anti-theater.md)).
- Float serialization is migrating to RFC 8785 JCS (V3 roadmap); string-key hashing is fully proven.

See also: [evidence-ledger.md](evidence-ledger.md) · [claim.md](claim.md) · [verdict.md](verdict.md) ·
[anti-theater.md](anti-theater.md)
