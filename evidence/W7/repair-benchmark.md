# W7-F1 repair-layer benchmark (deterministic, before/after same corpus)

BEFORE = pre-W7 extractJsonText (direct -> fence-strip -> legacy quote scan; verbatim http.ts@3186e1c).
AFTER = current chain (… -> legacy scan -> jsonrepair engine EXTRACT).

| suite | n | before | after |
|---|---|---|---|
| corpus: valid docs pass through | 6 | 6 | 6 |
| corpus: corrupted docs repaired | 75 | 12 | 75 |
| fuzz: live-class inner-quote docs repaired | 192 | 192 | 192 (exact-intent 192) |

- fuzz afterExactIntent = repaired value equals the corrupted document's evident intent (quote kept as content), not just parses.
- live 24k sample (colon-after-inner-quote ambiguity): before=false, after=false — both correctly refuse; corrective re-ask owns that class (0d1706e ~99% cumulative recovery).
- latency (worst case, both repair layers attempt + fail on 24k): before 1.1ms after 1.55ms per call — negligible vs the 2s strict-FC e2e budget; mid-doc successful repair 0.011ms/call.

Raw: evidence/W7/repair-benchmark.json; corpus spikes/json-repair-corpus.mjs -> spikes/output/json-repair-oracle.json; fuzz class spikes/json-repair-fuzz.mjs.
