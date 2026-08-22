# Wave-P1 最高执行指令 · 竞赛交付与产品工程冲刺（内部升级，非调研）

> 使用方式：整份作为 /goal 交给新窗口。共同基线见 `research/WAVE-PROMPTS/_COMMON-BASELINE.md`（粘贴时一并带上）。

## 〇、接续点

**开启 Wave-P1：面向官方提交要求的交付工程冲刺。官方材料要求（COMPETITION.md §0/提交要求节，2026-08-22 逐字复核）：技术方案文档 PDF ≤20 页（研究问题与解决方法、架构设计与讲解、代表性测试案例、源代码、项目工作流程、上下文工程设计、数据或资料来源说明、结果展示与反馈迭代过程）；可附交互前端、可调用测试 API、≤10 分钟演示视频；提交截止为官方事实 2026-09-05。本 Wave 把已验证的真实能力转化为达标的交付物——所有内容必须引用真实 run/测试/证据，零表演零注水。先读 final_delivery.md、project-spec/policies/PRODUCT_HCI.md、.control/ACCEPTANCE_STATUS.json 防重做。**

## 一、交付物清单（按优先序；每项有验收 DoD）

| # | 交付物 | 内容要求 | DoD |
|---|---|---|---|
| 1 | **技术方案文档（PDF 源稿 markdown 先行）** | 严格覆盖官方八要素；数字全部来自 evidence/ 与 eval/results/ 实值（引用文件路径）；架构图（mermaid→图片）；上下文工程设计章节写真实的 prompt/schema/tolerance 设计（D-026 strict-FC、四层容忍链、维度体系）；反馈迭代章节引用 revision 因果链与复现评估 F1 | ≤20 页约束下的源稿成文；每个数字可溯源；对抗审计过一遍（数字↔JSON 实值核对，沿用 D-022 方法） |
| 2 | **Web 工作台深度打磨** | 按 PRODUCT_HCI 全文执行：信息架构/状态模型/失败-恢复-长任务 UX 走查；PlanTab 补 decisionRuleProvenance 呈现（D-024 watch）；假状态清零（无真实数据绑定处诚实标注）；i18n 一致性 | nielsen-heuristics + cognitive-walkthrough 双审计（技能在位）并修复全部 P1/P2 |
| 3 | **可调用测试 API + 演示路径** | 官方要求"可调用测试 API"：现有 API 面（health 等）补一条端到端演示端点或脚本化 curl 序列；演示视频脚本/分镜（≤10 分钟，逐步对应真实操作，注明每个画面的真实命令/页面） | API 实测 curl 序列成文档；视频脚本每步可复现 |
| 4 | **README/安装/发布包装** | human README（快速上手/架构导览/复现三命令）；安装脚本；FARLAB_GIT_COMMIT 注入发布构建（遗留②） | 全新目录按 README 三命令跑通的实测记录 |
| 5 | **公网部署前安全审计** | Web XSS 面审计（遗留③）；API 面权限/速率；secret 路径复查 | 审计报告+修复；secret-scan/path-hygiene 绿 |

## 二、本 Wave 特有警戒
- **零表演红线**：文档/演示中不得出现任何未验证能力或注水数字；每处宣称可溯源到 evidence/eval 文件；官方路由合规措辞按 COMPETITION.md §0 如实（Qwen/百炼凭证未到位前，路由状态如实标注，不伪造凭证）。
- 用户凭证门（DASHSCOPE/百炼、OPENALEX_API_KEY）到位前，涉及项标注 READY-TO-VERIFY 并给出一条命令验证路径（qwen-route-probe.mjs 已在位）。
- 竞赛措辞与项目内术语对齐（canonical domain model），不造第二套话术。

## 三、开场序列
| 步 | 动作 | DoD |
|---|---|---|
| 1 | 基线恢复序；status→IN_PROGRESS，phase=wave-p1-delivery | 控制面一致 |
| 2 | 交付物 1→5 顺序执行（1 与 2 可并行子 Agent 起草，主 Agent 统稿核数） | 每项 DoD 达成 |
| 3 | 数字诚实审计（子 Agent 对照原始 JSON 全量核对文档数字） | 0 不符 |
| 4 | 收口：交付物入 `artifacts/delivery/`（或根目录约定位置）；决策/控制面/记忆同步；completion-gate 复跑 | 提交成功 |
