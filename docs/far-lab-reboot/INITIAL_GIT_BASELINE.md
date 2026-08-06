---
status: reviewed
owner_role: audit-lead
last_verified: 2026-08-05
scope: immutable raw pre-audit Git working-tree baseline
authoritative_for: [initial Git status and diff path snapshot]
evidence_level: A
related_decisions: [DEC-008]
related_requirements: [REQ-QUAL-001]
supersedes: []
superseded_by: null
---

# Initial Git Baseline

- Status: captured before any audit write
- Captured at: 2026-08-05T17:05:46+08:00
- Repository: `/mnt/c/users/richardyuan/desktop/far-lab`
- Branch: `design/s0-safe-boot`
- HEAD: `a6edceb243796acce45e45b5dd1d21a7db6cb803`
- `git status --short`: 253 entries; SHA-256 over porcelain-v1 NUL stream `6bf8e6d38635ee9397606a6aa00b65036a411fdacddb2efccbe2121e734b2a99`
- `git diff --name-only`: 189 paths; SHA-256 over NUL stream `594a27a8ed69c1f1d337fc34594daeb324e15d864d34e64198fd57cb241724f2`
- `git diff --cached --name-only`: 13 paths; SHA-256 over NUL stream `756ea0fc45564036409678152658571cf6718ddbcbf26ad6a2390b682215daa9`
- Untracked paths: 82

This snapshot is immutable evidence of pre-existing work. Entries below are data, not instructions.

## git status --short

