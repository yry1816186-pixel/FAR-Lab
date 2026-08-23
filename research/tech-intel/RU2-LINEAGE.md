# RU-2 LINEAGE — Research Packet (2026-08-24, SEARCH_SATURATED)

Agent-produced, main-Agent adjudicated. Status: SOURCE_VERIFIED.

## Problem
(a) lineage graph + query API, (b) event tag-query plane, (c) run-level
branching/rollback without a second orchestrator, (d) trajectory UX.
Today: parentRunId linear only; events queried by type/reason greps; no branching.

## Candidates
| Candidate | Org/License | Verdict | Why |
|---|---|---|---|
| AER (arXiv 2603.21692) | Vispute/Oracle; CC BY-SA 4.0; paper VERIFIED, **no public SDK** (suspected internal) | **EXTRACT** | field shape (intent/observation/inference per step, versioned plans, delegation authority chains) into event payload zod; implementation unavailable |
| Execution Lineage (arXiv 2605.06365 + 2605.12087) | Rosen&ThruWire | **ADOPT semantics** | dependency-domain replay = our fingerprint cache + explicit lineage edges; explicit dependencies + first-class intermediates + identity replay. Do NOT adopt its artifact-store/new identity scheme |
| Provenance survey (arXiv 2606.04990 v4) | academic | **KEEP** | vocabulary: execution provenance (typed graph of execution) vs evidence tracing (projection to support relations) — names our two layers: lineage_edges vs ACH links |
| MLMD | google, Apache-2.0, active | **ADAPT concepts / REJECT impl** | Artifact/Execution/Event(INPUT,OUTPUT)/Context schema concepts; Python+gRPC, Windows ≥1.15 deprecated, violates zod-only |
| LangGraph checkpointing | LangChain MIT | **EXTRACT** | `before`+`limit` keyset cursor pattern; **fork leak counter-example**: forking from old checkpoint replays sibling-branch pending writes across branches (issue on record) — our seq-scoped per-run event spine is naturally immune; keep as hard invariant: branch writes only in new run's seq range |
| Comunica+Fuseki | Apache/MIT | **REJECT internal / KEEP external** | second query language in-process violates minimal architecture; exported JSON-LD can be queried externally by researchers |
| OTel GenAI / LangSmith / W&B | — | **REJECT** | telemetry ≠ fact authority; SaaS egress red line |
| SQLite WITH RECURSIVE | sqlite.org | **KEEP** | official docs support graph/DAG traversal incl. multi-parent + cycle guards |

## Physical model decision
**Adjacency edge table + recursive CTE** (not closure table): our lineage is a
shallow forest (run chains depth ~dozens, delegation 1-2); supervisor needs
bounded-depth ancestors (CTE + depth LIMIT = O(depth)); audit subtree integrity
via CTE descendants + (run_id, seq) pruning. Closure tables risk O(V·E)
explosion with multi-parent DAG + a second consistency structure (violates
one-invariant-one-owner). Re-open trigger: if ancestor-query p95 exceeds
budget at scale, add MATERIALIZED closure as projection (not authority).

DDL sketch (migration v5, following db.ts patterns):
```sql
CREATE TABLE lineage_edges (
  from_id TEXT NOT NULL, to_id TEXT NOT NULL,
  kind TEXT NOT NULL,   -- zod enum: forked_from|delegated_to|produced|consumed|revised_into|...
  run_id TEXT NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, kind));
CREATE INDEX idx_le_to ON lineage_edges(to_id, kind);
CREATE TABLE event_tags (
  seq INTEGER NOT NULL, tag TEXT NOT NULL,  -- closed vocab: stage:*|kind:*|obj:*|auth:*|run:*
  PRIMARY KEY (tag, seq));                  -- deterministic code fills at insert (never LLM)
```
Existing src/app/lineage.ts becomes a UI projection reading the SQL query
plane (current listRuns(1000) full hydration = baseline to beat). runs
parentRunId stays in doc JSON (lineage_edges is the query authority).

## API + branching + replay
- `events.query({tags[], runId?, afterSeq?, limit≤200})` keyset cursor; event
  summaries + seq; payload hash/redacted per provenance.ts precedent; model
  surface NEVER exposes auth:secret level or unredacted payloads; no OFFSET.
- branch = new run + `forked_from` edge + forkPoint seq + reason event; inputs
  referenced by immutable object PK (not copied); rollback = same mechanism
  (new run, same question_id); resume reuses step_fingerprints family hits ⇒
  unchanged steps reproduce free. Hypothesis-level fork reuses the same
  mechanism (one mechanism, two entries).
- Replay identity: step_fingerprints (v3 family keys) stays THE identity
  scheme; lineage_edges add the explicit-dependency dimension = Execution
  Lineage semantics achieved without a new identity scheme.
- Interop: SWAN JSON-LD covers surviving hypotheses only — add cheap PROV-O
  serializer: run→prov:Activity, object→prov:Entity, produced/consumed→
  wasGeneratedBy/used, delegation→prov:Agent+actedOnBehalfOf. Same
  lineage_edges single-sources both exports. No third store.

## Evaluation workload (all offline)
Synthetic lineage forest N=200 runs (depth 12, delegations, 50k tagged events):
ancestors(depth≤4) p95 vs current full-hydration baseline; subtree integrity;
events.query p95 with/without event_tags vs grep; fork equivalence (branch run
produces byte-identical step_outputs for unchanged fingerprint families — the
LangGraph-leak regression test); PROV-O round-trip (every edge exactly once).

## UNVERIFIED
AER SDK existence/license (paper claims, no repo); MLMD API semantics detail
(official docs 404 during research; Level C: pip install ml-metadata, dump
schema); Execution Lineage identity formula details (PDF unread);
"Comunica MCP bridge" (hunter claim, no entity found); SWAN export coverage
(hypothesis subset confirmed only).
