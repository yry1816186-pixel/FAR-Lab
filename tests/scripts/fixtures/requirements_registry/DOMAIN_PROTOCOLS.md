# FAR-Lab fixture domain

# A. 科学协议

## A1. 问题合同

### [REQ:FIC-DOM-001][T0][owner:science][scope:research-start] 研究问题必须结构化

- 研究问题必须有边界和验收判据。
- Acceptance：schema 校验测试通过。
- Evidence：schema results、report
- Failure：`FAIL`。

### [REQ:FIC-DOM-002][T1][owner:evaluation][scope:benchmark] 基线应当冻结

- 基线集应当冻结并可复算。
- Conflicts: FIC-CORE-004
- Acceptance：frozen eval rerun 一致。
- Evidence：frozen dataset
- Failure：T1 `FAIL` 或 defer。
