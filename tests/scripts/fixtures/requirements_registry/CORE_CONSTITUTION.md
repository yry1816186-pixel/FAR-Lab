# FAR-Lab fixture core

# 0. 使用契约

## 0.1 层

### [REQ:FIC-CORE-001][T0][owner:core][scope:all] 完成声明必须有证据

- 任何完成声明必须绑定真实证据。
- 未执行不得说已执行。
- Acceptance：claim-lint 不存在无 receipt 的完成声明；报告可追溯到证据收据。
- Evidence：claim-lint report、acceptance receipts、commit fingerprint
- Failure：`FAIL`；撤回相关声明。

### [REQ:FIC-CORE-002][T0][owner:trust-kernel][scope:claim|verdict] 禁止 LLM 最终裁决

- LLM 不得拥有最终 verdict 权。
- Depends: FIC-CORE-001
- Acceptance：权限边界测试通过。
- Evidence：authority tests report
- Failure：`FAIL`。

### [REQ:FIC-CORE-003][T1][owner:science][scope:novelty] 新颖性声明应分级

- 新颖性声明应当分级标注。
- Acceptance：novelty state machine 测试通过。
- Evidence：novelty records
- Failure：T1 `FAIL` 或正式 defer。

### [REQ:FIC-CORE-004][T2][owner:ux][scope:i18n] 界面可以多语言

- UI 文案可以本地化。
- Acceptance：locale 切换后界面快照一致。
- Evidence：i18n snapshot report
- Failure：T2 `FAIL` 或 defer。
