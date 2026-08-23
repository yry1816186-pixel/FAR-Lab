# Final Blind-Spot Re-Audit (goal §22 item 11, 2026-08-24)

Three adversarial auditors (fusion-result / tree-coverage / cohesion) against
COVERAGE-TREE v1 + the five fusion waves. All findings source-verified.

## Fusion-result auditor (verdict: no fabrications; RU-1 genuinely end-to-end; RU-7 INTEGRATED claim weakened; RU-2 PROV-O history-only-correct)
- P1 lineage_edges has NO live writer post-backfill (recordLineageEdge only in
  forkRun) → PROV-O/CiTO near-empty for new runs. FIX: derive edges at
  putObject time (evidence_relation/revision choke point).
- P1 DLQ invisible: listDead/requeueDead zero callers; dead job leaves far.db
  experiment_run 'queued' forever (terminal-truth split). FIX: surface + projection.
- P1 backupTo shelf-ware: no CLI verb/schedule. FIX: far backup verb + drill doc.
- P1 T5 write-only: verifyEventChain only called from tests. FIX: server start
  / export verify, fail visible.
- P1 T2 label without enforcement: claim.taint has no downstream reader;
  claim.ts re-declares the enum (drift). FIX: single owner import + first
  enforcement point.
- P2 conformal k-clamp under-covers when α<1/(n+1) (honest half-width +∞).
- P2 tree rows stale (A7.5/A2.12 still MISSING post-GO). P2 memory retrieval
  EN-only tokenizer. P2 T3 paraphrase bypass documented limitation (T8 pair).

## Tree-coverage auditor (verdict: NO missing continent; substrate-lifecycle governance is the near-continent)
Top gaps: retraction cascade staleness (A3.10 NEW); memory lifecycle ops
(B5.5↑); memory eval anchors LongMemEval/LoCoMo (B5.8→RU-14); researcher-side
substrate visibility (E-leaf→RU-11/F9); ablation attribution eval (A13.7→RU-14);
reverse-path atomicity + multi-writer contention (C3.4 residual); cross-store
reconciler/ops health; researcher own-data as evidence (A2.16→RU-10); cogsec
friction measurement; memory-influence provenance edges; branch merge-back
protocol (B4.3 extension).

## Cohesion auditor (verdict: data-plane cohesive YES; deliverables NO — storage landed but DLQ/memory/tags/chain-verification touch no decision or surface)
- P1 dead-job terminal split (dup of fusion#2, confirmed both stores).
- P1 retraction/GRIM advisories do NOT gate: gradeCertainty computed WITHOUT
  them; rank never reads them — retracted papers keep equal certainty.
- P1 chain verifier production-caller absent (dup).
- P2 lineage double-authority (projection re-derives vs table; sibling rebase
  pending); P2 memory/?tag= API-only (no web/CLI consumer); P2 vocab duplicate
  literals in claim.ts/lineage.ts; P2 drainOutbox retries poison intents
  unbounded (idempotent-harmless).

## Disposition (main Agent)
FIX LANDED batch 1 (db695f2): conformal k-hole; lineage live writer (putObject
choke point); verifyEventChain at server health.
FIX LANDED batch 2 (6ff096e): DLQ surface + terminal projection (dead-list/
requeue CLI + onDead far.db failed projection) — queue item 1 CLOSED.
FIX LANDED batch 3 (6873948): 'far backup' verb + docs/backup-restore.md drill
(queue item 2 CLOSED); forensics GATE gradeCertainty — retracted/EoC floors
very_low, GRIM/range failures step down (queue item 3a CLOSED; 3b taint
enforcement still open).
FIX LANDED batch 4 (bbba1a7) — ALL QUEUE ITEMS CLOSED:
- taint enforcement: verifyBundle check 11 claim_taint_labels_present (a build
  that drops labeling discipline FAILS the bundle; api contract 10->11)
- zh retrieval: searchMemory or-mode owns CJK char-trigram fallback
- memory surface: 'far memory <query> [--kind k]' CLI verb (trust labels
  travel), real-workspace smoke verified; ?tag= plane remains API-level (web
  consumption is HX lane scope).
Re-audit tracked queue: EMPTY. Tree rows synced.
Continent verdict: none missing; registry RU-14/11/10 extended with the new
leaves (A3.10/A13.7/A2.16).
