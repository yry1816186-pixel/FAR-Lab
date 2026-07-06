# FEC 示例契约（`far fec compile` / `freeze`）

本目录提供一个**合法的 Falsification Evidence Contract V2 (FEC)** 示例，供 `far fec compile` / `far fec freeze` 直接使用。

## 文件

| 文件 | 说明 |
|------|------|
| `sample_fec_contract.json` | C-ASTRO-0001 的可证伪契约（macro-F1 ≥ 0.80 阈值）—— 由 `makeLegacyCompatFec` 序列化的真实契约，**保证通过 `parseFecContract` 校验** |

## 用法

```bash
# 1. 编译：跑 10 项编译检查（#1-#10）+ 重算 fecHash
far fec compile --claim examples/fec/sample_fec_contract.json --out examples/fec/sample_compiled.json
# → far fec compile: FEC-LEGACY-C-ASTRO-0001 → examples/fec/sample_compiled.json (fecHash=f20933daca90…)

# 2. 冻结校验：重算 fecHash 与存储值比对（防篡改·CLAUDE.md §5 RR-1 禁手填 hash）
far fec freeze --fec examples/fec/sample_compiled.json
# → far fec freeze: PASS (fecHash=f20933daca90…)
```

`sample_compiled.json` 是生成产物（已 gitignore），由上述命令产出，不要手填其 `fecHash`——`far fec freeze` 会真实重算并比对。

## 契约 schema

FEC V2 契约字段见 `src/fec/fec_contract.ts`（`APPENDIX_A §2` 对齐）。核心字段：

- `fecId` / `claimId` — 契约与声明标识
- `scope` — 有界维度（population / timeWindow / domainConstraint·缺则 `SCOPE_UNBOUNDED`）
- `metric` / `threshold` / `direction` — 可证伪阈值
- `statisticalPlan` — 10 项必填（alpha / nullHypothesis / effectDirection / …·缺则 `STAT_PLAN_MISSING`）
- `seedPolicy` / `deviationPolicy` / `freeze` / `integrityFlags` — 可复现与完整性约束

编译失败的 reasonCode 对应内核 R1/R3/R5/R8（见 `src/fec/compiler.ts`）。
