# COMPARISON_TRIAL_REPORT.md — Phase 3 Task 3.3 baseline vs FAR-Chain 对比试验报告

> 6 类攻击语料在 baseline（V1 makeVerdict·绕过 FEC/V2/anti-theater）与 FAR-Chain（V2 decideFiveValueVerdict·含 FEC 门 + R0-R9 + anti-theater）下的对比试验结果。
>
> Authority: CLAUDE.md §1（PROGRESS = 真实依赖端到端接线成功）+ §5 红线（五值枚举固定 / LLM 不作最终裁决者）。
> Spec: `.trae/specs/wsl-realworld-validation-governance/tasks.md` Task 3.3。
> 测试文件: `tests/comparison/baseline_vs_far_chain.test.ts`（10/10 GREEN @ WSL Node v24.18.0）。

---

## 1. 试验设计

### 对比对象

| 路径 | 裁决函数 | file:line | 防御层 |
|---|---|---|---|
| baseline | V1 `makeVerdict` | `src/falsifiability/verdict.ts:76` | 无 FEC 门 / 无 V2 kernel / 无 anti-theater |
| FAR-Chain | V2 `decideFiveValueVerdict` | `src/falsifiability/verdict_kernel_v2.ts:253` | FEC 门（line 288 `compileFec`）+ R0-R9 规则级联 + anti-theater/protocol/identifier/form/fingerprint 门 |
| 生产路径 | `fecAppendClaim` | `src/fec/orchestrator.ts:128` | DB 事务内 `compileFec` + `enforceFecMandatoryGate` + V2 kernel + anti-theater 投影 |

### 攻击语料

6 条攻击语料（`tests/comparison/attack_corpus/*.json`），以 GV-01 为 base，通过 `kernelOverride` 深合并注入攻击语义。详见 `ATTACK_CORPUS.md`。

### 度量指标

- **detection rate** = 被检出的攻击数 / 总攻击数（verdict ≠ CONFIRMED 视为检出）
- **verdict 分布** = 各 verdict 值的攻击数分布
- **decisiveRuleId** = V2 kernel 首条决定性规则（R0-R9 固定优先级）

## 2. 核心结果：检测率对比

```
baseline detection rate: 0/6 (0.0%)
FAR-Chain detection rate: 6/6 (100.0%)
```

- **baseline 检测率 0%**：6 条攻击全部产出 CONFIRMED，V1 makeVerdict 对所有攻击维度不可见
- **FAR-Chain 检测率 100%**：6 条攻击全部被检出，V2 kernel 的 R0-R9 规则级联覆盖所有攻击维度
- **边际检测贡献 = 100% - 0% = 100%**：FEC 门 + V2 kernel + anti-theater 三层防御合计贡献 100% 检测率

## 3. verdict 分布对比表

```
========== BASELINE vs FAR-CHAIN COMPARISON ==========
attackId                          | baseline    | FAR-Chain   | decisiveRuleId                    | reasonCodes
----------------------------------------------------------------------------------------------------------------------------------------------------------------
AT-EXECUTION-FINGERPRINT-MISMATCH| CONFIRMED   | DEGRADED_SCOPE| R_EXECUTION_FINGERPRINT_MISMATCH | R_EXECUTION_FINGERPRINT_MISMATCH
AT-FORM-MISMATCH                 | CONFIRMED   | INCONCLUSIVE| R_DERIVATION_FORM_MISMATCH       | R_DERIVATION_FORM_MISMATCH
AT-IDENTIFIER-FABRICATION        | CONFIRMED   | REFUTED     | R_IDENTIFIER_FABRICATION         | UNVERIFIED_IDENTIFIER
AT-PHACK-ALPHA                   | CONFIRMED   | UNTESTED    | R3_CRITICAL_PROTOCOL_DEVIATION   | R3_CRITICAL_PROTOCOL_DEVIATION, ALPHA_REWRITE_DETECTED
AT-SCOPE-LAUNDER                 | CONFIRMED   | DEGRADED_SCOPE| R4_SCOPE_MISMATCH_NONCRITICAL    | R4_SCOPE_MISMATCH_NONCRITICAL
AT-SEED-CHERRY                   | CONFIRMED   | UNTESTED    | ANTI_THEATER_FAIL                | ANTI_THEATER_FAIL
----------------------------------------------------------------------------------------------------------------------------------------------------------------
baseline detection rate: 0/6 (0.0%)
FAR-Chain detection rate: 6/6 (100.0%)
=====================================================
```

