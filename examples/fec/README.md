# FEC example contract (`far fec compile` / `freeze`)

This directory provides a **valid Falsification Evidence Contract V2 (FEC)** example that you can feed
straight into `far fec compile` / `far fec freeze`.

## Files

| File | Description |
|------|-------------|
| `sample_fec_contract.json` | The falsifiable contract for C-ASTRO-0001 (macro-F1 ≥ 0.80 threshold) — a real contract serialized by `makeLegacyCompatFec`, **guaranteed to pass `parseFecContract` validation** |

## Usage

```bash
# 1. Compile: run the 10 compilation checks (#1-#10) and recompute the fecHash
far fec compile --claim examples/fec/sample_fec_contract.json --out examples/fec/sample_compiled.json
# → far fec compile: FEC-LEGACY-C-ASTRO-0001 → examples/fec/sample_compiled.json (fecHash=f20933daca90…)

# 2. Freeze-check: recompute the fecHash and compare it with the stored value (tamper-detectable · RR-1: the fecHash must be recomputed by code, never hand-filled)
far fec freeze --fec examples/fec/sample_compiled.json
# → far fec freeze: PASS (fecHash=f20933daca90…)
```

`sample_compiled.json` is a generated artifact (gitignored) produced by the command above — do not
hand-fill its `fecHash`. `far fec freeze` recomputes it for real and compares.

## Contract schema

The FEC V2 contract fields are defined in `src/fec/fec_contract.ts` (aligned with `APPENDIX_A §2`).
Core fields:

- `fecId` / `claimId` — contract and claim identifiers
- `scope` — bounded dimensions (population / timeWindow / domainConstraint; missing ⇒ `SCOPE_UNBOUNDED`)
- `metric` / `threshold` / `direction` — the falsifiable threshold
- `statisticalPlan` — 10 required fields (alpha / nullHypothesis / effectDirection / …; missing ⇒ `STAT_PLAN_MISSING`)
- `seedPolicy` / `deviationPolicy` / `freeze` / `integrityFlags` — reproducibility and integrity constraints

Compile-failure reason codes map to kernel rules R1/R3/R5/R8 (see `src/fec/compiler.ts`).
