# Demo: TESS Offline

> 全程离线、零 API key、零网络下载。展示确定性裁决内核 + 内容寻址证据链 + 篡改可检测。

本 demo 的 claim `C-ASTRO-0001` 是天文学（TESS-ASTRO 基准）的可证伪声明。裁决由确定性 R0–R9
内核给出，LLM 不参与。

## 运行

```bash
far demo tess-offline                                       # 实时演示（14 GV + 本 claim 裁决）
far verify examples/tess-offline/output/demo.far-proof     # 验证持久化 bundle
```

## 你会看到什么

1. **14 Golden Vectors** 经真实 R0–R9 规则树（五值裁决全部路径）
2. **端到端 demo claim**（`C-ASTRO-0001`）：
   - claim：adapter A 在 TESS-ASTRO 上 macro-F1 ≥ 0.80
   - 证伪规范：metric=`macro_f1`，threshold=0.80，`gt`
   - 观测值：0.62
   - FEC 编排 → 内核裁决 → fail-closed 密封
   - **verdict = `UNTESTED`**（reason: `NO_DECISION_PATH`）

## 为什么 verdict 是 UNTESTED？

观测 `0.62 < 0.80` 阈值，看似该 REFUTED。但本 demo 走 **legacy 路径**：不注入 `StatisticalResult`
→ R6 决策路径不触发 → 内核 **fail-closed** 给出 `UNTESTED`，绝不因为「看起来该 REFUTED」就给一个
未走完决策路径的结论。

这展示了五值裁决的诚实设计：证据不足/决策路径未走完时降级到 `UNTESTED`，而非凑一个
`CONFIRMED`/`REFUTED`。

> 对比：完整 `far demo` 的 Phase 3（`C-MMLU-A-0001`）注入真实统计（`oneSampleZTest`），R7 触发，
> 内核可达 `CONFIRMED`（再经 ASK-9 降级密封）。两者对比展示「注入统计 vs 不注入」对裁决可达性。

## 篡改检测（实测可复现）

```bash
cp -r examples/tess-offline/output/demo.far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
far verify /tmp/tampered
#   status: FAIL · tamperStatus: tampered · recomputation.node: fail · exit 7
rm -rf /tmp/tampered
```

## 诚实边界

- verdict（`UNTESTED`）由 **offline fixture** 产出，**不是真实科学裁决**。
- metric_value `0.62` 是 fixture 值，**非**真实 TESS 基准复算结果。
- 真实 TESS live 下载（lightkurve/astroquery）/ 真实 metric 重算 / 真实 GPU 属路线图
  （`NEEDS_REAL_ENV` / `NEEDS_GPU_VALIDATION`），本 demo 不触发。
- 本 demo 展示「证据链工程完整性 + 确定性裁决内核 + 防篡改密封」，**绝非**「证明科学结论为真」。

## 详细

完整结构与每文件说明见 [examples/tess-offline/README.md](../../examples/tess-offline/README.md)。