## 4. baseline verdict 分布

| verdict | 攻击数 | 攻击 ID |
|---|---|---|
| CONFIRMED | 6 | 全部 6 条攻击 |
| REFUTED | 0 | — |
| INCONCLUSIVE | 0 | — |
| DEGRADED_SCOPE | 0 | — |
| UNTESTED | 0 | — |

baseline 对所有攻击「无差别 CONFIRMED」——V1 makeVerdict 的布尔二元模型（supportsClaim/refutesClaim 计数）无法表达 FEC / 协议偏离 / scope / identifier / derivation form / execution fingerprint 语义。

## 5. FAR-Chain verdict 分布

| verdict | 攻击数 | 攻击 ID |
|---|---|---|
| CONFIRMED | 0 | — |
| REFUTED | 1 | AT-IDENTIFIER-FABRICATION |
| INCONCLUSIVE | 1 | AT-FORM-MISMATCH |
| DEGRADED_SCOPE | 2 | AT-SCOPE-LAUNDER, AT-EXECUTION-FINGERPRINT-MISMATCH |
| UNTESTED | 2 | AT-SEED-CHERRY, AT-PHACK-ALPHA |

FAR-Chain 的五值裁决对 6 类攻击产出 4 种不同 verdict，体现五值枚举的区分度：
- **REFUTED**（最高级否定）: identifier 伪造是红线级攻击，直接 REFUTED 而非 UNTESTED（FUSION-OS-14）
- **INCONCLUSIVE**: derivation form 不匹配即无法判定，即使值相等也降级（FUSION-OS-13）
- **DEGRADED_SCOPE**: scope/执行指纹不匹配降级 scope 但不否定声明
- **UNTESTED**: anti-theater fail / 协议偏离使声明无法测试

## 6. decisiveRuleId 分布

| decisiveRuleId | 触发攻击 | V2 kernel file:line |
|---|---|---|
| `ANTI_THEATER_FAIL` | AT-SEED-CHERRY | `verdict_kernel_v2.ts:374` |
| `R3_CRITICAL_PROTOCOL_DEVIATION` | AT-PHACK-ALPHA | `verdict_kernel_v2.ts:327` |
| `R4_SCOPE_MISMATCH_NONCRITICAL` | AT-SCOPE-LAUNDER | `verdict_kernel_v2.ts:345` |
| `R_IDENTIFIER_FABRICATION` | AT-IDENTIFIER-FABRICATION | `verdict_kernel_v2.ts:410` |
| `R_DERIVATION_FORM_MISMATCH` | AT-FORM-MISMATCH | `verdict_kernel_v2.ts:433` |
| `R_EXECUTION_FINGERPRINT_MISMATCH` | AT-EXECUTION-FINGERPRINT-MISMATCH | `verdict_kernel_v2.ts:364` |

6 条攻击触发 6 个不同的 decisiveRuleId，证明 R0-R9 规则级联的 6 个独立维度全部生效，无规则冗余或遗漏。

## 7. 生产路径验证（fecAppendClaim）

除 V2 kernel 直调外，额外验证了生产路径 `fecAppendClaim` @ `src/fec/orchestrator.ts:128` 对 seed-cherry 攻击的真实事务处理：

```
✔ production path: fecAppendClaim processes seed-cherry attack via full FEC gate + V2 kernel + anti-theater (56.092046ms)
```

- `fecAppendClaim` 在 DB 事务内调 `compileFec` + `enforceFecMandatoryGate` + `decideFiveValueVerdict`
- `toKernelFindings` @ `src/anti_theater/adapters/kernel_adapter.ts` 真实投影 antiTheaterReport → kernelFindings
- 断言：`fecGate.allowed = true`（GV-01 FEC 编译成功）+ `kernelOutput.verdict = UNTESTED` + `decisiveRuleId = ANTI_THEATER_FAIL`
- 生产路径与 V2 kernel 直调结果一致，证明 `fecAppendClaim` 正确接线了 V2 kernel + anti-theater

## 8. 测试物证

