# Real-World Science Integrity Cases — FAR-Lab Detection Showcase

> This document maps famous real-world science reproducibility failures to FAR-Lab's
> deterministic detection mechanisms. Each case is a published, verifiable event —
> not a synthetic scenario.

## Why these cases matter

Science has a reproducibility crisis. The Open Science Collaboration (2015) found
that only **36% of 100 published psychology studies** could be replicated. FAR-Lab's
deterministic rule kernel can detect the statistical fingerprints of these failures —
**without trusting any LLM to judge**.

---

## Case 1: Bem (2011) — Precognition (p-hacking detection)

**Paper**: Bem, D.J. (2011). "Feeling the future: Experimental evidence for anomalous
retroactive influences on cognition and affect." *Journal of Personality and Social Psychology*.

**Claim**: Humans can perceive future events (precognition), p < .05 across 9 experiments.

**What went wrong**: Extensive p-hacking — running many analyses and reporting only
significant ones. Follow-up studies (Rouder & Morey, 2011; Wagenmakers et al., 2011)
failed to replicate using Bayesian analysis.

**FAR-Lab detection**:

| Mechanism | Rule | What it catches |
|---|---|---|
| `optional_stopping` detector | R3 CRITICAL_PROTOCOL_DEVIATION | Data peeking: stopping data collection when p < .05 |
| `phack_alpha` detector | R3 CRITICAL_PROTOCOL_DEVIATION | Post-hoc alpha adjustment without pre-registration |
| `phack_correction` detector | R3 CRITICAL_PROTOCOL_DEVIATION | Missing multiple-comparison correction across 9 experiments |
| FEC `preregistrationHash` | R1/R2 gate | No pre-registered hypothesis → FEC unsealable → UNTESTED |
| `seed_cherry` detector | p_hacking_risk integrity flag | Cherry-picked random seeds across 9 experiments |

**Predicted FAR-Lab verdict**: **UNTESTED** (no valid FEC — hypothesis not pre-registered) →
if forced through with post-hoc data: **R3 CRITICAL_PROTOCOL_DEVIATION** → UNTESTED

**Evidence**: Bem's own data, when re-analyzed with proper multiple-comparison correction
(Bonferroni α/9 = .0056), shows no significant precognition effect.

---

## Case 2: Open Science Collaboration (2015) — Reproducibility Project

**Paper**: Open Science Collaboration. (2015). "Estimating the reproducibility of
psychological science." *Science*, 349(6251), aac4716.

**Finding**: Of 100 published psychology studies, only 36% had statistically significant
replication results. Mean effect size in replications was half the original.

**FAR-Lab's role**: This is the meta-problem FAR-Lab solves. For each original study:

1. **FEC gate**: Was the hypothesis pre-registered? (Most were not → UNTESTED)
2. **Effect size verification**: Original effectSize vs replication effectSize
3. **`executionFingerprintMismatch`**: Resource profile divergence >10x → DEGRADED_SCOPE
4. **Power analysis**: Original studies often underpowered (R8 INSUFFICIENT_POWER)

