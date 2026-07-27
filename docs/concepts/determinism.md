# Concept: Determinism (The LLM Is Not the Arbiter)

> FAR-Lab uses LLMs to **generate** hypotheses and evidence, **never** to **decide** the verdict.
> The verdict is produced by a deterministic R0–R9 kernel — pure code, no model call, recomputable to
> the byte. This is a project red line.

## Why deterministic?

An LLM verdict has three incurable problems for a verification layer:

1. **Non-reproducible.** A model call is stochastic; two runs give different answers. A third party
   cannot recompute it.
2. **Opaque.** The "reason" for a model verdict is a generated paragraph, not an auditable rule trace.
3. **Arbitrable by the arbiter.** Whoever controls the model controls the verdict — a verification
   layer must not outsource its decision to a party with its own incentives.

A deterministic kernel fixes all three: same input → same verdict, a machine-checkable `ruleTrace`, and
no external party in the loop. The tradeoff is that the kernel is only as good as its rules — so the
rules are few, fixed, and each maps to a named scientific failure mode (see [verdict.md](verdict.md)).

## Where the LLM sits

```
LLM (generate)                          Kernel (decide)
─────────────────                       ─────────────────
hypothesis text      ─┐                 R0–R9 pure code
evidence proposals   ─┼─►  evidence  ─►  decisiveRuleId
report drafts        ─┘     ledger       reasonCodes
                                          │
                                          ▼
                            five-value verdict (fixed)
```

The LLM proposes; the ledger records; the kernel decides. An LLM (or human) attempting to override the
verdict is caught by the `AT-JUDGE-OVERRIDE` anti-theater detector and forced to `UNTESTED`.

## Sources cannot self-fill

This determinism extends to provenance. An LLM-asserted evidence anchor is flagged `forged` and its
`provenance` forced to **null** unless the harness **independently re-derives** the value (hash
recompute, real statistics). An LLM may never self-attest a measurement — see [evidence.md](evidence.md).
A claim that carries a verifiable identifier (DOI / arXiv) with no harness-verified source is
`REFUTED` by `R_IDENTIFIER_FABRICATION`.

## Independent recomputation

Because the verdict is deterministic, it is **independently recomputable**:

- **Node axis** — the TS kernel (`src/falsifiability/verdict_kernel_v2.ts`).
- **Python axis** — a byte-identical mirror (`repro/far_chain_repro/`) for canonical hashing and proof
  hashing.
- **Browser axis** — a Web-Crypto verifier (`frontend/public`) that recomputes hashes with no backend.

`far verify-golden --cross-lang` adjudicates the 14 golden vectors across all three axes and asserts
they agree — the same input yields the same verdict in TS, Python, and the browser. See
[verdict.md](verdict.md).

## What this is **not**

- ❌ It is **not** "the LLM is useless". The LLM is essential for hypothesis generation and evidence
  gathering — the part humans are bad at scale. It is only excluded from the **decision**.
- ❌ It is **not** "the kernel proves scientific truth". The kernel decides whether the *submitted
  evidence* clears the *declared* bar, deterministically. It does not adjudicate nature.
- ❌ It is **not** immune to bad input. A fabricated evidence row passes a correct kernel — which is
  why the content-addressed ledger and the 20 anti-theater detectors exist (see
  [anti-theater.md](anti-theater.md)).

See also: [verdict.md](verdict.md) · [evidence.md](evidence.md) · [anti-theater.md](anti-theater.md)
