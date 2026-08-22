# Wave-7 fusion execution evidence — W7-F1/F2/F3 (2026-08-22)

## 融合项与决策

- **W7-F1 jsonrepair EXTRACT**（D-044）：`src/providers/json-repair.ts` = jsonrepair 3.15.0（ISC, Jos de Jong）regular 递归下降版忠实 TS 移植（~700 行，零依赖，attribution 在文件头）；`extractJsonText` 四层链 = direct → fence-strip → legacy 引号扫描 → 引擎。
- **W7-F2 截断纪律**：`finishReason==='length'` → `allowRepair:false`（引擎截断补全不得验收——防伪造未完成内容）+ `appendTruncationCorrection` 专用"更简洁完整重问"；两条 invalid_output 失败消息带截断标注。
- **W7-F3 DashScope max_tokens 剥离**：百炼官方结构化输出文档逐字警告（max_tokens → 截断无效 JSON）。

## 验证证据（全部命令级）

1. **Oracle 等价（80 例逐字节）**：上游包本地执行产 `spikes/output/json-repair-oracle.json`（80 例，78 修 2 抛）→ `tests/json-repair.test.ts` 断言 TS 移植版输出与上游逐字节一致（含两个 throw 例）——**86/86 绿**（`npx vitest run tests/json-repair.test.ts`）。
2. **live 语料**：`spikes/output/strict-fc-corrupted-args.json`（24k 真实损坏 tool args）——单对内引号摘录经 legacy 层修复且内容逐字保持；**全样本（冒号后内引号歧义类）两层都正确拒绝**（上游亦抛 "Object key expected"@5501，spikes/json-repair-live-sample.mjs 实证）→ 纠正性重问兜底（0d1706e 纪律）。
3. **属性 fuzz**：`spikes/json-repair-fuzz.mjs`（单对 400 例）+ `json-repair-fuzz2.mjs`（多对 396 例）：legacy 796/796 精确意图修复、引擎 794/796（2 例邻接双引号 `c""lonal` 抛出——legacy 层保留的实证依据）、**0 内容失真**。
4. **基准 before/after（同语料同口径）**：`spikes/json-repair-benchmark.mjs` → `evidence/W7/repair-benchmark.{md,json}`：损坏修复 **9/68 → 68/68**；live 类 192/192 双保持（192/192 精确意图）；合法文档 4/4 直通不变；24k 最坏路径延迟 0.93→1.39ms/次（对 strict-FC e2e ≤2s 预算可忽略；传输路径零改动）。
5. **Mutation 抽查**：`spikes/mutation-check.mjs`——M1 legacy 转义分支破坏 / M2 截断门失效 / M3 引擎 R10 补全移除 → **三突变全 CAUGHT**（exit 0；期间发现并修复抽查工具自身的命令构造缺陷，如实记录）。
6. **截断纪律测试**：`tests/providers.test.ts` 4 例——截断不验收+TRUNCATED 重问、完整 JSON 带 length 仍直通验收、无截断标志同形状经引擎修复验收、预算内 4 次调用后显式失败。
7. **DashScope 测试**：maxTokens=8192 请求体断言 `max_tokens` 不出现。
8. **区间绿**：`npx vitest run tests/json-repair.test.ts tests/providers.test.ts tests/llm-tolerance.test.ts` = **157/157**；`npm run typecheck` exit 0（我区文件）。

## 诚实边界

- **live e2e BLOCKED**：wave 开启单探针 `spikes/model-spike/runs/2026-08-22T02-38-26-825Z-deepseek.json`（HTTP 402 Insufficient Balance 逐字）——D-036 维持；修复层/截断纪律/DashScope 剥离的 live 验证记为债务（路由恢复后按 D-026 模板补验）。
- **finishReason 缺失的 provider**（不报 finish_reason 的兼容端点）走全修复链——引擎补全可验收。DeepSeek/zai/dashscope 均上报 finish_reason（D-030 41/41 实证），该默认的残余披露在此。
- 全仓 `npm run build` 被并行会话在途编辑阻塞（src/pipeline/stages/falsify.ts W5-F5 未完成，TS2554）——非本 Wave 文件；dist 不入库，我的收口提交不携带 dist，构建债务归属该会话。
- 子 Agent 侦察全灭（ZCode 账户级限速 1302）——侦察五线由主 Agent 亲读亲测完成，instructor 报告为阵亡 Agent 完整遗留稿（file:line 抽验通过）；四家约束解码库为 license 核验+适用性判定（深钻诚实缓延，触发条件在案）。
