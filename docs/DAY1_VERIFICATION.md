# Day-1 实测验证（E1–E6）

> **Scope**: 竞赛提交前必须由人类 / 真实环境完成的 day-1 实测项。
> **权威 SSOT**: `FINAL_PACKAGE/30_FINAL_CHECKLIST.md §4`（Day-1 六项实测）、
> `HANDOFF_TO_DEV_AGENT.md §5.3`、`02_CONSTRAINTS_AND_RED_LINES.md §7.4/§7.5/§10`。
> **反幻觉最高元规则（02 §10）**: 每项声称须二选一标注 `[已实证·来源·日期]` 或 `[须day-1核验·方法]`；编造即违反。

---

## 状态词表（02 §7.4 · 全包强制使用）

`NEEDS_REAL_ENV`（需真实环境/密钥）· `NEEDS_REAL_TEST`（需真实调用验证）·
`NEEDS_HUMAN_OPERATION`（需人工操作·如截图归档）· `NEEDS_GPU_VALIDATION`（需 GPU）·
`DO_NOT_CLAIM_AS_DONE`（禁称已完成）· `已存在/已设计/待实现/待实测`。

## Ask 层（02 §7.5 · 9 类必须停下问人）

改 Schema / 改依赖 / **改 CI** / 改部署 / 改环境变量 / 删文件 / 重命名 / 付费 API 调用 / 人类官方科学背书（含 CONFIRMED verdict 终审）。

> **CI 接线边界**：E1/E6 smoke 接入 `.github/workflows/` 属"改 CI"（Ask 层）。
> 本文档提供**人工可运行脚手架**（不接 workflow），CI 接线列为 Ask 层建议项（见 §Ask）。

---

## E1 · Snapshot Liveness + Qwen 维护期

| 字段 | 值 |
|---|---|
| **要求** | `GET /v1/models` 确认 `qwen3.7-max-2026-05-20` 在线；确认 ~2026-07-08 维护期不阻塞 |
| **状态词** | `NEEDS_REAL_ENV` |
| **脚手架** | `ci/snapshot_liveness_smoke.ts`（已建·CI STEP 13 计划位） |
| **运行** | `set DASHSCOPE_API_KEY=sk-xxx && pnpm exec tsx ci/snapshot_liveness_smoke.ts` |
| **期望** | `SNAPSHOT_LIVENESS_SMOKE: OK`（snapshot id 在 `data[].id` 列表中） |
| **当前诚实状态** | `[须day-1核验·E1]` 脚手架已建；无 API key 时 graceful skip（exit 0）—— **skip ≠ 通过**。维护期半项无自动检测（人工读响应/控制台）。 |

### 维护期风险（L3 · `30_FINAL_CHECKLIST.md:117`）

Qwen 维护期 ~2026-07-08 vs 提交 2026-09-05：若 snapshot 下线，所有 golden hex 须重算（E4 + R14 叠加风险）。
**缓解**：FallbackChain（`src/llm_gateway/fallback_chain/`，3 元素 Qwen-only 链 `qwen3.7-max → qwen3-235b-a22b → qwen-plus`·evo-01 已删 deepseek 第4档）已就绪可全测；三档全失败 → verdict=UNTESTED + reason=no_qwen_family_available（绝不切非国产基座）。

---

## E2 · dashscopeRequestId 字段名实测

| 字段 | 值 |
|---|---|
| **要求** | `curl -i` 真实测试，消歧三候选：`x-request-id` header / body `request_id` / `response.id` |
| **状态词** | `NEEDS_REAL_TEST` |
| **脚手架** | `src/llm_gateway/adapters/aliyun_qwen/extract_request_id.ts`（设计锁定 `x-request-id` → fallback `_request_id`/`request_id`/`id`） |
| **运行** | 配 API key 后用 `competition_qwen_smoke` 触发真实调用，观察响应 header/body 锁定字段名 |
| **期望** | 字段名锁定；缺失时抛 `RequestIdMissingError` |
| **当前诚实状态** | `[须day-1核验·E2]` 字段名按 N4 设计锁定为 `x-request-id`；**三候选 `curl -i` 实测未记录**（day-1 真实调用时确认）。 |

---

## E3 · cross_lang 字节相等

| 字段 | 值 |
|---|---|
| **要求** | TS `canonicalHash` === Python `canonical_hash`（R2 最高优先闸门） |
| **状态词** | `已实证` |
| **脚手架** | `tests/evidence_log/cross_lang_consistency.test.ts` + `repro/tests/test_cross_lang_consistency.py` |
| **运行** | `pnpm test`（含 cross_lang）/ `pnpm run test:py` |
| **当前诚实状态** | `[已实证·cross_lang_consistency.test.ts·2026-06-28]` CI gate 绿。 |

---

## E4 · golden_vectors 双向回填

