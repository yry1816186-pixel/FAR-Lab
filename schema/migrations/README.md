# Schema Migrations

Runtime migration set for the FAR-Lab SQLite store. Numbering is **contiguous from 1** and enforced
at runtime by the migrator — a gap or duplicate aborts startup:

```ts
// src/db/migrator.ts
function assertContiguousVersions(migrations: readonly MigrationFile[]): void {
  let expected = 1;
  for (const migration of migrations) {
    if (migration.version !== expected) {
      throw new Error(`db.migrator: migration versions must be contiguous, expected ${expected} but found ${migration.version}`);
    }
    expected += 1;
  }
}
```

Anti-drift check: `ls schema/migrations/*.sql | wc -l` must equal the number of rows in the map
below (currently 21).

## Design policies

- **Forward-only, by design.** The runner (`src/db/migrator.ts` → `runMigrations`) applies `up`
  only; there is no `down`/rollback path. This is intentional, not an omission: the core evidence
  tables carry append-only triggers (UPDATE/DELETE blocked) because every mutation must preserve
  the hash chain. A `down` migration would break the chain by construction.
- **No placeholder migrations.** Numbering tracks entities that actually landed. We do not create
  empty shell files to hit a target count — an empty migration is fake progress.
- **`verdict_nodes` has no `no_delete` trigger (intentional).** It is a stateful adjudication node
  store, not a pure append-only evidence table. Existing FK `ON DELETE RESTRICT`, the
  immutable-fields whitelist trigger, and `no_terminal_rollback` already prevent deleting
  referenced nodes, while orphan cleanup for graph rebuilds stays possible.

## Migration map (21 files)

| File | version | Entities |
|---|---|---|
| `0001_initial.sql` | 1 | Five core tables (call_records / evidence_log / verdict_nodes / evidence_edges / repro_runs) + append-only trigger + inline extension columns (purpose_tag 9-value CHECK, dashscope_request_id, …) |
| `0002_add_dialogue_tables.sql` | 2 | Research dialogue layer: research_sessions / dialogue_turns / intent_hypotheses / dialogue_clarification_questions (outside the hash chain) |
| `0003_math_verification.sql` | 3 | math_claims + math_verifications |
| `0004_proof_envelopes.sql` | 4 | proof_envelopes (conclusion 5-value enum + proofHash chain + anti-theater trigger) |
| `0005_falsifiability_contracts.sql` | 5 | falsifiability_contracts (FEC V1) |
| `0006_falsification_audit_events.sql` | 6 | falsification_audit_events (meta-audit of falsification sufficiency) |
| `0007_add_degraded_from.sql` | 7 | call_records.degraded_from (fallback-chain degradation audit column) |
| `0008_anti_theater_fail_coverage.sql` | 8 | Anti-theater trigger rebuilt to cover FAIL verdicts |
| `0009_fec_contracts_v2.sql` | 9 | fec_contracts_v2 (FEC V2 frozen contract: 16 fields + fec_hash + append-only trigger) |
| `0010_proof_envelopes_v2.sql` | 10 | proof_envelopes_v2 (ProofEnvelope V2: 16 fields + proof_hash self-excluding + anti-theater trigger). Forward-schema note: V2 tables + triggers exist, production writes still go through the V1 `proof_envelopes` path (`sealer.ts`); V2 logic serves verify + cross-language proofHash. |
| `0011_anti_theater_trigger_v2.sql` | 11 | Trigger rebuilt to match the antiTheaterReport V2 shape |
| `0012_verdict_trace_persist.sql` | 12 | verdict_nodes persists kernel output (verdict_trace_json + verdict_trace_hash; fields whitelisted into current_hash) |
| `0013_verdict_enum_guard.sql` | 13 | verdict/conclusion enum defense-in-depth trigger (second layer over the column CHECK) |
| `0014_verdict_supersede.sql` | 14 | verdict_nodes.superseded_by self-FK; current verdict = row WHERE superseded_by IS NULL |
| `0015_far_blob_store.sql` | 15 | Content-addressed blob CAS table (hash PK, append-only trigger) |
| `0016_evidence_derivable.sql` | 16 | evidence_log derivable flag + evidence_payload_hash (recomputable verification) |
| `0017_evidence_provenance_class.sql` | 17 | evidence_log provenance_class (system_derived / llm_generated / human) + system_claim_hash (LLM output must have null provenance — sources cannot self-attest) |
| `0018_evidence_provenance_trigger.sql` | 18 | Cross-column provenance invariant as a DB BEFORE INSERT trigger |
| `0019_ruleset_uri.sql` | 19 | proof_envelopes.ruleset_uri (kernel ruleset version URI; NULL = legacy V1 envelope) |
| `0020_call_record_payload_hashes.sql` | 20 | call_records.request_payload_hash (payload content hash coverage) |
| `0021_lifecycle_events.sql` | 21 | lifecycle_events (retraction / correction / supersession tombstones; event-level hash chain) |

## Planned future tables (not yet landed)

These entities are on the roadmap and intentionally have no migration yet — see "No placeholder
migrations" above: probe_atlas (3 tables), sensitivity_envelopes / UQ sensitivity, far_bench_metrics,
sciir_objects, trace_events, verdict_protocols, replay_forks, ledger_events + merkle_roots,
adversarial_rounds.