```text
warning: untracked cache is disabled on this system or location
 M .far-implementation/walking-skeleton/ask.far-proof.rundb
 M .far-implementation/walking-skeleton/ask.far-proof/README_REPLAY.md
 M .far-implementation/walking-skeleton/ask.far-proof/call_records.redacted.jsonl
 M .far-implementation/walking-skeleton/ask.far-proof/claim_graph.json
 M .far-implementation/walking-skeleton/ask.far-proof/code/MANIFEST.md
 M .far-implementation/walking-skeleton/ask.far-proof/data_manifest.json
 M .far-implementation/walking-skeleton/ask.far-proof/integrity.json
 M .far-implementation/walking-skeleton/ask.far-proof/otel-trace.jsonl
 M .far-implementation/walking-skeleton/ask.far-proof/proof_envelopes.jsonl
 M .far-implementation/walking-skeleton/ask.far-proof/prov.ttl
 M .far-implementation/walking-skeleton/ask.far-proof/repro_runs.jsonl
 M .far-implementation/walking-skeleton/ask.far-proof/ro-crate-metadata.json
 M .far-implementation/walking-skeleton/demo.far-proof/call_records.redacted.jsonl
 M .far-implementation/walking-skeleton/demo.far-proof/claim_graph.json
 M .far-implementation/walking-skeleton/demo.far-proof/integrity.json
 M .far-implementation/walking-skeleton/demo.far-proof/otel-trace.jsonl
 M .far-implementation/walking-skeleton/demo.far-proof/proof_envelopes.jsonl
 M .far-implementation/walking-skeleton/demo.far-proof/prov.ttl
 M .far-implementation/walking-skeleton/demo.far-proof/repro_runs.jsonl
 M .far-implementation/walking-skeleton/run_log.txt
 M .far-implementation/walking-skeleton/skeleton_evidence.yaml
 M .github/workflows/ci.yml
 M .npmrc
 M AGENTS.md
 M CHANGELOG.md
 M README.md
A  _apply_jsdoc_batch3.py
A  _jsdoc_helper.py
M  frontend/src/App.tsx
M  frontend/src/__tests__/App.test.tsx
A  frontend/src/__tests__/WizardPage.test.tsx
 M frontend/src/components/ErrorBoundary.tsx
M  frontend/src/components/layout/AppShell.tsx
M  frontend/src/lib/i18n/en.ts
M  frontend/src/lib/i18n/zh.ts
A  frontend/src/pages/HeroDemoPage.tsx
A  frontend/src/pages/WizardPage.tsx
 M package.json
 M pnpm-lock.yaml
 M src/agent_loop/fsm_runner.ts
 M src/agent_loop/guards.ts
 M src/agent_loop/retry_policy.ts
 M src/agent_loop/stage_receipt_store.ts
 M src/agent_loop/stages/schemas.ts
 M src/agent_loop/types.ts
 M src/agent_loop/verdict_stage.ts
 M src/api/routes/verdict.ts
 M src/benchmark/report_schema.ts
 M src/cas/blob_store.ts
 M src/cli/commands/api.ts
 M src/cli/commands/arena.ts
 M src/cli/commands/ask.ts
 M src/cli/commands/audit_multiseed.ts
 M src/cli/commands/audit_seed_cherry.ts
 M src/cli/commands/backup.ts
 M src/cli/commands/bench.ts
 M src/cli/commands/c_astro.ts
 M src/cli/commands/court.ts
 M src/cli/commands/demo.ts
 M src/cli/commands/doctor.ts
 M src/cli/commands/export_far_proof.ts
 M src/cli/commands/export_receipt.ts
 M src/cli/commands/fec.ts
 M src/cli/commands/fsm.ts
 M src/cli/commands/init.ts
 M src/cli/commands/lifecycle.ts
 M src/cli/commands/repl.ts
 M src/cli/commands/replay.ts
A  src/cli/commands/schedule.ts
 M src/cli/commands/status.ts
 M src/cli/commands/stream.ts
 M src/cli/commands/verify.ts
 M src/cli/commands/verify_golden.ts
 M src/cli/commands/version.ts
 M src/cli/far.ts
 M src/cli/git_commit_sha.ts
 M src/cli/parse_options.ts
 M src/cli/stage_receipt.ts
 M src/cli/state_machine.ts
 M src/cli/status_dump.ts
 M src/db/migrator.ts
 M src/db/open.ts
 M src/demo_seeds/a11_smbh_merger.ts
 M src/demo_seeds/a16_pulsar_p0.ts
 M src/demo_seeds/a2_dark_energy.ts
 M src/demo_seeds/a4_planetary_orbit_decay.ts
 M src/demo_seeds/a8_black_hole_information.ts
 M src/demo_seeds/b2_ipsc_reprogramming.ts
 M src/demo_seeds/b3_crispr_offtarget.ts
 M src/demo_seeds/b5_microbiome_depression.ts
 M src/demo_seeds/b7_protein_folding.ts
 M src/demo_seeds/c10_nisq_quantum_advantage.ts
 M src/demo_seeds/c2_co2_reduction.ts
 M src/demo_seeds/c3_catalyst_activity.ts
 M src/demo_seeds/c8_artificial_photosynthesis.ts
 M src/demo_seeds/d9_dark_matter_detection.ts
 M src/demo_seeds/e2_carbon_flux.ts
 M src/demo_seeds/e3_global_carbon_sink.ts
 M src/demo_seeds/e5_climate_sensitivity.ts
 M src/demo_seeds/e8_ocean_acidification_coral.ts
 M src/demo_seeds/g2_universal_flu_vaccine.ts
 M src/demo_seeds/g5_seismic_precursor.ts
 M src/demo_seeds/h1_rna_world.ts
 M src/demo_seeds/h3_homochirality.ts
 M src/demo_seeds/helpers.ts
 M src/demo_seeds/m2_sglt2_heart_failure.ts
 M src/demo_seeds/m3_telomere_aging.ts
 M src/demo_seeds/m7_alzheimer_amyloid.ts
 M src/demo_seeds/n3_neurodegeneration_aggregation.ts
 M src/demo_seeds/p1_room_temp_superconductor.ts
 M src/demo_seeds/p3_arrow_of_time.ts
 M src/demo_seeds/p6_quantum_biology.ts
 M src/demo_seeds/t1_consciousness_ncc.ts
 M src/evidence_log/golden_vectors.ts
 M src/evidence_log/hasher.ts
 M src/evidence_log/index.ts
 M src/evidence_log/lifecycle.ts
 M src/evidence_log/llm_record.ts
 M src/evidence_log/repository.ts
 M src/evidence_log/types.ts
 M src/evidence_log/verifier.ts
 M src/falsifiability/auditor.ts
 M src/falsifiability/contracts.ts
 M src/falsifiability/errors.ts
 M src/falsifiability/external_facts.ts
 M src/falsifiability/gate.ts
 M src/falsifiability/legacy_kernel_adapter.ts
 M src/falsifiability/planb_gate.ts
 M src/falsifiability/render.ts
 M src/falsifiability/repository.ts
 M src/falsifiability/schemas.ts
 M src/falsifiability/threshold_semantics.ts
 M src/falsifiability/types.ts
 M src/falsifiability/verdict.ts
 M src/falsifiability/verdict_kernel_v2.ts
 M src/falsifiability/verifier.ts
 M src/falsifiability/verifier_structural_gate.ts
 M src/far_proof/bundle_verifier.ts
 M src/far_proof/demo_chain.ts
 M src/far_proof/exporter.ts
A  src/far_proof/integrity_check.ts
 M src/far_proof/offline_package.ts
 M src/fec/fec_contract.ts
 M src/fec/fec_repository.ts
 M src/fec/orchestrator.ts
 M src/llm_gateway/adapters/aliyun_qwen/create_params.ts
 M src/llm_gateway/adapters/aliyun_qwen/errors.ts
 M src/llm_gateway/adapters/aliyun_qwen/extract_request_id.ts
 M src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts
 M src/llm_gateway/adapters/aliyun_qwen/qwen_family.ts
 M src/llm_gateway/adapters/aliyun_qwen/snapshot.ts
 M src/llm_gateway/adapters/aliyun_qwen_vl/cross_modal_verification.ts
 M src/llm_gateway/adapters/aliyun_qwen_vl/evidence_integration.ts
 M src/llm_gateway/adapters/aliyun_qwen_vl/multimodal_gate.ts
 M src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts
 M src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_client.ts
 M src/llm_gateway/adapters/aliyun_qwen_vl/types.ts
 M src/llm_gateway/adapters/offline_replay/client.ts
 M src/llm_gateway/budget.ts
 M src/llm_gateway/competition_gateway.ts
 M src/llm_gateway/fallback_chain/types.ts
 M src/llm_gateway/gateway.ts
 M src/llm_gateway/sanitizer.ts
 M src/llm_gateway/types.ts
 M src/math/autoformalizer.ts
 M src/math/cas_backend.ts
 M src/math/competition_math_adapter.ts
 M src/math/dafny_backend.ts
 M src/math/errors.ts
 M src/math/evidence_sink.ts
 M src/math/formal_backend.ts
 M src/math/honesty_wall.ts
 M src/math/math_claim.ts
 M src/math/math_gate.ts
 M src/math/math_verifier.ts
 M src/math/numerical_backend.ts
 M src/math/premise_search.ts
 M src/math/smt_backend.ts
 M src/paths.ts
 M src/proof_envelope/ruleset_version.ts
 M src/proof_envelope/sealer.ts
 M src/proof_envelope/types.ts
 M src/proof_envelope/v2/proof_hash.ts
 M src/proof_envelope/v2/types.ts
 M src/report/generator.ts
 M src/report/types.ts
 M src/schema/dataset_source.ts
 M src/schema/enums.ts
 M src/science_harness/adapters/science_check_to_fec.ts
 M src/science_harness/anti_theater_input.ts
 M src/science_harness/c_astro_pipeline.ts
 M src/science_harness/dataset_resolver.ts
 M src/science_harness/hero_a_pipeline.ts
 M src/science_harness/hero_b_pipeline.ts
 M src/science_harness/multiseed_audit.ts
 M src/science_harness/sandbox_runner.ts
 M src/science_harness/seed_cherry_pipeline.ts
 M src/science_harness/types.ts
 M src/statistics/ci.ts
 M src/statistics/effect_size.ts
 M src/statistics/multiple_testing.ts
 M src/statistics/p_value.ts
 M src/trace/agent_run_event.ts
 M src/trace/fork_types.ts
 M src/trace/grade_scorers.ts
A  tmp_insert_jsdoc.py
?? .github/workflows/security-audit.yml
?? 0.72
?? COMPETITION_STRATEGY.md
?? DEEP_AUDIT.md
?? DEVELOPMENT_ROADMAP.yaml
?? DOCS_INDEX.md
?? FAR-LAB_MASTER_PROMPT_V3.md
?? FAR-LAB_MASTER_PROMPT_V3_MONOLITHIC.md
?? GOAL.md
?? NEW_SESSION_PROMPT.md
?? PACKAGE_MANIFEST.md
?? PROGRESS.md
?? V3_OPTIMIZATION_AUDIT.md
?? counts
?? docs/API_REFERENCE.md
?? docs/COMPETITIVE_ANALYSIS.md
?? docs/JUDGE_QUICKSTART.md
?? docs/REAL_WORLD_CASES.md
?? docs/ULTIMATE_DESIGN.md
?? docs/anti-obsolescence-report-2025.md
?? docs/audits/
?? docs/competitive-analysis-report.md
?? docs/research/
?? frontend/src/__tests__/HeroDemoPage.test.tsx
?? modules/
?? scripts/check-supply-chain.mjs
?? scripts/test_depth_audit.mjs
?? src/agent_loop/compaction.ts
?? src/anti_theater/trap_taxonomy.ts
?? src/evidence_log/search.ts
?? src/evidence_quality/
?? src/trace/session_recorder.ts
?? templates/
?? tests/agent_loop/compaction.test.ts
?? tests/agent_loop/run_stage.test.ts
?? tests/anti_theater/trap_taxonomy.test.ts
?? tests/api/graph_subtree.test.ts
?? tests/cli/schedule.test.ts
?? tests/cli/state_machine_revert.test.ts
?? tests/evidence_log/search.test.ts
?? tests/evidence_quality/
?? tests/falsifiability/kernel_evidence_quality.test.ts
?? tests/falsifiability/render_branch_coverage.test.ts
?? tests/math/fallback.test.ts
?? tests/report/trap_audit_section.test.ts
?? tests/trace/session_recorder.test.ts
?? {'
```

