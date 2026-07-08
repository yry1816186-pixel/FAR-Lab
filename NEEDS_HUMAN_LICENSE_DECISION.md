# License Decision — NEEDS_HUMAN_CONFIRMATION

> 本文件记录许可证决策状态。**不是**一个 LICENSE 文件——`LICENSE` 已存在（MIT）。

## 当前状态

仓库根 `LICENSE` **已存在**，内容为 **MIT License**（`Copyright (c) 2026 FAR-Chain Contributors`）。

审计（`docs/governance/OPEN_SOURCE_AUDIT.md` §12）已确认。因此本仓库**不需要**「从零决定许可证」。

## 为什么仍有本文件

开源治理原则：**许可证是不可逆的法律决策，Agent 不得擅自替用户决定或变更**。本文件的存在是
为了：

1. 显式记录「LICENSE 已是 MIT」这一事实，避免后续 Agent 误判为缺失。
2. 标注任何**变更**许可证的意图都**必须由人类（仓库 owner）确认**，Agent 不得自行修改 `LICENSE`。

## 需要人类确认的情形（NEEDS_HUMAN_OPERATION）

- [ ] 若 maintainer 想从 MIT 变更为其他协议（如 Apache-2.0 / GPL）—— 须人类在 `LICENSE` + 所有
      `package.json` 的 `license` 字段 + `CITATION.cff` 同步修改，并处理既有贡献的许可兼容性。
- [ ] 若项目含第三方代码（如 frontend 的 Apache-2.0 依赖）需要在 NOTICE / LICENSE 中声明 —— 须人类核查。
- [ ] `CITATION.cff` 的真实作者名 / ORCID / release commit SHA 需人类填写（当前为占位）。

## 结论

**默认维持 MIT**（已存在，无需动作）。除非人类明确要求变更，否则任何 Agent 都不应修改 `LICENSE`。
