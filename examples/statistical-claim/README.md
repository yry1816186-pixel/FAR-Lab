# Example: Statistical claim (`C-STAT-0001`)

> A **template** for a pre-registered, falsifiable statistical claim with a deterministic decision path.
> Shows how a p-value / effect-size / CI claim is structured so the deterministic R0–R9 kernel can
> adjudicate it — with **no hand-filled statistics** (RR-1 red line).

Unlike the TESS demo (a single metric threshold), a statistical claim drives the R6/R7 decision paths
of the kernel: it carries a `statisticalPlan` (test family, null/alternative, alpha, effect direction)
that a real `StatisticalResult` is checked against.

## Files

| File | Description |
|------|-------------|
| `claim.json` | The human-readable claim: "Drug X reduces systolic BP by ≥ 5 mmHg vs placebo" with its falsificationSpec + statisticalPlan |

## The claim

- **claimText**: Drug X reduces systolic blood pressure by ≥ 5 mmHg vs placebo (one-sample t-test on
  paired deltas; H0: mean_effect ≤ 0; α = 0.05, one-sided).
- **falsificationSpec**: metric `mean_sbp_reduction_mmhg`, threshold `5`, semantics `gt`.
- **statisticalPlan**: one-sample t-test, H0 ≤ 0, H1 > 0, α = 0.05.

A claim is accepted only if it carries an executable falsification spec AND a complete statistical
plan; otherwise the compile check fails (e.g. `STAT_PLAN_MISSING`) and the kernel cannot seal a
verdict.

## Workflow

```bash
# 1. Scaffold a DomainPack and copy this claim's spec into it
far init statdemo --out ./statdemo
#   then edit ./statdemo/claim.template.json + fec.template.json to match claim.json

# 2. Compile the FEC: runs the 10 compilation checks + recomputes fecHash
far fec compile --claim ./statdemo/fec.template.json --out ./statdemo/compiled.json

# 3. Freeze-check the compiled FEC
far fec freeze --fec ./statdemo/compiled.json

# 4. Run the agent loop against a question built from this claim (offline_replay by default)
far ask "Does Drug X reduce systolic BP by >= 5 mmHg vs placebo?" --profile offline_replay
```

## Honesty boundary

- This is a **template**, not a sealed verdict. The kernel reaches `CONFIRMED`/`REFUTED` for a
  statistical claim only when a real `StatisticalResult` (recomputed by code — e.g. `oneSampleZTest`
  / t-test) is injected through the agent loop and matches the pre-registered plan.
- **No p-value or effect size is ever hand-filled** (RR-1 red line): the statistic is recomputed from
  the raw data deterministically, and any mismatch fails closed.
- Under `offline_replay`, the loop replays fixtures, so the verdict reflects the fixture, not a real
  clinical trial. Real inference needs `--profile competition_aliyun_qwen` + credentials, and real
  data needs a sandbox run (`NEEDS_REAL_ENV`).

## Related

- FEC contract schema: `src/fec/fec_contract.ts` · [../fec/README.md](../fec/README.md)
- Concepts: [`docs/concepts/evidence-ledger.md`](../../docs/concepts/evidence-ledger.md)
- Deterministic verdict kernel rules: `src/falsifiability/verdict_kernel_v2.ts` (R0–R9)
