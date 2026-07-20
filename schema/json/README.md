# schema/json — 机器生成 JSON Schema(IC-12 · ADR-013)

**禁手改。** 本目录全部产物由 `scripts/generate_json_schema.mts` 从 TS 类型机器生成(SSOT 单一源):
- `fec.schema.json` ← `src/fec/fec_contract.ts#FecContractV2`
- `proof-envelope.schema.json` ← `src/proof_envelope/types.ts#ProofEnvelope`
- `verdict.schema.json` ← `src/schema/enums.ts#VERDICTS`
- `data-manifest.schema.json` ← `src/far_proof/exporter.ts#DataManifest`

改动类型后必须重跑 `node scripts/generate_json_schema.mts`;漂移检查 `node scripts/generate_json_schema.mts --check`(FF-14,`node scripts/fitness_functions.mjs` 内含)。手改生成物或改类型不重新生成 → FF-14 红。
