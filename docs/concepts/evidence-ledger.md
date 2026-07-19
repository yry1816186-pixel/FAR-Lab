# Concept: Evidence Ledger

> The evidence ledger is an **append-only**, content-addressed hash chain. All evidence / verdict /
> FEC contracts are stored under SHA-256; once written they cannot be changed, and any change is
> detected. Cross-language (TS / Python / browser) hashes are **byte-identical**.

## What it solves

Scientific evidence is easily "swapped after the fact" or "quietly stripped of unfavorable results".
An append-only hash chain leaves an unforgeable fingerprint on every write — any after-the-fact
modification → the hash chain breaks → immediately detected.

## Content-addressed

Each record's `current_hash = SHA-256(canonical(previous_hash + content))`, and `prev_hash` points to
the previous record. This forms a one-way chain:

```
genesis(0x000...) → evidence_1 → verdict_1 → evidence_2 → verdict_2 → ...
```

Modify any intermediate record's content → its `current_hash` changes → every subsequent `prev_hash`
link breaks → `verifyChainHead` detects it.

## Append-only triggers

At the SQLite layer, migrations such as `0008_anti_theater_trigger_v2` enforce append-only via
triggers: attempts to UPDATE/DELETE existing rows are rejected at the database layer. This is the
storage-level backstop of the fail-closed red line.

## Cross-language hash consistency

`canonicalHash` (TS `src/evidence_log/`) ≡ `canonical_hash` (Python `repro/far_chain_repro/`): both
produce a **byte-equal** SHA-256 for the same input. This is enforced in CI by
`tests/evidence_log/cross_lang_consistency.test.ts` + the Python mirror (`cross_lang` is the
highest-priority R2 gate).

- TS side: `canonicalHash` (stably-sorted string-key JSON → sha256)
- Python side: `repro/far_chain_repro/canonical_json.py` + `proof_hash.py`
- Browser side: Web Crypto (frontend/public verify script)

> Honesty boundary: string-key hashing is fully proven; float serialization is migrating to
> RFC 8785 JCS (V3 roadmap). The Python axis needs `pip install -e .`; if missing, that axis skips
> (it never fakes a pass).

## Merkle aggregation root

At the suite level, a Merkle tree aggregates all test results into a single `suiteIntegrityRoot`.
The browser side can independently recompute and cross-check it via Web Crypto, with no need to trust CI.

## Related commands / scripts

```bash
far status --db <path>                # verify the chain head (verifyChainHead) + migration count
far verify --db <path> --mode chain   # third-party recomputation of the hash chain
node ci/verify_chain_smoke.ts         # CI chain-integrity smoke
node ci/merkle_integrity_smoke.ts     # Merkle root smoke
```

See also: [far-proof.md](far-proof.md) · schema in `schema/migrations/0001..0017.sql`
