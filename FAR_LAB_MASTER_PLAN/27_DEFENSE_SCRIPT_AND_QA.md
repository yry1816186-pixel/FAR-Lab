# 27_DEFENSE_SCRIPT_AND_QA.md — 答辩稿与 Q&A

> **来源**：调研优化版 `16_DEFENSE_SCRIPT_AND_QA`。配合 `21_COMPETITION_AND_JUDGE_VIEW`（评委视角审计）使用；红线口径以 `07_RISK_REGISTER_AND_DO_NOT_CLAIM` 为权威。

## 1. 60 秒开场

今天的 AI Scientist 已经能提出假设、写代码、跑实验甚至生成论文，但真正危险的是：它说出的科学结论能不能被第三方验证、重跑、反驳和撤回。我们的项目真研 FAR-Lab / FAR-Chain，是面向国产大模型 AI Scientist 的可证伪科研证据链运行时。Qwen 生成候选假设，FAR 把它编译成 FEC 证据契约，绑定 TESS 等真实科学数据、代码、运行记录、统计检验和反证条件，最后输出五值 deterministic verdict 和 `.far-proof` 包。评委不需要相信我们的 PPT，也不需要相信大模型；把 proof package 放到自己的机器上验证，改一个关键字段就会看到 proofHash 和 verdict trace 失败。

## 2. 3 分钟讲稿

第一，问题：AI Scientist 生成能力强，但科研可靠性不足。第二，方案：FAR-Chain 建立 `Claim -> FEC -> Evidence -> Experiment -> Result -> Verdict -> ProofPackage` 链路。第三，比赛适配：Qwen/百炼 profile + TESS 公开数据。第四，创新：不让 LLM 当最终科学裁判，用五值 deterministic verdict。第五，诚实边界：`CONFIRMED` 只是 bounded support。

## 3. 5 分钟讲稿

在 3 分钟版本基础上增加架构分层、anti-theater attacks、proof package 目录、TESS demo 关键画面和开源路线。强调“含 UNTESTED 的可信链，比全绿伪证链更有科研价值”。

## 4. 10 个尖锐 Q&A

| 问题 | 回答 |
| --- | --- |
| 你们是不是普通多 Agent？ | 不是。多 Agent 是执行方式，FAR 的核心是 FEC、deterministic verdict、proof package 和可反证证据链。 |
| 为什么叫 proof，不是夸大吗？ | proof 证明的是记录完整性与裁决可重算，不证明科学真理。 |
| CONFIRMED 是否代表科学结论正确？ | 不代表，只是冻结证据契约下的 bounded support，并带 limitations。 |
| 真实用到 Qwen 吗？ | 设计有 competition profile；真实调用必须用百炼/DashScope key 验证，未执行前标 NEEDS_API_VALIDATION。 |
| TESS demo 是否发现新东西？ | MVP 不宣称新发现，只演示公开数据 claim 如何被验证/降级/导出。 |
| LLM judge 有什么问题？ | LLM 可辅助审稿，但最终科学裁决必须由规则、统计、因果和证据完整性决定。 |
| 证明包能防造假吗？ | 能发现记录后篡改和断链，不能防止一开始就输入假数据，所以还需要 source/data anchor 和专家复核。 |
| 为什么不是直接做 AI Scientist？ | 已有系统擅长生成；本项目补 AI 科研可靠性基础设施空白。 |
| 开源后谁会用？ | AI4S 团队、agent 框架、reproducibility 社区、benchmark 作者、科学数据中心。 |
| 最大风险是什么？ | 过度承诺。我们用 DO_NOT_CLAIM 和 NEEDS_* 标记控制。 |

## 5. 技术/比赛/开源追问

- hash 只证明记录未变，FAR 的价值是定义哪些字段应影响 scientific verdict。
- FEC/protocol freeze 防 HARKing；后验修改阈值生成 IntegrityFlag。
- Qwen 价值是生成候选假设与计划，FAR 让其输出可验证。
- Core domain-neutral，TESS 是 hero demo，其他学科需要 adapters。
