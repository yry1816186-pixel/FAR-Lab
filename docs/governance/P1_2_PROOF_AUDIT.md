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

1. 已补强 §C P1-2 proof_test 为 `tests/llm_gateway/fallback_real_http.test.ts::real_transport_error穿透_fallback_chain`：本地 OpenAI-compatible server 在 primary 请求后直接断开 socket，让 OpenAI SDK 抛 `APIConnectionError`/`status=undefined`，再由真实 fallback chain 进入 backup。
2. CI keystone bot 仍须用受控突变基线双跑写回 WIRED_GREEN；本审计不手填 §C 完成态。

## 边界声明

- 本审计**未**修改 §C 表格（CODEOWNERS 保护）。
- 本审计**未**手填 WIRED_GREEN（§D CHECK-L2 禁止 agent 手填）。
- `c2fffef` 受控突变基线为本地分支 `evidence/red-wave7-fallback`，未推送（待 §C 校正后由 maintainer 决定推送 / CI 配置）。
- fallback_real_http.test.ts 仍是合法的 **executeFallbackChain 真实 HTTP 集成证明**（real SDK chat.completions + real 429），只是它证明的对象不是 classifySdkTransportError。
