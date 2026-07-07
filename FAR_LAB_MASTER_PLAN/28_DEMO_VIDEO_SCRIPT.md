# 28_DEMO_VIDEO_SCRIPT.md — Demo 视频脚本

> **来源**：调研优化版 `17_DEMO_VIDEO_SCRIPT`。配合 `25_HERO_DEMO_AND_COMPETITION_STORY` 使用；视频红线与 `07_RISK_REGISTER_AND_DO_NOT_CLAIM` 一致。

| 镜头 | 场景 | 关键画面 | 旁白重点 |
| --- | --- | --- | --- |
| 1 | 开场问题 | AI 生成漂亮科研结论 vs 证据断裂 | AI 科研最缺的不是想法，是可被推翻的证据链 |
| 2 | Qwen 候选假设 | 模型调用 trace + candidate claim | 国产大模型生成候选，不直接产真理 |
| 3 | FEC 编译 | FEC 表单冻结 | 把自然语言 claim 变成可测契约 |
| 4 | TESS 数据绑定 | light curve / dataset hash | 每个数据来源可追溯 |
| 5 | 实验运行/导入 | RunRecord + ResultRecord | 每个结果绑定代码和 raw artifact |
| 6 | 反证检查 | negative controls / flags | 失败和反证不会被隐藏 |
| 7 | 五值裁决 | VerdictNode + reason codes | 裁决由规则产生，不由 LLM 自评 |
| 8 | 导出 proof | far-proof 目录 | 科研结论携带证据包 |
| 9 | 本地验证 | terminal verify success | Your laptop is the verifier |
| 10 | 篡改失败 | diff report red flag | 改一个关键字段，系统拒绝伪绿 |
| 11 | 结尾 | 开源路线 | 让 AI4S 从生成走向可信 |

## 视频不可出现

伪造 API key 或模型调用成功；把 fixture 说成 live 数据；把 INCONCLUSIVE 剪成 CONFIRMED；宣称发现新科学。

## 必须出现

NEEDS_* 标记、失败/降级画面、篡改 diff、`.far-proof` 目录。
