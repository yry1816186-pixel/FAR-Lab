# Concept: Anti-Theater (Fake-Green Detection)

> **Anti-theater** is a layer of **20 deterministic detectors** that catch *fake-green* results —
> tests, evidence, or verdicts that **pass without exercising real logic**. A confirmed anti-theater
> finding blocks the seal and forces the verdict to `UNTESTED` (`ANTI_THEATER_FAIL`).

## What it solves

A green test can be theater: a stubbed backend, a hardcoded metric, a cherry-picked seed, a threshold
edited after seeing the result, a scope quietly narrowed to the easy cases. Each of these makes the
verdict look `CONFIRMED` while proving nothing. The anti-theater layer inspects the *provenance and
shape* of the evidence, not just the numbers, and refuses to seal a result built on theater.

## The 20 detectors

Each detector emits a finding (`PASS` / `WARN` / `FAIL`) over an `AntiTheaterLintInput`. A `FAIL`
finding with an otherwise-`CONFIRMED` verdict blocks the seal. The detectors (verified in
`src/anti_theater/detectors/`):

| Detector | Catches |
|----------|---------|
| `AT-FAKE-PASS` | A test that passes without touching real logic |
| `AT-FAKE-DEGRADED` | A verdict artificially downgraded to hide a failure |
| `AT-LABEL-ONLY` | Evidence that is a label/claim, not a measurement |
| `AT-MISSING-RAW` | Claimed raw data absent (only summaries present) |
| `AT-METRIC-SWAP` | The metric measured ≠ the metric declared in the FEC |
| `AT-SCOPE-LAUNDER` | Scope narrowed *after* seeing results to manufacture a pass |
| `AT-SEED-CHERRY` | Seeds cherry-picked so only favorable runs are reported |
| `AT-OPTIONAL-STOPPING` | Data peeking / optional stopping (inflated significance) |
| `AT-STOPPING-RULE` | Stopping rule violated |
| `AT-PHACK-ALPHA` | α threshold manipulated post-hoc |
| `AT-PHACK-CORRECTION` | Multiple-testing correction gamed |
| `AT-POSTHOC-THRESHOLD` | Threshold set after seeing the metric |
| `AT-OVERFIT` | Overfitting signatures (train/test leakage) |
| `AT-DATA-DRIFT` | Evaluation data drifted from the declared dataset |
| `AT-DATA-HASH-FAKE` | Data hash forged / not recomputed |
| `AT-DEP-FLOAT-DRIFT` | Floating-point drift exploited to fake equality |
| `AT-HARK` | HARKing — hypothesis formed after results known |
| `AT-JUDGE-OVERRIDE` | An LLM (or human) attempted to override the deterministic verdict |
| `AT-REPORT-MISMATCH` | Human-readable summary contradicts the structured verdict |
| `AT-WORKFLOW-DIGEST` | Reproduction workflow digest mismatch (claimed ≠ run) |

## How a finding affects the verdict

The 20 detectors are run by `runAntiTheaterLint` (`src/anti_theater/lint.ts`). Findings are projected
into the kernel via `toKernelFindings(...)` at `src/fec/orchestrator.ts`. A `FAIL` finding present
while the verdict would otherwise be `CONFIRMED` triggers `ANTI_THEATER_FAIL` → the verdict is forced
to `UNTESTED` and the seal is blocked. This is the executable red line "the LLM is not the arbiter"
extended to "a green result is not automatically a real result".

## The verifier AST gate (FUSION-OS-5)

Independently, the offline verifier is protected by an **AST structural gate** (`src/anti_theater/lint.ts`):
at load time, a verifier module with a top-level network / IO / LLM call is rejected outright. This
stops a verifier from phoning home or calling a model to manufacture a pass — the verifier itself must
be pure local code.

## Related commands

```bash
far verify --lint-input <path> --envelope <p>   # independently recompute the 20 detectors and
                                                 # compare them in depth with the embedded report;
                                                 # any divergence => FAIL, exit 7
```

The `--lint-input` path is the strongest independent check: it recomputes all 20 detectors from the
raw lint input and asserts they match the report sealed inside the proof envelope — divergence means
the sealed report was tampered with.

## Boundaries (honest)

- The detectors are **deterministic and inspectable**, but they inspect the *shape and provenance* of
  evidence, not its *scientific truth*. A perfectly-shaped but genuinely-wrong measurement can still
  pass the detectors — that is the FEC + statistics + peer-review layer's job.
- `ANTI_THEATER_FAIL` forces `UNTESTED` (fail-closed); it does not invent a `REFUTED`. The system
  refuses to confirm theater; it does not fabricate a refutation.

See also: [verdict.md](verdict.md) · [determinism.md](determinism.md) · [evidence.md](evidence.md) ·
[fec.md](fec.md)
