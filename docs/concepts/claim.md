# Concept: Claim

> A **claim** is a falsifiable scientific statement plus an executable **falsificationSpec**. A claim
> without a falsification spec is rejected at the gate — FAR-Chain never accepts "I observed X" as a
> verdictable scientific claim.

## What it solves

LLM-generated hypotheses tend to be **unfalsifiable** ("the model understands physics") or
**unmeasurable** ("performance improved"). FAR-Chain forces every claim to declare, up front, the
exact metric + threshold + comparator that would refute it. If you cannot state what would prove you
wrong, the claim is not verdictable.

## Structure

A minimal claim (see the template produced by `far init`):

```json
{
  "claimId": "PHYSICS-0001",
  "claimText": "the measurable implication of the hypothesis, in plain language",
  "claimClass": "PHYSICS",
  "falsificationSpec": {
    "prediction": "if X holds, metric Y should exceed threshold T",
    "metric": "Y",
    "thresholdSemantics": "gt",
    "falsificationThreshold": 0.95
  },
  "sourceAnchor": {
    "type": "dataset | paper | model",
    "identifier": "DOI / arXiv id / accession / model name"
  }
}
```

| Field | Meaning |
|-------|---------|
| `falsificationSpec.metric` | The **single** primary measurement that decides the claim |
| `falsificationSpec.thresholdSemantics` | `gt` / `lt` / `range` — how the metric is compared to the threshold |
| `falsificationSpec.falsificationThreshold` | The numeric bar the metric must clear (or fall below) |
| `sourceAnchor` | An external anchor (dataset / paper / model) the claim is tied to; `resolved=false` is a WARN, never silently trusted |
| `claimClass` | A free-form domain tag (e.g. `ASTRO`, `PHYSICS`, `ML`) — drives DomainPack scaffolding, not the verdict |

## claimClass and `far init`

`claimClass` is **not** a fixed enum that changes the verdict — the deterministic kernel treats every
claim identically. It is a domain tag used to scaffold a DomainPack (`far init <domain>`). The verdict
depends only on the evidence and the R0–R9 rules, never on the domain label.

## From claim to verdict

A claim alone produces no verdict. The lifecycle is:

1. **Claim** (this doc) — falsifiable statement + spec.
2. **FEC** — a frozen measurement/statistical plan that operationalizes the falsificationSpec.
   See [fec.md](fec.md).
3. **Evidence** — measurements written into the content-addressed ledger. See
   [evidence.md](evidence.md).
4. **Verdict** — the deterministic R0–R9 kernel adjudicates evidence against the spec. See
   [verdict.md](verdict.md).

## Related commands

```bash
far init <domain> --out <dir>   # scaffold a claim + FEC template for a new domain
far fec compile --claim <path>  # compile a FEC from a claim (HARD_FAIL rejects vacuous specs)
```

## Boundaries (honest)

- A `falsificationSpec` is necessary but not sufficient — a vacuous spec (e.g. a trivial threshold
  anyone clears) is caught by `compileFec` (`R1_FEC_NOT_COMPILABLE`), not by the claim schema.
- `sourceAnchor.identifier` is **not** trusted if the claim author fills it in: a claim that carries a
  verifiable identifier (DOI / arXiv) with no harness-verified source is `REFUTED` by
  `R_IDENTIFIER_FABRICATION`, not silently accepted.

See also: [fec.md](fec.md) · [verdict.md](verdict.md) · [evidence.md](evidence.md)
