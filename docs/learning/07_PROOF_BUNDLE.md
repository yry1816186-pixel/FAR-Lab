# 07 · 证明包：`.far-proof` 导出、独立验证、篡改检测

> 学习目标：理解"可移植证明包"解决什么问题；掌握 `.far-proof` 的 13 个
> 组成文件各是什么；完整走一遍 导出→独立验证→篡改→拒绝 的实验；
> 理解"第三方独立重算"的确切含义。
> 前置：06。产出：能解释 integrity.json / proofHash / RO-Crate 的关系。
> 动手：本实验完全离线，无需任何凭据。

---

## 7.1 问题：verdict 如何被第三方信任？

FAR-Lab 判完一条 claim，怎么让**不信任 FAR-Lab 的人**验证结论？

- 只给结论？不行——无法复核。
- 给数据库？不行——数据库在 FAR-Lab 手里，可以改。
- 给一份**自包含、自校验、可独立重算**的包？对——这就是 `.far-proof`。

关键属性：
1. **可移植**：一个目录，拷到任何机器都能验证（Windows/macOS/Linux/Docker）。
2. **自校验**：包内 integrity.json 是全部文件的 SHA-256 清单——任何字节改动
   立即失配。
3. **可独立重算**：验证者不需要信任包内任何数字——用公开算法重算
   proofHash，与包内存储值比对。一致 = 真实，不一致 = 篡改。

## 7.2 包结构（实测导出，13 个文件）

```bash
node src/cli/far.ts export far-proof --demo-chain --force
# → ./.far-proof/（默认输出，--out 可改）
```

| 文件 | 内容 | 验证中的作用 |
|---|---|---|
| `proof_envelopes.jsonl` | 核心：封签后的 verdict 记录（claim → verdict → proofHash） | 重算 proofHash 的输入之一 |
| `call_records.redacted.jsonl` | LLM 调用记录（脱敏版） | 证明"LLM 只生成，不裁决"的证据 |
| `claim_graph.json` | claim 依赖图 | 结构完整性 |
| `repro_runs.jsonl` | 复现运行记录 | 复现轨迹 |
| `lifecycle_events.jsonl` | 生命周期事件（墓碑） | 重放事件链 |
| `otel-trace.jsonl` | OpenTelemetry 跟踪 | 可观测性 |
| `prov.ttl` | W3C PROV-O 溯源（Turtle 格式） | 标准互操作 |
| `ro-crate-metadata.json` | RO-Crate 1.1 元数据 | 标准互操作 |
| `data_manifest.json` | 数据清单 | 数据完整性 |
| `code/` | 封存的复现代码 | 可重算性 |
| `figures/` | 图表 | 报告完整性 |
| `integrity.json` | **全部文件的 SHA-256 清单**（不含自身） | 字节级篡改检测 |
| `README_REPLAY.md` | 重放说明 | 人工指引 |

> 学习点：`prov.ttl` + `ro-crate-metadata.json` 不是装饰——FAR-Lab 明确
> 定位为"验证层"，必须能**输出到学界已有的溯源标准**（W3C PROV-O /
> RO-Crate），才能被现有科研工具链消费。这就是"面向真实生产"的一个体现。

## 7.3 验证流程（独立重算的确切含义）

`far verify <dir>`（`src/far_proof/bundle_verifier.ts`）做什么：

1. **结构门**：检查 13 个必需文件存在（`FAR_PROOF_REQUIRED_FILES`）。
2. **字节门**：重算每个文件的 SHA-256，与 `integrity.json` 比对
   （`verifyFarProofPackageIntegrity`）。
3. **重算门**：用公开算法从 `proof_envelopes.jsonl` 重算 proofHash，
   与包内存储值比对（`verifyProofEnvelopeJsonl`）。
4. **链门**：重放 `call_records.redacted.jsonl` 的哈希链
   （`verifyRedactedCallRecordsJsonl`）+ 生命周期事件链。
5. **汇总**：tamperStatus（clean/tampered）+ recomputation.node（pass/fail）。

退出码契约：`0` = 干净可验证；`7` = 篡改/缺失（fail-closed）。

## 7.4 篡改检测实验（本路线的核心体验）

```bash
# 1. 导出
node src/cli/far.ts export far-proof --demo-chain --force

# 2. 验证（应该 clean / exit 0）
node src/cli/far.ts verify .far-proof

# 3. 篡改：把 UNTESTED 改成 CONFIRMED（Windows PowerShell 7+）
New-Item -ItemType Directory -Force tampered | Out-Null
Copy-Item -Recurse .far-proof tampered
(Get-Content tampered/proof_envelopes.jsonl) -replace 'UNTESTED','CONFIRMED' | Set-Content tampered/proof_envelopes.jsonl

# 4. 再验证（必须 tampered / exit 7）
node src/cli/far.ts verify tampered
Remove-Item -Recurse -Force tampered
```

**为什么逃不掉？** 改 `UNTESTED` → `CONFIRMED` 后：
- proofHash 重算结果 ≠ 存储值 → 重算门 FAIL
- 文件字节变了 → integrity.json 的 SHA-256 失配 → 字节门 FAIL
- 双重防线，任何一层都能抓住。

> 深度理解：篡改检测抓的是**不重算哈希的篡改**。一个攻击者如果改完内容
> 再重算所有哈希、重写 integrity.json、重算 proofHash……那是"一致伪造"，
> V1 的 keyless 链明确声明超出范围（README Known limits #9）。
> V2 用 Ed25519 签名收窄这个窗口。**知道系统不能证明什么，和知道它能
> 证明什么一样重要**——这是 FAR-Lab 的诚实原则。

## 7.5 一键脚本（hero walkthroughs）

```bash
node scripts/hero_tamper_walkthrough.mjs   # HERO-TAMPER-PLUS: 导出→验证→篡改→exit 7（≤60s）
```

脚本自带诚实标注：它证明的是"bundle 完整性 + 篡改检测 + 独立重算"，
**不是**"科学结论为真"（fixtures）。脚本失败 = Hero 失败（exit 非零）。

## 7.6 动手练习

1. 完整跑一遍 7.4 的四个步骤，记录每步的退出码。
2. 打开 `.far-proof/integrity.json`，找到 `proof_envelopes.jsonl` 的条目，
   手工重算 `sha256sum proof_envelopes.jsonl` 比对——证明清单是真的。
3. 打开 `proof_envelopes.jsonl`，找到 demo claim 的 verdict 和 proofHash 字段。
4. （进阶）`far verify` 一个**不存在的目录**，观察 exit 7 的 fail-closed 行为。
5. （进阶）导出 `far export receipt` 或 `far export receipt-v2`，对比
   receipt 和 far-proof 的结构差异。

## 自测

- [ ] 能说出 `.far-proof` 的 13 个文件里 6 个以上的作用
- [ ] 能解释 integrity.json 为什么必须排除自身
- [ ] 知道篡改检测抓什么、不抓什么（一致伪造是 V2 的事）
- [ ] 知道 prov.ttl / ro-crate-metadata.json 的意义（标准互操作）
- [ ] 记住退出码 0 与 7 的含义

→ 下一步：[08 CLI 与 API](08_CLI_AND_API.md) —— 25 个命令逐个讲 + REST API。
