# Concept: Verdict

> A **verdict** is one of **five** values, produced by a **deterministic** rule set (R0–R9) — **not**
> by an LLM. The fixed enumeration and its priority are a project red line: there is no sixth value,
> and an LLM never casts the final verdict.

## The five values (fixed)

| Value | Meaning | When it fires |
|-------|---------|---------------|
| `CONFIRMED` | The primary test clears the falsification threshold, with sufficient evidence | `R7_PRIMARY_TEST_CONFIRMS` |
| `REFUTED` | The primary test contradicts the claim, or the claim fabricates an identifier | `R6_PRIMARY_TEST_REFUTES` · `R_IDENTIFIER_FABRICATION` |
| `INCONCLUSIVE` | Evidence is contradictory, or statistically underpowered / null | `R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE` · `R8_INSUFFICIENT_POWER_OR_NULL` |
| `DEGRADED_SCOPE` | The verified scope is narrower than the claim asserts (honest narrowing, not confirmation) | `R4_SCOPE_MISMATCH_NONCRITICAL` · `R_CAUSAL_CONFOUNDING_FAIL` · `R_EXECUTION_FINGERPRINT_MISMATCH` · `R_DERIVATION_FORM_MISMATCH` |
| `UNTESTED` | No verdictable evidence reached the kernel, or a critical protocol deviation / anti-theater failure occurred | `R3_CRITICAL_PROTOCOL_DEVIATION` · `R9_ALL_TESTS_SKIPPED` · `ANTI_THEATER_FAIL` |

## Priority (decisive rule wins)

When multiple rules fire, the **decisive** rule is the highest-priority one. Priority order:

```
DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED
```

So a claim with both a passing primary test (`CONFIRMED`) and a narrower-than-asserted scope
(`DEGRADED_SCOPE`) is reported as `DEGRADED_SCOPE` — it is **never** silently upgraded to `CONFIRMED`.
This is the fail-closed posture: bad news always wins.

## The deterministic kernel (R0–R9)

The verdict is computed by `decideFiveValueVerdict` (`src/falsifiability/verdict_kernel_v2.ts`). It
walks the rules in priority order; the first matching rule fixes the verdict and emits a
`decisiveRuleId` + `reasonCodes` + `ruleTrace`. The rules (verified):

| Rule | Effect |
|------|--------|
| `R0_SCHEMA_INVALID` | Malformed input → UNTESTED |
| `R1_FEC_NOT_COMPILABLE` | Missing/vacuous FEC → UNTESTED |
| `R2_NO_VALID_DATASET_BINDING` | No resolved dataset anchor → UNTESTED |
| `R3_CRITICAL_PROTOCOL_DEVIATION` | Critical protocol breach → UNTESTED |
| `R4_SCOPE_MISMATCH_NONCRITICAL` | Verified scope < claimed scope → DEGRADED_SCOPE |
| `R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE` | Significant evidence on both sides → INCONCLUSIVE |
| `R6_PRIMARY_TEST_REFUTES` | Primary metric fails the spec → REFUTED |
| `R7_PRIMARY_TEST_CONFIRMS` | Primary metric clears the spec → CONFIRMED |
| `R8_INSUFFICIENT_POWER_OR_NULL` | Underpowered / null result → INCONCLUSIVE |
| `R9_ALL_TESTS_SKIPPED` | Every test skipped → UNTESTED |

Extended rules (same kernel, same determinism): `R_CAUSAL_CONFOUNDING_FAIL/WARN`,
`R_DERIVATION_FORM_MISMATCH`, `R_EXECUTION_FINGERPRINT_MISMATCH`, `R_IDENTIFIER_FABRICATION`,
`R_IDENTIFIER_RESOLUTION_ENV_FAILURE`, `ANTI_THEATER_FAIL`.

## Why deterministic, not LLM?

The kernel is pure code with no model call. This makes a verdict **independently recomputable**: a
third party runs the same rules on the same evidence and gets the same answer — byte-for-byte. An LLM
verdict is stochastic and opaque; it cannot be recomputed or audited. FAR-Lab uses LLMs to
**generate** hypotheses and evidence, never to **decide** them. See [determinism.md](determinism.md).

## Statistics come from `src/statistics/`, never literals

p-values, effect sizes, and confidence intervals that feed R5–R8 are computed by real math
(`src/statistics/`: z-tests, Cohen's d, Welch's t, Bonferroni/Holm/BH-FDR multiple-correction). They
are **never** hardcoded literals — a verdict built on a hand-typed p-value would be theater.

## See it in action

```bash
far verify-golden --all          # 14 golden vectors through the real R0–R9 kernel
far verify-golden --case GV-07   # INCONCLUSIVE via R8 (insufficient power)
far verify-golden --case GV-09   # UNTESTED via R3 (critical protocol deviation)
```

Each golden vector is a pre-registered (input → expected verdict + decisiveRuleId) pair; recomputing
it exercises the real kernel, not a lookup.

## Boundaries (honest)

- The kernel is deterministic but its **inputs** can be wrong. A fabricated evidence row will pass the
  kernel — which is why the content-addressed ledger and the 22 anti-theater detectors exist (see
  [anti-theater.md](anti-theater.md)).
- `DEGRADED_SCOPE` is an honest narrowing, not a failure: it says "we confirmed X under a strictly
  smaller scope than claimed", not "we failed".

See also: [determinism.md](determinism.md) · [fec.md](fec.md) · [evidence.md](evidence.md) ·
[anti-theater.md](anti-theater.md)