```
✔ baseline path runs on all GV-01..14 (V1 makeVerdict processes every case without error) (19.219153ms)
✔ loaded 6 attack corpus files (0.082647ms)
✔ comparison: AT-EXECUTION-FINGERPRINT-MISMATCH — baseline CONFIRMED vs FAR-Chain DEGRADED_SCOPE (2.141459ms)
✔ comparison: AT-FORM-MISMATCH — baseline CONFIRMED vs FAR-Chain INCONCLUSIVE (1.257677ms)
✔ comparison: AT-IDENTIFIER-FABRICATION — baseline CONFIRMED vs FAR-Chain REFUTED (1.328657ms)
✔ comparison: AT-PHACK-ALPHA — baseline CONFIRMED vs FAR-Chain UNTESTED (1.302318ms)
✔ comparison: AT-SCOPE-LAUNDER — baseline CONFIRMED vs FAR-Chain DEGRADED_SCOPE (1.162676ms)
✔ comparison: AT-SEED-CHERRY — baseline CONFIRMED vs FAR-Chain UNTESTED (1.145323ms)
✔ production path: fecAppendClaim processes seed-cherry attack via full FEC gate + V2 kernel + anti-theater (56.092046ms)
✔ comparison summary: FAR-Chain detection rate >> baseline detection rate (0.7837ms)
ℹ tests 10
ℹ pass 10
ℹ fail 0
ℹ duration_ms 761.662774
```

10/10 测试 GREEN @ WSL Node v24.18.0。

## 9. 真实依赖声明

| 路径 | 真实依赖 | file:line | 说明 |
|---|---|---|---|
| baseline | V1 `makeVerdict` | `src/falsifiability/verdict.ts:76` | 真调·非 mock·falsifiabilityGate + evaluateThreshold + decideVerdict |
| FAR-Chain | V2 `decideFiveValueVerdict` | `src/falsifiability/verdict_kernel_v2.ts:253` | 真调·非 mock·内部调 compileFec (line 288) + R0-R9 级联 |
| 生产路径 | `fecAppendClaim` | `src/fec/orchestrator.ts:128` | 真调·DB 事务·compileFec + enforceFecMandatoryGate + V2 kernel |
| anti-theater 投影 | `toKernelFindings` | `src/anti_theater/adapters/kernel_adapter.ts` | 真调·非 mock·outcome FAIL → severity 'fail' |
| 哈希重算 | `hashCanonicalJson` + `createHash('sha256')` | `src/evidence_log/hasher.ts` + `node:crypto` | 真实 sha256 重算（baseline proofHash） |

## 10. 诚实边界

- 6 条攻击语料是自造的（非真实 AI4S 论文攻击 case），检测率 100% 是设计意图——每条攻击精确对应一个 V2 kernel 规则，验证规则的可触发性与区分度，不是真实攻击 prevalence 统计
- baseline 检测率 0% 是 V1 模型的结构性限制（无攻击维度的语义输入），不是 baseline 实现的「bug」——V1 makeVerdict 的设计目标就是简化布尔裁决，不具备检测这些攻击维度的能力
- 对比试验未测「多维度组合攻击」（如同时 seed-cherry + p-hack + scope-launder）——`kernelOverride` 深合并策略支持组合攻击，但本次试验聚焦单维度检测能力验证
- `fecAppendClaim` 生产路径只验证了 seed-cherry 用例（因 `fecAppendClaim` 硬编码 `protocolDeviations: []`，p-hack 等攻击无法通过生产路径传递 protocolDeviations）——这是生产路径的已知限制，V2 kernel 直调路径已覆盖全部 6 条攻击
- 本对比试验不证明 FAR-Chain 「检测所有攻击」——只证明 6 类已设计攻击在 FAR-Chain 下被检出。真实世界的攻击可能触发未设计的维度，FAR-Chain 的防御能力受限于 R0-R9 规则覆盖面

## 11. 红线复核

- 五值裁决枚举固定：6 条攻击触发 4 种 verdict（CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED），无第六值 ✓
- LLM 不作最终裁决者：baseline（V1 makeVerdict）与 FAR-Chain（V2 decideFiveValueVerdict）都是确定性裁决，无 LLM 参与 ✓
- 无手填裸统计数字：检测率 0%/100% 由 `baseline_vs_far_chain.test.ts` 的 `console.log` 实时输出，非手填 ✓
- 无禁用词：报告未使用「证明科学真理 / 物理不可篡改 / 完全可复现 / 全自动科学家 / 通用 AI4S benchmark / 裸第一唯一最新」 ✓
