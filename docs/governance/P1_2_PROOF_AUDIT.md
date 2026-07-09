# P1-2 Proof Audit（classifySdkTransportError 认证路径核查）

> 2026-07-08 agent 核查。本文件记录 P1-2（fallback chain SDK transport 错误分类）的诚实证明路径，
> 不修改 §C 表格（CODEOWNERS 保护），仅向 maintainer 提供认证所需的实证与建议。

## 背景

DEPTH_LEDGER §C P1-2 行 `single_real_dependency = executeFallbackChain 接 loop_runner / qwen_vl_adapter，真实 429/5xx/timeout 穿透`，`proof_test = tests/llm_gateway/fallback_real_http.test.ts::real_429穿透_fallback_chain`，`status = WIRED_RED`。

本审计回答：fallback_real_http.test.ts 是否是 classifySdkTransportError（P1-2 接线 commit `c0482f5` 的核心改动）的 RED→GREEN 证明？

## 实证（worktree 双跑，2026-07-08）

构造受控突变基线（`evidence/red-wave7-fallback` 分支 @ `c2fffef`，基于 `c0482f5` 移除 `classifySdkTransportError` 调用分支 4 行），在 `f497605`（HEAD，含 _request_id 修复）基础上临时移除同一调用点，隔离观察两类测试：

| 测试 | 有 classifySdkTransportError | 无 classifySdkTransportError | 结论 |
|------|------------------------------|------------------------------|------|
| `fallback_chain.test.ts::APIConnectionError → fallback (network)` | PASS | **FAIL**（actual:false expected:true） | **干净 RED→GREEN** |
| `fallback_chain.test.ts::APIConnectionTimeoutError → fallback (timeout)` | PASS | **FAIL** | **干净 RED→GREEN** |
| `fallback_real_http.test.ts::real_429穿透_fallback_chain` | PASS | **PASS** | **GREEN→GREEN**（不依赖 classifySdkTransportError） |

### 为何 fallback_real_http 是 GREEN→GREEN

`fallback_real_http` 用本地 OpenAI-compatible server 吐真实 HTTP 429。openai SDK 把 429 包成带数值 `status` 的错误 → `readNumericStatus` 命中 → `classifyStatus(429)` → fallback。该路径**先于** classifySdkTransportError 存在（classifyStatus 在 error_classifier.ts:91）。classifySdkTransportError 处理的是 `status=undefined` 的 transport 错误（APIConnectionError/FetchError/AbortError + ECONNRESET 等网络码），与 429 status 路径正交。

故 fallback_real_http 证明的是 **executeFallbackChain 429-fallback 接线（pre-existing）+ _request_id 提取（P1-3，a6418cb）**，非 classifySdkTransportError。

## 建议（maintainer action，§C CODEOWNERS 保护）

1. 将 §C P1-2 行 `proof_test` 由 `fallback_real_http.test.ts::real_429穿透_fallback_chain` 改为 transport-error 单元测试之一：
   - `tests/llm_gateway/fallback_chain.test.ts::classifier: OpenAI SDK APIConnectionError with status undefined → fallback (network)`，或
   - `tests/llm_gateway/fallback_chain.test.ts::classifier: OpenAI SDK APIConnectionTimeoutError with status undefined → fallback (timeout)`
2. 之后 CI keystone bot（`scripts/depth_evidence.mjs`）可用 `--base c2fffef --head c0482f5 --only P1-2` 双跑写回 WIRED_GREEN（base 2 FAIL / head 2 PASS 已本地实证）。

## 边界声明

- 本审计**未**修改 §C 表格（CODEOWNERS 保护）。
- 本审计**未**手填 WIRED_GREEN（§D CHECK-L2 禁止 agent 手填）。
- `c2fffef` 受控突变基线为本地分支 `evidence/red-wave7-fallback`，未推送（待 §C 校正后由 maintainer 决定推送 / CI 配置）。
- fallback_real_http.test.ts 仍是合法的 **executeFallbackChain 真实 HTTP 集成证明**（real SDK chat.completions + real 429），只是它证明的对象不是 classifySdkTransportError。
