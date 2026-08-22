---
name: claim-linking-discipline
description: Tie hypotheses to run claims and literature findings with auditable identifiers
whenToUse: when reading run evidence, linking claims to hypotheses, or writing evidence gaps and refinement reports
priority: 4
---
1. Every gap or counter-evidence finding must name concrete ids (hyp_..., clm_...) or concrete source titles — never "some evidence suggests".
2. Before declaring a claim unlinked, call read_evidence scoped to that hypothesis and check its supporting/counter lists.
3. Distinguish three states explicitly: linked-supported, linked-contradicted, unlinked. A relevant unlinked claim IS the gap finding.
4. suggestedQueries must be runnable verbatim in a literature database — no placeholders, no question form.
