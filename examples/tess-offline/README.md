# Example: TESS Offline Demo (`C-ASTRO-0001`)

> 一个**全程离线、无需任何 API key、无需网络下载**的可验证 demo。
> 展示 FAR-Chain 的三个核心价值：**确定性五值裁决内核**、**内容寻址证据链**、**篡改可检测**。

本 demo 的 claim（`C-ASTRO-0001`）是天文学领域的基准声明。裁决由确定性 R0–R9 内核给出，**LLM 不参与裁决**。
真实 TESS live 数据下载（`lightkurve`/`astroquery`）属 P1-6 路线（`NEEDS_REAL_ENV`），本 demo 不触发任何外部调用。

---

## 1. 一键运行

```bash
far demo tess-offline                                       # 实时演示（14 GV + 本 claim 裁决）
far verify examples/tess-offline/output/demo.far-proof     # 第三方独立重算验证持久化 bundle
```

`far demo tess-offline` 每次实时重跑裁决内核；`output/demo.far-proof/` 是**预先导出、可独立复算**的持久化证据包（commit 入库，供 `far verify` 离线复核）。

---

## 2. Claim（声明）

| 字段 | 值 |
|------|-----|
| claimId | `C-ASTRO-0001` |
| claimText | adapter A achieves macro-F1 >= 0.80 on TESS-ASTRO benchmark |
| metric | `macro_f1` |
| threshold | `0.80`（semantics: `gt`） |
| sourceAnchor | `tess_astro/adapter_a.py:42` |

一个声明要被接纳，**必须携带可执行的证伪规范**（falsificationSpec）：预测什么、用什么指标测、阈值与比较方向。无证伪规范的声明在入口即被拒。

---

## 3. Evidence（证据）

| 字段 | 值 |
|------|-----|
| observedMetricValue | `0.62` |
| conflicting_evidence_count | 0 |
| evidence_id | `01KX0M2P5A17FRWTX0C3FPGH55` |

证据按 SHA-256 内容寻址落库，append-only 触发器防止篡改。证据节点含 `current_hash` / `prev_hash`，形成哈希链。

---

## 4. Verdict（裁决）

| 字段 | 值 |
|------|-----|
| machineVerdict | **`UNTESTED`** |
| untestedReason | `NO_DECISION_PATH` |
| decisiveRuleId | —（R6 决策路径未触发） |

**为什么是 UNTESTED 而非 REFUTED？** 观测值 `0.62 < 0.80` 阈值，看似应 REFUTED。但本 demo 走 **legacy 路径**：不注入 `StatisticalResult` → R6 决策路径不触发 → 内核 **fail-closed** 给出 `UNTESTED`，**绝不**因为"看起来该 REFUTED"就给一个未走完决策路径的结论。

这正是五值裁决的诚实设计：证据不足 / 决策路径未走完时，降级到 `UNTESTED`，而不是凑一个 `CONFIRMED`/`REFUTED`。

> 对比：完整 `far demo` 的 Phase 3（`C-MMLU-A-0001`）注入真实统计（`oneSampleZTest`），R7 触发，内核可达 `CONFIRMED`（再经 ASK-9 降级密封）。两者对比展示了"注入统计 vs 不注入"对裁决可达性的影响。

五值枚举固定：`CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`（优先级 `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`，禁第六值）。

---

## 5. `.far-proof` bundle 结构（`output/demo.far-proof/`）

`far export far-proof --demo-chain` 生成 V1 self-verifiable 离线包（10 文件）：

| 文件 | 作用 |
|------|------|
| `claim_graph.json` | claim + evidence 节点（含哈希链） |
| `proof_envelopes.jsonl` | sealed verdict（proofHash 覆盖） |
| `call_records.redacted.jsonl` | LLM 调用记录（脱敏） |
| `repro_runs.jsonl` | 复算运行记录 |
| `data_manifest.json` | 数据指纹清单 |
| `ro-crate-metadata.json` | RO-Crate 元数据（标准 provenance） |
| `prov.ttl` | PROV-O RDF provenance |
| `otel-trace.jsonl` | OpenTelemetry trace |
| `code/MANIFEST.md` | 代码清单 |
| `README_REPLAY.md` | 重放说明 |

**诚实边界**：V1 是 self-verifiable bundle（proofHash + redacted chain + 第三方 node 重算），**不是**外部 RO-Crate/PROV-O 认证机构签发。

---

## 6. verify 输出（clean · 未篡改）

```
far verify examples/tess-offline/output/demo.far-proof

  status               : WARN          ← WARN 而非 PASS：python/browser 重算轴 not-run（环境依赖），node 轴 pass
  tamperStatus         : clean         ← 未检出篡改
  recomputation.node   : pass          ← 第三方独立重算 proofHash 通过
  recomputation.python : not-run       ← 需 Python + sympy（pip install -e .）
  recomputation.browser: not-run       ← Phase 2 / #13 未接入
  verifiedLevels       : bundle, chain, proofEnvelope
  exit: 0
```

`status: WARN` 是诚实的：node 重算轴 `pass` + `tamperStatus: clean` 已证明核心完整性；python/browser 轴按环境能力 skip，**不伪造通过**。

---

## 7. Tamper Detection（篡改检测 · 实测可复现）

篡改 bundle 内**任何被 proofHash 覆盖的内容**，`far verify` 立即检出并 FAIL。以下命令已实测：

```bash
# 复制一份用于篡改（不破坏原 fixture）
cp -r examples/tess-offline/output/demo.far-proof /tmp/tampered

# 篡改：把 sealed verdict 从 UNTESTED 改成 CONFIRMED
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl

# 验证 → 立即检出篡改
far verify /tmp/tampered
#   status               : FAIL
#   tamperStatus         : tampered
#   recomputation.node   : fail        ← 重算 proofHash 与文件内容不一致
#   exit: 7

rm -rf /tmp/tampered
```

机制：`proofHash` 是对 canonical JSON 的 SHA-256。任何字节级改动 → 重算哈希 ≠ 存储哈希 → `tampered` / exit 7。这是 fail-closed 红线：**被篡改的证明永远无法通过验证**。

---

## 8. 诚实边界

- 本 demo 的 verdict（`UNTESTED`）由 **offline fixture** 产出，**不是真实科学裁决**。
- metric_value `0.62` 是 demo fixture 值，**不是**真实 TESS 基准复算结果。
- 真实 TESS live 下载 / 真实 metric 重算 / 真实 GPU 属路线图（`NEEDS_REAL_ENV` / `NEEDS_GPU_VALIDATION`），本 demo **不**触发。
- 本 demo 展示的是**证据链工程完整性 + 确定性裁决内核 + 防篡改密封**，**绝非**「证明科学结论为真」。

---

## 相关

- 概念：[`docs/concepts/far-proof.md`](../../docs/concepts/far-proof.md)、[`docs/concepts/evidence-ledger.md`](../../docs/concepts/evidence-ledger.md)
- 完整 demo（含 MMLU hero）：`far demo`
- 导出新 bundle：`far export far-proof --demo-chain --out <dir>`
