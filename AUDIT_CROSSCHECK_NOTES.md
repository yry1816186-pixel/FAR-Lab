# 终极对抗审视 · 主 agent 交叉核实笔记（WIP）

> 用途：防 context compact 丢失。主 agent 独立核实的关键发现，用于交叉验证 Workflow 产出。
> 日期：2026-07-01（Explore + Grep 实测）

## 1. snapshot 时间风险（⚠️ 修正：07-08 是文档虚构日期，非代码约束）

**代码层真相**（`src/llm_gateway/adapters/aliyun_qwen/snapshot.ts:19-20`）：
```ts
export const COMPETITION_MODEL_SNAPSHOT_STATUS =
  '[verified_live: web search confirmed qwen3.7-max-2026-05-20 available on DashScope as of 2026-06-27]';
```
- snapshot.ts **无 "07-08" 字面量**，只有 "2026-06-27 verified_live"（团队 web search 确认该时点在线）。
- "~2026-07-08 维护期" 仅出现在 `ci/snapshot_liveness_smoke.ts:7` + `docs/DAY1_VERIFICATION.md:38`——**团队自己写的预期日期，无百炼官方来源**。

**裁决（修正）**：
- snapshot **下线风险真实**（任何托管模型都可能下线；06-27 verified_live 不能保证 09-05 提交时仍在线；若下线所有 golden hex 须重算）——保留为风险。
- 但 "**07-08 过期**" **具体日期是文档虚构**（无权威来源）——这是 W0 真相统一要订正的 overclaim。RR-7 措辞应改为"snapshot 下线风险（团队 06-27 verified_live，无官方维护期承诺；须竞赛周前 day-1 复核）"，删去无来源的 07-08 具体日期。
- **这是 FI-10 真相统一的元层面演示**：连"定时炸弹日期"都是文档漂移，反 theter 项目自爆此点本身就是护城河。
- `golden_vectors.ts:214` / `golden_vectors.py:220`：isoTs_ms_string 向量 timestamp = `2026-07-08T12:00:00.123Z`（测 ms 精度序列化的测试数据，与"维护期"无关，巧合同日）。

## 2. "Core 中立" overclaim（07§6.3 C1 字面为假）

07§6.3 C1 声称"Core 目录 grep `qwen|dashscope|bailian` = 0 命中"。实测（信任根核心目录）：

| 目录 | 命中 | 性质 |
|---|---|---|
| `src/fec/` | **0 命中** | 真干净（FEC 真模型中立） |
| `src/evidence_log/`（L0 信任根！） | 多处 | 见下 |
| `src/falsifiability/`（L2 信任根！） | 多处 | 见下 |

**L0 evidence_log 硬编码 `competition_aliyun_qwen`（含 qwen 子串）**：
- `repository.ts:260` `if (options.providerProfile !== 'competition_aliyun_qwen')`
- `repository.ts:265` `'evidence_log.appendRecord: competition_aliyun_qwen requires an explicit competitionModelSnapshot'`
- `llm_record.ts:112` `if (response.credential.providerProfile !== 'competition_aliyun_qwen')`
- `golden_vectors.ts:38/55/72/89/106/123/140/157/174` `modelId: 'qwen3.7-max-2026-05-20'`（9 处）
- `dashscopeRequestId` 字段（types.ts:8/22/80, verifier.ts:16, repository.ts 多处, llm_record.ts）——**冻结 SSOT 字段名 by design，可辩护**

**L2 falsifiability 硬编码 + 注释撒谎**：
- `external_facts.ts:26` `response.credential.providerProfile === 'competition_aliyun_qwen'`
- **`contracts.ts:13` 注释：`* 模型中立: 不含 qwen/dashscope/bailian 字面量.`** ← 同目录 external_facts.ts:26 就硬编码了，**注释与代码矛盾**

**精确订正建议**：
- C1 字面声称"Core 目录 grep qwen=0"=假。改为"Core 算法（canonicalHash/verdict_mapping/appendRecord 的哈希与裁决逻辑）模型中立；但 L0/L2 核心模块含 `competition_aliyun_qwen` profile 钩子（厂商特定约束的分发点，非算法依赖）"。
- 删除/订正 `falsifiability/contracts.ts:13` 注释（注释撒谎违反反幻觉铁律）。
- 灵魂时刻⑥（53§3）口播"模型可插拔信任根一字节不改"=overclaim：换 DeepSeek 时 `repository.ts:260` 等条件分支不命中，competitionModelSnapshot 强制约束失效，行为变。字节不变 ≠ 行为不变。需降级措辞。

## 3. 六灵魂时刻当前可演性（53§3）

| 灵魂时刻 | 依赖 | 当前可演？ |
|---|---|---|
| ① 跨语言字节相等 + 1e-7 鸿沟 | hasher.ts + canonical_json.py（已落地） | ✅ 真能演 |
| ② INCONCLUSIVE 诚实落地 | verdict.ts + 0008 trigger（已落地） | ✅ 真能演 |
| ③ Tamper Theatre | merkle.ts + SuiteVerifier（已落地） | ✅ 真能演 |
| ④ Arena 看 AI 抓 AI 作弊 | FI-2（packages/arena 不存在） | ❌ 待实现 |
| ⑤ fresh-clone 评委亲手验 | FI-9 + FI-1 CLI（均未实现） | ❌ 待实现 |
| ⑥ 国产基座凭证墙 | overclaim（见 §2） | ⚠️ 措辞需降级 |

**当前真能演的只有 3/6**。④⑤ 是 wow 主秀 + 分水岭，却都待实现。

## 4. packages/ 路径虚构（与 far-chain/ 同类）

54§2 架构图 + 43-57 多处声称 `packages/cli|arena|court|domains|wasm-verifier|timemachine|verifier-protocol|status/`，实测 packages/ 目录不存在，代码在单一 src/ 扁平结构。这是 far-chain/ 路径虚构的同类问题（W0 范畴，但 56§2.2 只订正了 far-chain/，漏了 packages/）。

## 5. 待核实（Workflow 跑后交叉验证）
- proof_envelope RULE 实际数量（57§3.3 声称仅 RULE-PE-001..009）
- src/ catch 空块（零容忍#3）
- appendRecord 并发原子性（prevHash 竞态）
- better-sqlite3 fresh-clone native 编译（非 Linux prebuilt）
