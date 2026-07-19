# Example: TESS Offline Demo (`C-ASTRO-0001`)

> A **fully offline, zero API key, zero network download** verifiable demo.
> Demonstrates the three core values of FAR-Chain: **deterministic five-value verdict kernel**,
> **content-addressed evidence chain**, and **tamper detection**.

This demo's claim (`C-ASTRO-0001`) is an astronomy benchmark claim. The verdict is produced by the
deterministic R0–R9 kernel; **the LLM does not participate in the verdict**. Real TESS live-data
download (`lightkurve`/`astroquery`) is on the P1-6 roadmap (`NEEDS_REAL_ENV`); this demo makes no
external calls.

---

## 1. One-line run

```bash
far demo tess-offline                                       # live demo (14 GV + this claim's verdict)
far verify examples/tess-offline/output/demo.far-proof     # third-party independent recomputation of the persisted bundle
```

`far demo tess-offline` re-runs the verdict kernel live each time; `output/demo.far-proof/` is a
**pre-exported, independently recomputable** persisted evidence bundle (committed, for offline
`far verify` review).

---

## 2. Claim

| Field | Value |
|-------|-------|
| claimId | `C-ASTRO-0001` |
| claimText | adapter A achieves macro-F1 >= 0.80 on TESS-ASTRO benchmark |
| metric | `macro_f1` |
| threshold | `0.80` (semantics: `gt`) |
| sourceAnchor | `tess_astro/adapter_a.py:42` |

To be accepted, a claim **must carry an executable falsification spec** (falsificationSpec): what it
predicts, which metric measures it, the threshold and comparison direction. A claim without one is
rejected at the gate.

---

## 3. Evidence

| Field | Value |
|-------|-------|
| observedMetricValue | `0.62` |
| conflicting_evidence_count | 0 |
| evidence_id | `01KX0M2P5A17FRWTX0C3FPGH55` |

Evidence is stored SHA-256 content-addressed; append-only triggers prevent tampering. Evidence nodes
carry `current_hash` / `prev_hash`, forming a hash chain.

---

## 4. Verdict

| Field | Value |
|-------|-------|
| machineVerdict | **`UNTESTED`** |
| untestedReason | `NO_DECISION_PATH` |
| decisiveRuleId | — (the R6 decision path did not fire) |

**Why UNTESTED and not REFUTED?** The observed value `0.62 < 0.80` threshold looks like it should be
REFUTED. But this demo takes the **legacy path**: it injects no `StatisticalResult` → the R6 decision
path does not fire → the kernel **fail-closed** returns `UNTESTED`, **never** producing a conclusion
whose decision path was not fully walked just because it "looks like REFUTED".

This is the honest design of the five-value verdict: when evidence is insufficient or a decision path
is incomplete, it degrades to `UNTESTED` rather than fabricating a `CONFIRMED`/`REFUTED`.

> Contrast: the full `far demo` Phase 3 (`C-MMLU-A-0001`) injects real statistics (`oneSampleZTest`),
> R7 fires, and the kernel can reach `CONFIRMED` (then sealed via an ASK-9 degradation). The two
> together show how "inject statistics vs. not" affects verdict reachability.

The five-value enum is fixed: `CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`
(priority `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`; a sixth value is forbidden).

---

## 5. `.far-proof` bundle structure (`output/demo.far-proof/`)

`far export far-proof --demo-chain` produces a V1 self-verifiable offline bundle (10 files):

| File | Purpose |
|------|---------|
| `claim_graph.json` | claim + evidence nodes (with hash chain) |
| `proof_envelopes.jsonl` | sealed verdict (covered by proofHash) |
| `call_records.redacted.jsonl` | LLM call records (redacted) |
| `repro_runs.jsonl` | recomputation run records |
| `data_manifest.json` | data fingerprint manifest |
| `ro-crate-metadata.json` | RO-Crate metadata (standard provenance) |
| `prov.ttl` | PROV-O RDF provenance |
| `otel-trace.jsonl` | OpenTelemetry trace |
| `code/MANIFEST.md` | code manifest |
| `README_REPLAY.md` | replay instructions |

**Honesty boundary**: V1 is a self-verifiable bundle (proofHash + redacted chain + third-party node
recomputation); it is **not** a certificate issued by an external RO-Crate/PROV-O certification authority.

---

## 6. verify output (clean · untampered)

```
far verify examples/tess-offline/output/demo.far-proof

  status               : WARN          ← WARN not PASS: the python/browser recompute axes are not-run (env-dependent); the node axis passes
  tamperStatus         : clean         ← no tampering detected
  recomputation.node   : pass          ← third-party independent proofHash recomputation passed
  recomputation.python : not-run       ← needs Python + sympy (pip install -e .)
  recomputation.browser: not-run       ← Phase 2 / #13 not yet wired
  verifiedLevels       : bundle, chain, proofEnvelope
  exit: 0
```

`status: WARN` is honest: the node recompute axis `pass` + `tamperStatus: clean` already proves core
integrity; the python/browser axes skip per environment capability — **no faked pass**.

---

## 7. Tamper Detection (reproducible)

Tamper with **anything in the bundle covered by proofHash** and `far verify` detects it instantly and
FAILs. The following is tested:

```bash
# Copy a tamper target (do not touch the original fixture)
cp -r examples/tess-offline/output/demo.far-proof /tmp/tampered

# Tamper: change the sealed verdict from UNTESTED to CONFIRMED
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl

# Verify → tampering detected instantly
far verify /tmp/tampered
#   status               : FAIL
#   tamperStatus         : tampered
#   recomputation.node   : fail        ← recomputed proofHash no longer matches the file content
#   exit: 7

rm -rf /tmp/tampered
```

Mechanism: `proofHash` is a SHA-256 over canonical JSON. Any byte-level change → recomputed hash ≠
stored hash → `tampered` / exit 7. This is the fail-closed red line: **a tampered proof can never
pass verification**.

---

## 8. Honesty boundary

- This demo's verdict (`UNTESTED`) is produced by an **offline fixture**; it is **not a real scientific verdict**.
- The metric_value `0.62` is a demo fixture value, **not** a real TESS benchmark recomputation result.
- Real TESS live download / real metric recomputation / real GPU are on the roadmap
  (`NEEDS_REAL_ENV` / `NEEDS_GPU_VALIDATION`); this demo does **not** trigger them.
- This demo demonstrates **evidence-chain engineering integrity + deterministic verdict kernel +
  tamper-evident sealing** — it is **not** "proving a scientific conclusion true".

---

## Related

- Concepts: [`docs/concepts/far-proof.md`](../../docs/concepts/far-proof.md), [`docs/concepts/evidence-ledger.md`](../../docs/concepts/evidence-ledger.md)
- Full demo (incl. MMLU hero): `far demo`
- Export a new bundle: `far export far-proof --demo-chain --out <dir>`
