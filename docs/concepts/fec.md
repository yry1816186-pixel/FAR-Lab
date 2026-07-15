# Concept: FEC (Falsifiability Evidence Contract)

> A **FEC** is a frozen, hashed measurement/statistical plan that operationalizes a claim's
> falsificationSpec. Compiling a FEC runs 10 deterministic checks; a claim **cannot** reach
> `CONFIRMED` without a compilable FEC (`R1_FEC_NOT_COMPILABLE`).

## What it solves

The weakest honesty point of any verification system is "vacuous acceptance": a claim that *looks*
falsifiable but whose measurement plan is so loose it can never fail. A FEC forces the author to
commit, **before** seeing results, to: the exact primary metric, the threshold, the statistical plan
(power / multiple-testing correction), the dataset binding, the seed policy, and the protocol freeze
point. Changing any of these after seeing results is `HARKING_REVISION_AFTER_RESULT`.

## Structure (FEC/2.0)

```json
{
  "fecId": "FEC-PHYSICS-0001",
  "contractVersion": "FEC/2.0",
  "claimId": "PHYSICS-0001",
  "measurableImplication": "if the claim holds, metric Y exceeds T",
  "scope": {
    "population": "the applicable dataset / population",
    "timeWindow": "the time window",
    "domainConstraint": "the falsification method"
  },
  "requiredEvidence": [
    { "evidenceId": "PHYSICS-primary-evidence", "kind": "measurement", "critical": true }
  ],
  "datasetRequirements": [
    { "name": "...", "contentHashAlgorithm": "sha256", "allowSynthetic": false }
  ],
  "workflowRequirements": [
    { "name": "...", "engine": "manual", "expectedNetworkPolicy": "off", "requireFixedSeed": true }
  ],
  "metric": { "metricKey": "Y", "description": "...", "unit": "...", "computationRef": "...", "isDeterministic": true },
  "threshold": { "value": 0.95, "unit": "...", "thresholdSemantics": "gt", "preregistered": true },
  "direction": "greater"
}
```

## The 10 compile checks

`compileFec` (`src/fec/compiler.ts:73-82`) runs these 10 checks in order; any `HARD_FAIL` error
blocks the FEC (and thus blocks `CONFIRMED` via R1):

| # | Check | Failure code |
|---|-------|--------------|
| 1 | Non-vacuous measurable implication | `FEC_NOT_COMPILABLE` |
| 2 | Scope bounded (population + window + constraint) | `SCOPE_UNBOUNDED` |
| 3 | Primary metric present | `METRIC_MISSING` |
| 4 | Threshold + direction (comparator) present | `THRESHOLD_MISSING` |
| 5 | Evidence requirements populated | `EVIDENCE_REQUIREMENT_MISSING` |
| 6 | Statistical plan (power declared) | `STAT_PLAN_MISSING` |
| 7 | Multiple-testing correction declared | WARN (`integrityFlags`, not a hard error) |
| 8 | Seed policy declared (fixed vs free) | seed-policy codes |
| 9 | Deterministic freezer (not LLM-edited) | `LLM_FROZEN` |
| 10 | No harking (revision after result) | `HARKING_REVISION_AFTER_RESULT` |

## fecHash — the tamper anchor

Once compiled, the FEC is hashed: `fecHash = sha256(canonical JSON of the verified-contract fields)`.
This hash is written into the proof envelope and covered by `proofHash`. Editing the FEC after compile
→ `fecHash` changes → detected by `far verify`. See [far-proof.md](far-proof.md).

## The R1 gate (fail-closed)

The kernel rule `R1_FEC_NOT_COMPILABLE` is wired into the verdict path: a claim whose FEC fails to
compile, or which has no FEC at all, is forced to `UNTESTED` — it can **never** be `CONFIRMED`. This
is enforced in production at `src/fec/orchestrator.ts` (`fecAppendClaim`), not just in tests.

## Related commands

```bash
far init <domain> --out <dir>             # scaffold a claim + FEC template
far fec compile --claim <path> --out <p>  # compile (runs the 10 checks; exit 7 on HARD_FAIL)
far fec freeze  --claim <path> --out <p>  # compile + freeze + hash (tamper-verifiable)
far verify --bundle <dir>                 # recompute fecHash as part of bundle verification
```

## Boundaries (honest)

- A compilable FEC is **necessary**, not sufficient. It guarantees the plan is non-vacuous and frozen;
  it does not guarantee the **evidence** is honest — that is the anti-theater layer's job (see
  [anti-theater.md](anti-theater.md)).
- `allowSynthetic: true` is permitted for development fixtures, but synthetic-data claims are scoped
  down (the kernel narrows scope rather than confirming on synthetic evidence).

See also: [claim.md](claim.md) · [verdict.md](verdict.md) · [far-proof.md](far-proof.md)
