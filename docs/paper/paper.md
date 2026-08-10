---
title: 'FAR-Lab: Falsification-Anchored Research Chain — a claim-level verification layer for AI for Science'
tags:
  - AI for Science
  - reproducibility
  - verification
  - falsification
  - evidence chain
authors:
  - name: Richard Yuan
    orcid: 0000-0000-0000-0000
    affiliation: 1
affiliations:
  - name: Independent
    index: 1
date: 2026-08-10
bibliography: paper.bib
---

# Summary

FAR-Lab is a claim-level verification layer for AI-generated scientific assertions. Its core
thesis: LLMs hallucinate; science requires reproducibility; trust needs third-party verification.
FAR-Lab answers one question deterministically — *does the evidence support this claim?* — with a
five-value verdict (CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED) produced by a
deterministic rule kernel (stages R0–R9) that contains **no LLM arbiter**. Evidence is chained in a
content-addressed, append-only ledger (Merkle root + hash chain) with five classes of tamper
detection, and verification is portable: an exported `.far-proof` package (RO-Crate / PROV-O
annotated) can be re-verified by any third party.

# Statement of need

Three failure modes motivate this work: (1) LLM-generated scientific claims enter literature
without a falsification mechanism; (2) provenance is non-repudiable when stored by the claim's
producer (a self-serving store is a trust boundary); (3) verification is not reproducible when it
depends on an opaque model judgment. Existing tools address adjacent problems: MLflow/W&B/DVC
track experiment runs; PROV-O/RO-Crate standardize provenance containers; Sakana AI's AI Scientist
auto-generates research. None provides a *deterministic, evidence-to-claim verdict kernel* that a
third party can re-run byte-identically. FAR-Lab fills this gap with an offline-first CLI (25
commands), a local API, and a tamper-detectable portable verification package.

# State of the field

| Aspect | MLflow/W&B/DVC | PROV-O / RO-Crate | Sakana AI Scientist | FAR-Lab |
|--------|---------------|-------------------|--------------------|---------|
| Claim-level verdict | no | no | no | **yes** (5-value kernel) |
| Deterministic (no LLM arbiter) | n/a | n/a | no (LLM-generated) | **yes** (R0–R9) |
| Tamper-detectable chain | no | provenance only | no | **yes** (Merkle + hash chain) |
| Portable third-party re-verification | no | container only | no | **yes** (.far-proof) |
| Offline-first | partial | n/a | no | **yes** |

# Software design

- **Deterministic verdict kernel**: stages R0–R9 evaluate evidence sufficiency, scope, conflict,
  and degradations without any model call (`no_llm_final_judge_scan` enforces this in CI).
- **Evidence chain**: content-addressed, append-only call_records; canonical JSON (RFC 8785 JCS);
  cross-language byte-identical hashing (TypeScript/Node vs Python verified).
- **Anti-theater**: 23 statistical fraud detectors + zero-tolerance scan gate.
- **Portable verification**: `.far-proof` package export → re-verify → tamper-detect
  (sha256 manifest + integrity check).
- 33 design documents in `docs/design/`; architecture and boundaries in `docs/INDEX.md`.

# Research impact statement

**Status: pending real users (HYP-001 OPEN — "solves a technically elegant nonproblem" until
user interviews are conducted).** The impact claim we aim to substantiate: AI4S workflows that
adopt third-party deterministic verification convert AI-generated hypotheses from unverifiable
assertions into falsifiable artifacts. Benchmarks: 30 problems / 28 scientific domains with
deterministic golden verdicts (14/14 golden vectors, byte-identical across runs).

# AI usage disclosure

**Honest statement (per JOSS AI Usage Policy 2026):** All code in this repository (195/195
commits) was written by AI coding agents (Claude Code AI); the human author is responsible for
design decisions, requirements, and release acceptance. Human line-by-line review of every commit
is **not yet established** (recorded as CG2-G4 in the audit). Until per-commit human review is in
place, this disclosure is intentionally conservative: the repository does not claim
"AI-assisted with human review"; it claims "AI-written, human-directed". The deterministic test
suite (2667 tests) independently validates behavior.

# cannotProve (honesty boundary)

This software does **not** prove claims are true; it proves *whether submitted evidence supports a
claim* under a deterministic rule set. It cannot detect all fabricated evidence, cannot prevent
malicious self-verification by a claim producer who controls the evidence chain, and does not
substitute for domain-expert review (see docs/concepts/research-integrity.md).

# Acknowledgements

Richard Yuan (design, requirements, acceptance). AI coding agents (Claude Code AI) wrote the
implementation under human direction — see AI usage disclosure.

# Author contributions (CRediT)

- **Richard Yuan**: Conceptualization, Methodology, Project administration, Supervision, Validation,
  Writing – review & editing
- **AI coding agents (Claude Code AI)**: Software, Writing – original draft, Data curation
  (per JOSS AI Usage Policy 2026 — AI used as implementation assistant; human author
  responsible for design decisions, requirements, acceptance, release)

Honest note: per-commit human line-by-line review not yet established
(see research-integrity.md §5).
