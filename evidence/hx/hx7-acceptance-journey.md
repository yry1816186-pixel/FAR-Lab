# HX7 验收旅程正式走查 — 2026-08-23（重构后全量实测）

环境：fresh web/dist（13:43 构建）+ `node scripts/serve.mjs` (3196) + Playwright；全程未触发任何真实模型/检索 API（禁测令遵守）。

| # | 任务书步骤 | 结果 | 证据 |
|---|---|---|---|
| 01 | 首次打开理解产品和入口 | **PASS** — 居中问候"今天研究什么？"+一句话能力说明+研究引擎就绪行 | hx-redo-home.png |
| 02 | 自然输入科研目标 | **PASS** — 自动增高输入区输入 114 字符问题 | hx7-journey-01-05-*.png |
| 03 | 上传论文/数据并见成熟文件体验 | **PASS（真实解析）** — 经"资料"按钮上传 Chromium 生成的带文本层 PDF（34KB 文本提取成功）+ 手写 BibTeX（citation-js 解析出**论文真实标题**而非文件名）；附件卡含类型/大小/计数 2/5 | hx7-journey-01-05-*.png |
| 04 | AI 主动澄清 | **BLOCKED** — 后端无澄清能力；不伪造聊天（任务书红线：真实能力才接线） | — |
| 05 | 开始研究 | **PASS（就绪态）** — 提交按钮 enabled；按 2026-08-23 禁真实 API 实测令**未点击提交**（会触发真实检索+模型调用） | 同上 |
| 06 | 清楚 AI 在做什么/为什么 | **PASS** — 阶段叙事时间线（每阶段人话描述+摘要），90 条遥测折叠 | hx-redo-run-timeline/final.png |
| 07 | 查看 evidence/hypothesis/tool/experiment 进展 | **PASS** — 假设卡片流+证据天平（真实关系计数）+计数一致行 | hx4-hypotheses-balance.png |
| 08 | 需要时暂停/干预/补充 | **PASS** — 运行控制（取消禁用+诚实原因/恢复可用）+反馈因果链承诺文案 | 走查记录（本页 research tab） |
| 09 | 结构化可交互结果 | **PASS** — 论文手稿渲染式预览（IMRaD+14 项目录+0 裸 ID） | hx5-paper-preview.png |
| 10 | 追溯 evidence/provenance | **PASS** — 88 条回执溯源表+报告内"主张 N"人话化 | hx7-journey-10-12-*.png |
| 11 | 继续迭代而非重启 | **PASS** — 真实因果修订链（反馈 1 → 修订 v0→v1 → 版本差异） | hx4c/hx7-walk-revisions.png |
| 12 | 导出真实 artifacts | **PASS（真实执行）** — GUI 点击 verify：**结论 verified**，10 项检查逐项渲染，复现限制诚实披露（LLM 非确定性+1 条 resolved_unaligned） | hx7-journey-10-12-*.png |

**Tauri 壳回归（静态）**：`frontendDist: ../../web/dist`（tauri.conf.json:9）→ 13:43 最新构建自动继承全部 HX 重构；壳源 0 处旧 tab 名引用。端到端 exe 启动留待用户侧演示（D-066 流程已验模式未变）。

**遗留**：步骤 04（AI 澄清）待后端能力；HX6 TUI 等用户裁决依赖面方案（.planning/DECISION-hx6-tui.md）。
