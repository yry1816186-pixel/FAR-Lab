# FAR-Lab Competitive Analysis

> How FAR-Lab differs from existing AI/ML evaluation and reproducibility tools.

## Executive summary

FAR-Lab occupies a unique position: **deterministic claim-level verification of AI-generated
scientific hypotheses**. No existing tool does this. MLflow/W&B/HF Evaluate track experiments
and compute metrics; FAR-Lab verifies whether the *evidence chain* supports the *claim* using
a deterministic rule kernel — no LLM judgment, no trust required.

---

## Feature comparison matrix

| Capability | FAR-Lab | MLflow | W&B | HF Evaluate | SciSpace | Elicit |
|---|---|---|---|---|---|---|
| **Claim-level verification** | ✅ R0-R9 kernel | ❌ | ❌ | ❌ | ❌ | partial |
| **Deterministic verdict (no LLM)** | ✅ | N/A | N/A | ✅ metrics | ❌ uses LLM | ❌ uses LLM |
| **Statistical fraud detection** | ✅ 22 detectors | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Tamper-evident evidence chain** | ✅ SHA-256 + Merkle | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Portable proof bundle** | ✅ .far-proof | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Independent recomputation** | ✅ export→verify | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Experiment tracking** | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Model evaluation** | partial (benchmark) | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Literature search** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Pre-registration enforcement** | ✅ FEC gate | ❌ | ❌ | ❌ | ❌ | ❌ |
| **p-hacking detection** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cross-language consistency** | ✅ TS/Python/Browser | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Why existing tools don't do what FAR-Lab does

### MLflow / Weights & Biases — experiment tracking, not claim verification

These tools answer: *"What experiments did I run and what were the results?"*
FAR-Lab answers: *"Does the evidence actually support the claim being made?"*

MLflow tracks parameters, metrics, and artifacts. It does not verify whether a claimed
result is statistically sound, whether p-hacking occurred, or whether the evidence chain
has been tampered with. A researcher could log fabricated results to MLflow and it would
happily record them.

**Key gap**: No falsifiability enforcement, no fraud detection, no tamper evidence.

### Hugging Face Evaluate — metric computation, not scientific verification

HF Evaluate computes standard metrics (accuracy, F1, BLEU) on datasets. It's a measurement
tool, not a verification tool. It does not check:
- Whether the metric was pre-registered (FEC)
- Whether multiple comparisons were corrected (Bonferroni)
- Whether the result is replicable (proof bundle)
- Whether the data has been tampered with (hash chain)

**Key gap**: Measures performance but doesn't verify scientific integrity.

### SciSpace / Elicit — AI-powered literature tools, not deterministic verifiers

These use LLMs to search, summarize, and extract information from scientific literature.
They are useful for literature review but:
- They rely on LLM judgment (which can hallucinate)
- They don't verify statistical claims
- They don't detect fraud patterns
- They don't produce portable, tamper-evident proof

**Key gap**: Trust the LLM to judge — exactly what FAR-Lab refuses to do.

---

## FAR-Lab's defensible moat

### 1. Deterministic verdict kernel (R0-R9)

The core innovation: a **fixed-priority rule tree** that produces 5-value verdicts
(CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED) with zero LLM involvement.
The LLM proposes hypotheses; the kernel decides. This separation is the trust boundary.

**Why it's hard to copy**: Each rule encodes deep statistical methodology knowledge.
R3 catches post-hoc alpha adjustment. R6 uses adjusted p-values with effect size gates.
R-causal integrates confounding variable analysis. These aren't trivial to design.

### 2. 22 anti-theater statistical fraud detectors

Each detector catches a specific statistical manipulation pattern:
- `optional_stopping`: data peeking (stopping when p < .05)
- `seed_cherry`: reporting only favorable random seeds
- `phack_correction`: missing multiple-comparison correction
- `metric_swap`: changing metrics post-hoc
- `hark`: hypothesizing after results are known
- ...16 more

**Why it's hard to copy**: Requires deep expertise in research methodology and statistics.

### 3. Content-addressed evidence chain

SHA-256 hash chain + Merkle root. Any tampering is mathematically detectable by
recomputation. Cross-language consistency (TS/Python/Browser produce identical hashes).

**Why it's hard to copy**: The cross-language canonical hash alignment is non-trivial
(UTF-16 code-unit sorting, float serialization, locale independence).

### 4. Portable .far-proof bundle

Export → verify → tamper-detect. A third party can independently recompute the verdict
without trusting the original system. This is the "don't trust, verify" principle applied
to scientific claims.

---

## What FAR-Lab does NOT do (honest boundaries)

- **Not an experiment tracker**: Use MLflow/W&B for that. FAR-Lab verifies claims, not runs.
- **Not a metric library**: Use HF Evaluate for that. FAR-Lab checks integrity, not accuracy.
- **Not a literature tool**: Use SciSpace/Elicit for that. FAR-Lab verifies, doesn't search.
- **Not a peer reviewer**: FAR-Lab is a tool, not a replacement for human judgment.
- **Not a truth oracle**: CONFIRMED ≠ scientifically true. It means "contract-consistent."

FAR-Lab is designed to be **complementary** to existing tools, not a replacement.
A research team would use MLflow to track experiments, HF Evaluate to compute metrics,
and FAR-Lab to verify that their claims are falsifiable, evidence-supported, and
tamper-evident.

---

## 3-year durability assessment

The core thesis rests on three unchanging principles:

1. **LLMs hallucinate** — This won't change even with GPT-6/7. Better models hallucinate
   less, but the risk never reaches zero. Verification remains necessary.

2. **Science requires reproducibility** — This is a foundational principle of the scientific
   method. It has not changed in 400 years and will not change.

3. **Trust requires third-party verification** — This is a foundational principle of human
   society. Peer review exists because self-verification is insufficient.

**Risk**: If AI-generated science becomes regulated (like clinical trials), FAR-Lab's
verification layer becomes infrastructure, not a nice-to-have. This is upside, not risk.