**Predicted distribution across 100 studies**:
- ~40% → UNTESTED (no pre-registration, FEC unsealable)
- ~25% → INCONCLUSIVE (insufficient power / contradictory evidence)
- ~15% → DEGRADED_SCOPE (scope mismatch: original effect doesn't generalize)
- ~10% → REFUTED (replication evidence refutes original claim)
- ~10% → CONFIRMED (would pass all gates — the reproducible minority)

---

## Case 3: LK-99 (2023) — Room-Temperature Superconductor

**Event**: Lee et al. (July 2023) claimed LK-99 is a room-temperature ambient-pressure
superconductor. Within weeks, multiple independent labs (NLAE, Princeton, Max Planck)
could not reproduce the results.

**What went wrong**:
1. No pre-registered experimental protocol
2. No independent replication before public claim
3. Contamination artifacts mistaken for superconductivity
4. Identifier claims (DOI/arXiv) published before peer review

**FAR-Lab detection**:

| Mechanism | Rule | What it catches |
|---|---|---|
| `identifierClaims` check | R_IDENTIFIER_FABRICATION | arXiv preprint ≠ peer-reviewed source |
| FEC `scopeCoverage` | R4 SCOPE_MISMATCH_NONCRITICAL | Single-sample claim generalized to material class |
| `report_mismatch` detector | ANTI_THEATER_FAIL | Published figures don't match raw data (measured vs reported) |
| `data_hash_fake` detector | ANTI_THEATER_FAIL | Fabricated data hashes (no content-addressed source) |

**Predicted FAR-Lab verdict**: **UNTESTED** initially (no pre-registration),
then **REFUTED** once independent labs report negative results (R6 PRIMARY_TEST_REFUTES).

---

## Case 4: Theranos (2014-2018) — Medical Device Fraud

**Event**: Elizabeth Holmes claimed Edison device could run 200+ blood tests from a
single fingerprick. Investigation revealed the technology never worked; results were
fabricated or produced by commercial analyzers.

**FAR-Lab detection**:

| Mechanism | Rule | What it catches |
|---|---|---|
| `provenance_unbound` detector | ANTI_THEATER_FAIL | Results claimed but no verifiable data provenance |
| `missing_raw` detector | ANTI_THEATER_FAIL | No raw measurement data — only final numbers |
| `judge_override` detector | ANTI_THEATER_FAIL | Human override of validation checks |
| `report_mismatch` detector | ANTI_THEATER_FAIL | Reported accuracy ≠ measured accuracy |

**Predicted FAR-Lab verdict**: **ANTI_THEATER_FAIL** → UNTESTED (no raw data, no
verifiable provenance — the system refuse to seal a verdict without evidence)

---

## How FAR-Lab's 22 Detectors Map to Real Fraud Patterns

```
Scientific fraud pattern          →  FAR-Lab detector              →  Verdict effect

p-hacking (optional stopping)     →  optional_stopping             →  R3 → UNTESTED
post-hoc alpha adjustment         →  phack_alpha                   →  R3 → UNTESTED
missing multiple-comparison corr  →  phack_correction              →  R3 → UNTESTED
HARKing (post-hoc hypothesis)     →  hark                          →  R3 → UNTESTED
seed cherry-picking               →  seed_cherry                   →  p_hacking_risk → blocks R7
metric swapping                   →  metric_swap                   →  R3 → UNTESTED
scope laundering                  →  scope_launder                 →  R4 → DEGRADED_SCOPE
fake degraded results             →  fake_degraded                 →  ANTI_THEATER_FAIL
fabricated data hashes            →  data_hash_fake                →  ANTI_THEATER_FAIL
missing raw data                  →  missing_raw                   →  ANTI_THEATER_FAIL
report-data mismatch              →  report_mismatch               →  ANTI_THEATER_FAIL
LLM judge override                →  judge_override                →  ANTI_THEATER_FAIL
overfitting to benchmark          →  overfit                       →  ANTI_THEATER_WARN
dataset drift                     →  dataset_drift                 →  R4 → DEGRADED_SCOPE
dependency float drift            →  dep_float_drift               →  ANTI_THEATER_WARN
label-only leakage                →  label_only                    →  ANTI_THEATER_FAIL
post-hoc threshold tuning         →  posthoc_threshold             →  R3 → UNTESTED
stopping rule violation           →  stopping_rule                 →  R3 → UNTESTED
unbound provenance                →  provenance_unbound             →  ANTI_THEATER_FAIL
workflow digest mismatch          →  workflow_digest               →  ANTI_THEATER_FAIL
fake pass (detector suppression)  →  fake_pass                     →  ANTI_THEATER_FAIL
```

---

## Honest Boundaries

FAR-Lab **cannot**:
- Detect fraud in unpublished data (it only sees what enters the FEC)
- Prove a claim is scientifically true (only contract consistency)
- Replace peer review (it's a tool, not a reviewer)
- Detect novel fraud patterns not in the 22-detector corpus
- Verify claims without raw data (garbage in → UNTESTED out)

What it **can** do:
- Mathematically guarantee that sealed evidence has not been tampered with
- Deterministically flag 22 known statistical fraud patterns
- Force hypothesis pre-registration before evidence collection
- Enable independent recomputation via portable `.far-proof` bundles

---

## References

1. Bem, D.J. (2011). *J. Pers. Soc. Psychol.*, 100(3), 407-425.
2. Open Science Collaboration. (2015). *Science*, 349(6251), aac4716.
3. Lee, S. et al. (2023). arXiv:2307.12008 (LK-99 preprint, later refuted).
4. Carreyrou, J. (2018). *Bad Blood* (Theranos investigation).
5. Simmons, J.P. et al. (2011). *Psychol. Sci.*, 22(11), 1359-1366 (p-hacking methodology).