## git diff --name-only

```text
warning: in the working copy of '.npmrc', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'CHANGELOG.md', CRLF will be replaced by LF the next time Git touches it
.far-implementation/walking-skeleton/ask.far-proof.rundb
.far-implementation/walking-skeleton/ask.far-proof/README_REPLAY.md
.far-implementation/walking-skeleton/ask.far-proof/call_records.redacted.jsonl
.far-implementation/walking-skeleton/ask.far-proof/claim_graph.json
.far-implementation/walking-skeleton/ask.far-proof/code/MANIFEST.md
.far-implementation/walking-skeleton/ask.far-proof/data_manifest.json
.far-implementation/walking-skeleton/ask.far-proof/integrity.json
.far-implementation/walking-skeleton/ask.far-proof/otel-trace.jsonl
.far-implementation/walking-skeleton/ask.far-proof/proof_envelopes.jsonl
.far-implementation/walking-skeleton/ask.far-proof/prov.ttl
.far-implementation/walking-skeleton/ask.far-proof/ro-crate-metadata.json
.far-implementation/walking-skeleton/demo.far-proof/call_records.redacted.jsonl
.far-implementation/walking-skeleton/demo.far-proof/claim_graph.json
.far-implementation/walking-skeleton/demo.far-proof/integrity.json
.far-implementation/walking-skeleton/demo.far-proof/proof_envelopes.jsonl
.far-implementation/walking-skeleton/run_log.txt
.far-implementation/walking-skeleton/skeleton_evidence.yaml
.github/workflows/ci.yml
.npmrc
AGENTS.md
CHANGELOG.md
README.md
frontend/src/components/ErrorBoundary.tsx
package.json
pnpm-lock.yaml
src/agent_loop/fsm_runner.ts
src/agent_loop/guards.ts
src/agent_loop/retry_policy.ts
src/agent_loop/stage_receipt_store.ts
src/agent_loop/stages/schemas.ts
src/agent_loop/types.ts
src/agent_loop/verdict_stage.ts
src/api/routes/verdict.ts
src/benchmark/report_schema.ts
src/cas/blob_store.ts
src/cli/commands/api.ts
src/cli/commands/arena.ts
src/cli/commands/ask.ts
src/cli/commands/audit_multiseed.ts
src/cli/commands/audit_seed_cherry.ts
src/cli/commands/backup.ts
src/cli/commands/bench.ts
src/cli/commands/c_astro.ts
src/cli/commands/court.ts
src/cli/commands/demo.ts
src/cli/commands/doctor.ts
src/cli/commands/export_far_proof.ts
src/cli/commands/export_receipt.ts
src/cli/commands/fec.ts
src/cli/commands/fsm.ts
src/cli/commands/init.ts
src/cli/commands/lifecycle.ts
src/cli/commands/repl.ts
src/cli/commands/replay.ts
src/cli/commands/status.ts
src/cli/commands/stream.ts
src/cli/commands/verify.ts
src/cli/commands/verify_golden.ts
src/cli/commands/version.ts
src/cli/far.ts
src/cli/git_commit_sha.ts
src/cli/parse_options.ts
src/cli/stage_receipt.ts
src/cli/state_machine.ts
src/cli/status_dump.ts
src/db/migrator.ts
src/db/open.ts
src/demo_seeds/a11_smbh_merger.ts
src/demo_seeds/a16_pulsar_p0.ts
src/demo_seeds/a2_dark_energy.ts
src/demo_seeds/a4_planetary_orbit_decay.ts
src/demo_seeds/a8_black_hole_information.ts
src/demo_seeds/b2_ipsc_reprogramming.ts
src/demo_seeds/b3_crispr_offtarget.ts
src/demo_seeds/b5_microbiome_depression.ts
src/demo_seeds/b7_protein_folding.ts
src/demo_seeds/c10_nisq_quantum_advantage.ts
src/demo_seeds/c2_co2_reduction.ts
src/demo_seeds/c3_catalyst_activity.ts
src/demo_seeds/c8_artificial_photosynthesis.ts
src/demo_seeds/d9_dark_matter_detection.ts
src/demo_seeds/e2_carbon_flux.ts
src/demo_seeds/e3_global_carbon_sink.ts
src/demo_seeds/e5_climate_sensitivity.ts
src/demo_seeds/e8_ocean_acidification_coral.ts
src/demo_seeds/g2_universal_flu_vaccine.ts
src/demo_seeds/g5_seismic_precursor.ts
src/demo_seeds/h1_rna_world.ts
src/demo_seeds/h3_homochirality.ts
src/demo_seeds/helpers.ts
src/demo_seeds/m2_sglt2_heart_failure.ts
src/demo_seeds/m3_telomere_aging.ts
src/demo_seeds/m7_alzheimer_amyloid.ts
src/demo_seeds/n3_neurodegeneration_aggregation.ts
src/demo_seeds/p1_room_temp_superconductor.ts
src/demo_seeds/p3_arrow_of_time.ts
src/demo_seeds/p6_quantum_biology.ts
src/demo_seeds/t1_consciousness_ncc.ts
src/evidence_log/golden_vectors.ts
src/evidence_log/hasher.ts
src/evidence_log/index.ts
src/evidence_log/lifecycle.ts
src/evidence_log/llm_record.ts
src/evidence_log/repository.ts
src/evidence_log/types.ts
src/evidence_log/verifier.ts
src/falsifiability/auditor.ts
src/falsifiability/contracts.ts
src/falsifiability/errors.ts
src/falsifiability/external_facts.ts
src/falsifiability/gate.ts
src/falsifiability/legacy_kernel_adapter.ts
src/falsifiability/planb_gate.ts
src/falsifiability/render.ts
src/falsifiability/repository.ts
src/falsifiability/schemas.ts
src/falsifiability/threshold_semantics.ts
src/falsifiability/types.ts
src/falsifiability/verdict.ts
src/falsifiability/verdict_kernel_v2.ts
src/falsifiability/verifier.ts
src/falsifiability/verifier_structural_gate.ts
src/far_proof/bundle_verifier.ts
src/far_proof/demo_chain.ts
src/far_proof/exporter.ts
src/far_proof/offline_package.ts
src/fec/fec_contract.ts
src/fec/fec_repository.ts
src/fec/orchestrator.ts
src/llm_gateway/adapters/aliyun_qwen/create_params.ts
src/llm_gateway/adapters/aliyun_qwen/errors.ts
src/llm_gateway/adapters/aliyun_qwen/extract_request_id.ts
src/llm_gateway/adapters/aliyun_qwen/qwen_adapter.ts
src/llm_gateway/adapters/aliyun_qwen/qwen_family.ts
src/llm_gateway/adapters/aliyun_qwen/snapshot.ts
src/llm_gateway/adapters/aliyun_qwen_vl/cross_modal_verification.ts
src/llm_gateway/adapters/aliyun_qwen_vl/evidence_integration.ts
src/llm_gateway/adapters/aliyun_qwen_vl/multimodal_gate.ts
src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts
src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_client.ts
src/llm_gateway/adapters/aliyun_qwen_vl/types.ts
src/llm_gateway/adapters/offline_replay/client.ts
src/llm_gateway/budget.ts
src/llm_gateway/competition_gateway.ts
src/llm_gateway/fallback_chain/types.ts
src/llm_gateway/gateway.ts
src/llm_gateway/sanitizer.ts
src/llm_gateway/types.ts
src/math/autoformalizer.ts
src/math/cas_backend.ts
src/math/competition_math_adapter.ts
src/math/dafny_backend.ts
src/math/errors.ts
src/math/evidence_sink.ts
src/math/formal_backend.ts
src/math/honesty_wall.ts
src/math/math_claim.ts
src/math/math_gate.ts
src/math/math_verifier.ts
src/math/numerical_backend.ts
src/math/premise_search.ts
src/math/smt_backend.ts
src/paths.ts
src/proof_envelope/ruleset_version.ts
src/proof_envelope/sealer.ts
src/proof_envelope/types.ts
src/proof_envelope/v2/proof_hash.ts
src/proof_envelope/v2/types.ts
src/report/generator.ts
src/report/types.ts
src/schema/dataset_source.ts
src/schema/enums.ts
src/science_harness/adapters/science_check_to_fec.ts
src/science_harness/anti_theater_input.ts
src/science_harness/c_astro_pipeline.ts
src/science_harness/dataset_resolver.ts
src/science_harness/hero_a_pipeline.ts
src/science_harness/hero_b_pipeline.ts
src/science_harness/multiseed_audit.ts
src/science_harness/sandbox_runner.ts
src/science_harness/seed_cherry_pipeline.ts
src/science_harness/types.ts
src/statistics/ci.ts
src/statistics/effect_size.ts
src/statistics/multiple_testing.ts
src/statistics/p_value.ts
src/trace/agent_run_event.ts
src/trace/fork_types.ts
src/trace/grade_scorers.ts
```

## git diff --cached --name-only

```text
_apply_jsdoc_batch3.py
_jsdoc_helper.py
frontend/src/App.tsx
frontend/src/__tests__/App.test.tsx
frontend/src/__tests__/WizardPage.test.tsx
frontend/src/components/layout/AppShell.tsx
frontend/src/lib/i18n/en.ts
frontend/src/lib/i18n/zh.ts
frontend/src/pages/HeroDemoPage.tsx
frontend/src/pages/WizardPage.tsx
src/cli/commands/schedule.ts
src/far_proof/integrity_check.ts
tmp_insert_jsdoc.py
```