| 字段 | 值 |
|---|---|
| **要求** | golden_vectors 全部真实 64-hex（NaN/Infinity 拒绝契约）+ 数值边界真值对拍 |
| **状态词** | `已实证` |
| **脚手架** | `golden_vectors/generate_golden_vectors.ts` + `golden_vectors/golden_vectors.json` + `src/evidence_log/golden_vectors.ts`（NUMERIC_* SSOT） |
| **当前诚实状态** | `[已实证·E4·2026-06-29]` **R2-01/R2-02 修复后**：N4_nan_reject = `REJECTED_AS_EXPECTED`（真 NaN 数值经 `assertNoNonFiniteNumber` 抛错裁决，旧版字符串 NaN 占位已消除）；N1-N3 数值边界走 `hashCanonicalJson` 用**真数值**（`0.1+0.2`/`1e21`/`42`/`2**53+1`），与 `cross_lang_consistency.test.ts` spawnSync 对拍 TS===Python byte-equal（7 GREEN）。旧版把数值字符串化塞进 `cred.reproHash` 的反假绿违规（字符串恒 byte-equal 测不出漂移）已根除。day-0 PoC 真值发现：N1(1.0)/N3(2^53+1) 经 stdin-harness 归 GREEN（JS 值规约在序列化前完成），唯一真实跨语言序列化格式差异 = N2b 指数零填充（TS `1e-7` vs Py `1e-07`），锁定为 V3 RFC 8785 JCS 迁移回归基线。`canonicalHash` 信任根（cred 全 string）byte-equal 不受影响。 |

---

## E5 · ProofEnvelope 导出可重算

| 字段 | 值 |
|---|---|
| **要求** | .far-proof 8 文件可导出 + proofHash 字节级重算 |
| **状态词** | `已实证` |
| **脚手架** | `scripts/replay_demo_chain.ts` + `scripts/recompute_proof_hashes.ts` |
| **运行** | `pnpm exec tsx scripts/replay_demo_chain.ts` |
| **当前诚实状态** | `[已实证·demo_chain_replay.test.ts·2026-06-28]` 8 测试绿；machine verdict REFUTED + sealed REFUTED；proofHash 重算字节相等。 |

---

## E6 · 竞赛真实计费调用 + 成本快照

| 字段 | 值 |
|---|---|
| **要求** | `competition_qwen_smoke` 真实计费调用 + 百炼控制台截图（含 request_id + 成本，脱敏归档） |
| **状态词** | `NEEDS_HUMAN_OPERATION`（截图归档人工步骤） + `NEEDS_REAL_ENV`（计费调用） |
| **脚手架** | `ci/competition_qwen_smoke.ts`（4 模型真实调用 + R1 互斥实测）+ `scripts/generate_cost_snapshot.mjs`（成本快照格式生成器·`__redacted__` 占位） |
| **运行** | `set DASHSCOPE_API_KEY=sk-xxx && pnpm exec tsx ci/competition_qwen_smoke.ts` → `node scripts/generate_cost_snapshot.mjs` |
| **期望** | smoke `OK`；`evidence/dashscope_calls/YYYY-MM-DD_cost_snapshot.json` 生成（脱敏）；截图人工归档 |
| **当前诚实状态** | `[须day-1核验·E6]` smoke 脚手架已建；无 key graceful skip —— **skip ≠ 通过**（HANDOFF §5.3: CI_GREEN 声明须标注 "E6 skipped 待人工"，否则假绿）。成本快照生成器已建（格式合规·待真实 token 数回填）。截图归档纯人工。 |

### Cost Snapshot 格式（`SECURITY.md §88-99`）

- **位置**: `evidence/dashscope_calls/YYYY-MM-DD_cost_snapshot.json`
- **必填字段**: `date`, `model_id`, `request_count`, `total_tokens`, `verdict`
- **禁填字段**（防泄露计费）: `unit_price`, `total_cost_rmb`, `account_balance`, `quota_remaining`
- **占位**: 任何可暴露定价的数值字段用 `__redacted__`

---

## §Ask · CI 接线建议项（Ask 层·须用户确认）

以下属"改 CI"（02 §7.5 Ask 层），**未自主执行**，列为建议：

1. **E1 → workflow scheduled job**：`ci/snapshot_liveness_smoke.ts` 作为 `workflow_dispatch`/schedule job（10_CI_pipeline §0 ⑧ STEP 13）。
2. **E6 → workflow conditional gate**：`ci/competition_qwen_smoke.ts` 作为 `if: secrets.DASHSCOPE_API_KEY != ''` 条件门，且 skip 时须显式标注 "E6 skipped 待人工"（HANDOFF §5.3）。
3. **golden_vectors N4 契约裁决**：E4 NaN 拒绝契约设计决策（可能需 canonical hash 层改动）。

---

## 运行全部 day-1 脚手架（人工）

```powershell
# 一键编排：跑可用检查 + 诚实报告 NEEDS_* 状态（绝不假绿）
node scripts/day1_verify.mjs

# 配 key 后跑真实 smoke
$env:DASHSCOPE_API_KEY = "sk-xxx"
node scripts/day1_verify.mjs
pnpm exec tsx ci/snapshot_liveness_smoke.ts
pnpm exec tsx ci/competition_qwen_smoke.ts
node scripts/generate_cost_snapshot.mjs
```

> **诚实铁律**：day-1 项的 `SKIP` 永远不等于 `PASS`。任何声称"day-1 通过"须配 `[已实证·来源·日期]` 证据；否则标 `[须day-1核验·方法]`。
