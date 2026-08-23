# HX 走查 + gc P0 数据丢失事故记录 — 2026-08-24

会话：Human Experience 总负责（build/hx-reconstruction）。方法：真实浏览器（Playwright/CDP）+ 真实 CLI + 真实持久化数据走查；未触发任何真实模型/检索 API。

## 1. 发现并闭环的 P0：`far gc --apply` 误删 bundle 引用的工件

**现象**（走查核验与导出 tab 时发现）：已完成研究 run_jpktce50q7wqc68rkg64ztm3me 的报告区显示「报告尚未生成」，但运行状态为 completed 9/9 —— 自相矛盾状态。

**根因**（证据链）：
- round-4 `far gc` 的引用扫描 `store.referencedArtifactHashes()` 正则为 `/sha256:([0-9a-f]{64})/g`，只认带前缀引用。
- 但 ReproducibilityBundle 持久化时 `finalArtifactHashes` / `sourceArtifactHashes` 是**裸 hex**（无前缀）——已在真实 far.db 上逐字节确认。
- 用户 2026-08-24 在真实工作区执行 `far gc --apply`（PROPOSAL-screening-release-gc.md 记录"851 orphans removed, 34/34 remaining referenced"），实际删除了 **55/56 个被 bundle 引用的工件 blob**。该提案的"34/34 remaining blobs referenced"验证只对剩余 34 个文件成立，未发现已删的 55 个其实被引用。
- fail-safe 方向颠倒：漏一个引用=静默数据丢失；多留一个 blob=无害。

**影响面**（实测）：
- 最新 bundle 报告/论文工件：55 个缺失 → 所有已完成研究的 GET /report 与 GUI 报告区 404/空态误导。
- 最新 bundle sourceArtifactHashes：602/602 快照缺失 → 第三方 verify 判 failed（source_artifact_hashes 检查 12/12 失败）。**此部分离线不可恢复**（抓取的网络内容非确定性可重放；诚实保留 failed verdict）。
- DB 对象层完好：question/corpus/source_document/hypotheses/receipts 全部在库。

**修复**：
1. 根因：`src/persistence/store.ts` 引用正则改为 `/(?:sha256:)?\b([0-9a-f]{64})\b/g`（两种拼法都算引用；注释写明非对称取舍理由）。
2. 回归锁：`tests/gc.test.ts` 新增用例——bundle 以生产同款拼法（裸 hex finalArtifactHashes + 前缀 paperOutlineRef）引用两份工件，断言 dry-run 零 orphan、--apply 零删除、内容字节一致存活。RED→GREEN 全程留痕。
3. 恢复：export 阶段是确定性渲染，一次性脚本经真实 exportStage 重渲染全部受影响 run 的报告+论文，恢复后逐一 sha256 比对 bundle 记录哈希：**104/104 字节一致**（52 run × report+paper），无一次猜测写入。脚本用后即删（一次性工具不入库）。
4. 终态实测：live API GET /report、/paper 均 200；`far research export --format report` 成功落盘；GUI 报告区渲染完整 55505 字符报告（10 节大纲+假设№1-№6 导航）。

**门禁**：vitest 1352 passed / 3 skipped（含新回归）；root tsc/build 绿；web build 绿；secret-scan PASS。

## 2. 其余表面走查结果（本轮）

| 表面 | 结果 |
|---|---|
| Home | PASS：居中 composer+示例 chips+最近研究；视觉评审"mature SaaS" |
| Composer | PASS：附件/DOI/Zotero/语音/模型选择齐全；禁用按钮有因 |
| Study·研究 | PASS：结论卡+阶段叙事时间线+遥测折叠 L3 |
| Study·假设 | PASS：№1-№6 排名徽章全渲染（API scorecards 6 条与 UI 一致）；证据天平发散条与关系计数一致（№2: 1支持0反例全右半绿；№4: 1:1 左红右绿各半）——早先视觉模型误报"计数不符"经 DOM+API 双重核对为误读；hyp_ id 为弱化元数据行带复制 affordance |
| Study·计划 | PASS：目标/变量/数据需求表/步骤依赖图/成本合计 $60,000 渲染正确 |
| Study·修订 | PASS（run_hzxx…）：反馈→修订 v0→v1→版本差异因果链清晰；空态文案诚实 |
| Study·核验导出 | PASS（修复后）：报告/论文双 tab 渲染+下载+第三方 verify 入口 |
| Conversations | PASS：composer 四入口+以此启动研究+审批卡说明 |
| Settings | PASS：provider 密钥状态三态明确（内置默认/未配置/已封禁） |
| CLI | PASS：--json/人类双模式、语义退出码、export/verify/status 实测通过 |
| TUI | 12/12 测试绿（readline line-mode） |

## 3. 遗留（诚实清单）
- 602 个来源快照 blob 永久丢失（gc P0 的不可逆部分）：verify 对历史 bundle 将持续 honest-failed。缓解选项（未做，需用户裁决）：retrieval 层加"按 contentHash 重取并校验"的再快照命令（需联网，非字节级保证）。
- 视觉模型对证据天平的两次误读提示：高信息密度图形建议后续补 aria 已有的文字等价物到可见层（现有 counts 文本已是等价物，暂不改）。
