# Demo: TESS Offline

> Fully offline, zero API keys, zero network downloads. Demonstrates the deterministic verdict kernel
> + content-addressed evidence chain + tamper detection.

This demo's claim `C-ASTRO-0001` is a falsifiable astronomy claim (TESS-ASTRO benchmark). The verdict
is produced by the deterministic R0–R9 kernel; the LLM is not involved.

## Run

```bash
far demo tess-offline                                       # live demo (14 GV + this claim's verdict)
far verify examples/tess-offline/output/demo.far-proof     # verify the persisted bundle
```

## What you will see

1. **14 Golden Vectors** through the real R0–R9 rule tree (every path of the five-value verdict)
2. **End-to-end demo claim** (`C-ASTRO-0001`):
   - claim: adapter A reaches macro-F1 ≥ 0.80 on TESS-ASTRO
   - falsification spec: metric=`macro_f1`, threshold=0.80, `gt`
   - observed value: 0.62
   - FEC orchestration → kernel verdict → fail-closed sealing
   - **verdict = `UNTESTED`** (reason: `NO_DECISION_PATH`)

## Why is the verdict UNTESTED?

The observation `0.62 < 0.80` threshold looks like it should be REFUTED. But this demo takes the
**legacy path**: it injects no `StatisticalResult` → the R6 decision path does not fire → the kernel
**fail-closed** returns `UNTESTED`, never producing a conclusion whose decision path was not fully
walked just because it "looks like REFUTED".

This shows the honest design of the five-value verdict: when evidence is insufficient or a decision
path is incomplete, it degrades to `UNTESTED` rather than fabricating a `CONFIRMED`/`REFUTED`.

> Contrast: the full `far demo` Phase 3 (`C-MMLU-A-0001`) injects real statistics (`oneSampleZTest`),
> R7 fires, and the kernel can reach `CONFIRMED` (then sealed via an ASK-9 degradation). The two
> together show how "inject statistics vs. not" affects verdict reachability.

## Tamper detection (reproducible)

```bash
cp -r examples/tess-offline/output/demo.far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
far verify /tmp/tampered
#   status: FAIL · tamperStatus: tampered · recomputation.node: fail · exit 7
rm -rf /tmp/tampered
```

## Honesty boundary

- The verdict (`UNTESTED`) is produced by an **offline fixture**; it is **not a real scientific verdict**.
- The metric_value `0.62` is a fixture value, **not** a real TESS benchmark recomputation result.
- Real TESS live download (lightkurve/astroquery) / real metric recomputation / real GPU are on the
  roadmap (`NEEDS_REAL_ENV` / `NEEDS_GPU_VALIDATION`); this demo does not trigger them.
- This demo shows "evidence-chain engineering integrity + deterministic verdict kernel + tamper-evident
  sealing" — it is **not** "proving a scientific conclusion true".

## Details

Full structure and per-file notes: [examples/tess-offline/README.md](../../examples/tess-offline/README.md).
