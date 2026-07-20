# golden_vectors/versioning — 内核版本化金向量(IC-01 · ADR-007)

- `vectors.json`:版本化场景判定期望(VV-01..VV-05),由 `tests/proof_envelope/ruleset_versioning.test.ts` 消费执行。
- 与 `golden_vectors/cases/GV-01..14.json`(裁决内核金向量)正交:本套件针对 envelope 版本派发与复算语义。
- 期望语义:
  - VV-01 新信封带 v1 URI 验证过;
  - VV-02 legacy(无 URI)按 v1 复算一致;
  - VV-03/04 伪造/畸形 URI fail-closed(不翻转裁决);
  - VV-05 未知字段忽略不翻转。
