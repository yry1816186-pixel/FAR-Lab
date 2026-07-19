# Examples

Runnable, self-verifiable examples that exercise the `far` CLI end-to-end. All run **offline with zero
API keys**.

| Example | What it shows | Run |
|---------|---------------|-----|
| [`tess-offline/`](tess-offline/README.md) | An astronomy benchmark claim (`C-ASTRO-0001`) through FEC → deterministic verdict → fail-closed sealing, plus a tested tamper-detection walkthrough | `far demo tess-offline` · `far verify tess-offline/output/demo.far-proof` |
| [`fec/`](fec/README.md) | A valid FecContractV2 you can compile and freeze-check | `far fec compile --claim fec/sample_fec_contract.json --out compiled.json` · `far fec freeze --fec compiled.json` |
| [`statistical-claim/`](statistical-claim/README.md) | A pre-registered falsifiable statistical claim (one-sample t-test, α = 0.05) — the `statisticalPlan` the R6/R7 kernel paths consume | template + workflow in its README |

## Verdict values

Every example verdict is one of the fixed five values, produced by the deterministic R0–R9 kernel
(never an LLM): `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`.

## Honesty

Demo verdicts come from **offline fixtures**, not real scientific adjudication. See each example's
"Honesty boundary" section and [docs/demos/tess-offline.md](../docs/demos/tess-offline.md).
