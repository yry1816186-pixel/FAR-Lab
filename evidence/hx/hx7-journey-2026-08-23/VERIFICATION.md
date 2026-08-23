# HX7 验收旅程走查 — 2026-08-23（傍晚）

- 服务器：`node scripts/serve.mjs` @ 127.0.0.1:3196，health `{"status":"ok","db":"ok","watchdog":"ok"}`；根 dist 与 web/dist 均为当日重建（web 19:47/19:54 两次，含本批修复）。
- 真实数据：run_jpktce50q7wqc68rkg64ztm3me（维生素 D / Medicine / 9 阶段完成 / 12 源 / 8 主张 / 15 关系 / 10 假设 / 88 receipts）。
- 纪律：全程只读 + UI 状态验证；不提交新研究/不发送对话回合/不提交反馈（均会触发真实模型调用，违反 2026-08-23 禁实测令）；导出类未触发。
- 工具：Playwright（无头 Chromium），可访问树断言 + 截图。

## 步骤与证据

| # | 旅程步骤 | 结果 | 截图 |
|---|---|---|---|
| 1 | 首次打开即理解入口 | ✓ 三步"工作方式"、示例 chips、诚实水位"1/2 个模型可用"、研究库 52、继续最近的研究 | 01 |
| 2 | 自然输入科研目标 | ✓ 输入 GLP-1 问题后"开始头脑风暴"由禁用转激活；Home composer 已接对话优先流（useConversationStart） | 02 |
| 3 | 成熟文件体验 | ✓ sample.docx 经"资料"上传 → 附件卡（DOC · 1 KB + 移除）+ 计数"1/50 项资料"（50 上限已实装） | 02 |
| 4 | 语音输入（离线听写） | ✓ 诚实错误态浏览器级实证：无麦克风环境 15.2s 后 note 出现"未检测到可用麦克风（TimeoutError）"（本批新增 15s 待决守卫；此前权限 Promise 挂起=永久静默） | 03 |
| 5 | AI 澄清（真实能力） | 未触发（需发送真实回合，禁实测令）— 能力存在：conversation-agent 澄清问题通道 | — |
| 6 | 清楚 AI 在做什么/为什么 | ✓ 研究页叙事：结论先行 + BT 5.82·胜率 100% 带"决策辅助，非客观真值"警示 + 分阶段真实摘要（12 文档/8-14 检索/skipped_no_abstract=9 诚实呈现）+ 阶段时间线真实时长与子任务计数（12/12、3/3）+ L3 技术轨迹（90 条）默认折叠 | 04 |
| 7 | 查看 evidence/hypothesis/plan/experiment 进展 | ✓ 六 tab 全走查（证据/假设/计划与实验含实验统计/修订史/核验与导出） | 05-08 |
| 8 | 可暂停/干预/补充 | ✓ 干预条存在；终态 run 上"取消执行"禁用且给原因（"不可取消：研究已处于终态"）；反馈入口带因果修订链说明 | 04 |
| 9 | 结构化可交互结果 | ✓ 假设卡流+证据平衡、计划页 0 裸 id、核验页分段报告阅读器（文档大纲导航、55505 字符） | 05-07,09 |
| 10 | 追溯 provenance | ✓ 核验页 88 条 receipts 可见；报告含"未记录的内容以「缺失」明示，不含任何补造"声明 | 09 |
| 11 | 继续迭代而非重启 | 部分：反馈抽屉/修订史 UI 就绪；本 run 反馈-修订链为 skip 状态（无反馈信号时如实显示"尚无反馈信号"）；真实修订闭环已由 EEL live 验证过（evidence/W-EEL） | 08 |
| 12 | 导出真实 artifacts | 部分：导出/重新导出/下载报告(.md) 入口与 verifyBundle 接线在；实际打包未触发（显式动作，留给用户或后续授权） | 09 |
| 附 | 常驻对话入口 | ✓ 对话视图打开：审批卡机制文案（"行动会先生成审批卡，由你批准后执行"）、全工具轨、空输入时发送禁用 | 10 |
| 附 | 哈希路由 | ✓ `#run/:id/:tab` 全程可分享（走查中每 tab 都反映在 URL） | — |

## 走查发现并当场修复

1. **听写权限挂起静默**（步骤 4）：无头/嵌入式环境 getUserMedia 永久挂起→按钮无任何反馈。修复：15s 待决守卫 + 迟到授权音轨清理（web/src/hooks/useDictation.ts）。
2. **侧栏裸计数**："需注意 32"违反计划 §2（人话要求）。修复："32 项研究未完成或中断"（zh/en，RunsSidebar + dict）。

## 遗留（记录在案，未修）

- 研究页"研究计划"里程碑摘要行含裸 `pln_` id（来自管线 note 原文；根治在后端 note 发射处，属跨道文件，不在本次范围）。
- `/paper` 对 pre-BP3 bundle 返回 404 为**设计行为**（UI 优雅隐藏论文页签），控制台 404 日志是浏览器固有行为，非 bug。
- 步骤 5/12 的真实动作（发送澄清回合、实际导出打包）按禁实测令留待用户或后续显式授权。

## 门禁

vitest 目标批：api 54/54、event-stream-tracker 6/6、dictation 9/9、conversations 11/11、automations 5/5、file-ingest 13/13；TUI 12/12；root tsc 0 错；web typecheck+build 绿；secret-scan 0；path-hygiene 0。（全量套件中兄弟道在途测试失败不在本批范围，见 EXECUTION_STATE 99024ea 备注。）

## 增补（同日晚，深度验证轮）

### 听写链真语音端到端（浏览器内、全程离线）

- 修复两只 P0 后实证：① ORT 变体加载器缺失（fetch 脚本只拷 jsep 两文件；缺 3 个 .mjs → "no available backend found"）→ 脚本改为 onnxruntime-web/dist 全量 8 文件 + 现场补齐 + manifest 刷新；② ORT 1.26-dev MatMulNBits 融合与旧版 q8 量化格式不兼容（"Missing required scale … weight_merged_0_scale"）→ worker 会话选项 graphOptimizationLevel:'disabled'。
- 探针：JFK 真实演讲 6.34s（44.1k 立体声→16k 单声道 f32，101,413 采样）直接 postMessage 给**部署产物中的真 worker chunk**。
- 结果：`status:done, result:"And so my fellow Americans asked not what your country"`（正确转写）；模型就绪 1.4s，总耗时 40.7s；0 网络外呼（allowRemoteModels=false + 全本地资产）。
- 边界：物理麦克风采集（getUserMedia 真设备）仍留用户首用；至此链路中所有软件环节均有浏览器级实证。

### TUI 行式降级修复（管道/CI 场景三重陷阱）

- 实测发现 Node v24/Windows 管道 stdin 下：readline/promises 连续第二问永不 settle；每问新建接口会预读+close 丢弃后续行；无监听期到达的 line 事件被 EventEmitter 静默丢弃（EOF 后死接口 prompt() 抛 "readline was closed"）。
- 修复：新增 `packages/tui/src/ask.ts`（单一持久接口+常驻 line 监听+行队列+EOF 诚实空串）；fallback.ts 全部改用 ask()。
- 走查：两条完整管道会话（问题输入→放弃→52 项真实研究列表→选择→完整阶段叙事含真实 bundle id）exit 0；TUI 套件 12/12 仍绿。
- 发布：`npm publish --dry-run` 通过（13 文件/11.3kB/shasum 93ba24a2…）；正式发布 BLOCKED--auth（本机未 npm login，凭证属用户）。
