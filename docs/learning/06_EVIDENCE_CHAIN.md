# 06 · 证据链：SHA-256 哈希链、Merkle 根、跨语言一致性

> 学习目标：理解内容寻址证据链的机制；掌握 canonical JSON 哈希为什么是
> 跨语言一致的基础；理解 Merkle 树的作用（批量校验 + inclusion proof）；
> 理解生命周期墓碑（撤回/更正）如何 append-only。
> 前置：03。产出：能解释"篡改任何字节 → 链头校验失败"的完整链路。
> 代码：`src/evidence_log/`（10 个文件）。

---

## 6.1 问题：如何让证据不可篡改？

数据库可以改、文件可以改、人可以说谎。FAR-Lab 要的是：**任何人对证据的
任何修改，都能被检测到**。方案是内容寻址：**证据的地址 = 证据内容的哈希**。

- 每条记录存 `current_hash = sha256(canonical(record + prev_hash))`
- 记录之间通过 prev_hash 串成**链**
- 链头（最新记录的 current_hash）就是整条链的摘要
- 改任何一条记录的任何一个字节 → 它的 hash 变 → 它之后所有记录的
  prev_hash 全部失配 → 链头校验失败

这就是 `canonicalHash`（`src/evidence_log/hasher.ts` L8-31）：
```
canonicalHash({stageId, cred, payloadKind, prevHash})
  = sha256( stableStringify(input) )   // UTF-8 hex
```

## 6.2 为什么需要 canonical JSON？（关键概念）

同样的内容，不同序列化可能产生不同字节：`{"a":1,"b":2}` vs `{"b":2,"a":1}`
是不同的字符串 → 不同哈希。TS 和 Python 的 JSON 序列化默认行为也不同。

FAR-Lab 用 `fast-json-stable-stringify`（按键排序的确定性序列化）：
```
canonical = stableStringify(input)   // 键按序排好，任何语言产出相同字节
hash      = sha256(canonical)
```

两个配套铁律（hasher.ts L53-67 + L69-89）：
1. **排序用 code-unit 序，不用 localeCompare**：localeCompare 依赖运行时
   locale/ICU 版本，非 ASCII 字符在不同机器上排序可能不同 → 相同内容产生
   不同哈希。这是深度对抗轮发现的真实 bug，修成了 `compareStringsDeterministic`。
2. **拒绝 NaN/Infinity**：非有限数在 canonical JSON 中直接 throw
   （`assertNoNonFiniteNumber`）。NaN ≠ NaN，会让哈希在跨语言间不一致。

> 学习点：跨语言一致性不是"碰巧"，是**每一层都刻意设计**的结果——
> 确定性序列化 + 确定性排序 + 拒绝非有限数。这是生产级哈希系统
> 才会遇到的细节，教科书不会教你。

## 6.3 跨语言字节级一致（TS / Python / 浏览器）

`tests/evidence_log/merkle_cross_lang.test.ts` + `golden_vectors/`：
同一批证据，TS 算一遍哈希，spawnSync 调 python3 再算一遍，
**必须逐字节相同**。CI 里这条测试保证任何一侧改了序列化逻辑
（比如引入新字段顺序），另一侧立即暴露。

这就是"独立可重算"的基础：第三方验证者不必信任 FAR-Lab 的 TS 实现，
可以用 Python、可以用浏览器，只要按同一 canonical 规则重算，结果必须一致。

## 6.4 Merkle 根：批量校验 + inclusion proof

`src/evidence_log/merkle_root.ts`：

- 链很长时逐条校验 O(n) 太慢。Merkle 树把 n 条叶子哈希两两合并
  （`combineHashes(left, right) = sha256(left + right)`），
  逐层向上，最终得到**一个 64-hex 根**——O(log n) 就能证明任何一条
  记录在树里（inclusion proof）。
- 空树 → `ZERO_MERKLE_ROOT`（64 个 0）。单叶子 → 根 = 叶子本身。
- 奇数叶子 → **duplicate-last-on-odd**（Bitcoin 同款策略）：复制最后一个
  配对。这个细节要和 Python 端对齐（`compute_merkle_root`）。
- 每条 leaf 校验 64-hex（fail-fast，拒绝 coerce）。

**学习点**：Merkle 树为什么用"哈希的哈希"而不是直接哈希全部？
因为树让你**局部验证**：验证一条记录只需 O(log n) 个兄弟哈希，
不需要整条链。这和区块链的 SPV（Simplified Payment Verification）
是同一个思想。

## 6.5 生命周期：撤回/更正/取代（append-only 墓碑）

`src/evidence_log/lifecycle.ts` + `far lifecycle` 命令：

科学结论会变：论文被撤回、结论被更正、被新的研究取代。
FAR-Lab 处理方式是**墓碑（tombstone）**：不删旧记录，只追加一条
"此记录已被撤回/更正/取代"的新记录，并签名记录 actor/reason/audit-ref。

- 状态机：active → contested → corrected / retracted / superseded
- 非法转移被拒绝（exit 1）——比如 retracted 不能变回 active
- 校验时重放事件哈希链：导出包里被剥离或翻转的墓碑会被检测到

**学习点**：为什么不用"删除"？因为删除破坏链的完整性（prev_hash 断裂），
而且删除是不可审计的。**科学史的可追溯性要求所有状态变化都留痕**——
这正是 FAR-Lab 对"结论会变"这个科学现实的诚实回应。

## 6.6 动手练习

1. **手算一个哈希**：用 `hashCanonicalJson({a: 1, b: 2})` 算一次，然后
   调换键序 `{b: 2, a: 1}` 再算——证明 canonical 序列化让两者相同。
2. **验证链机制**：读 `src/evidence_log/verifier.ts` 的 verifyChainHead，
   找到它逐条重算 current_hash 并比对 prev_hash 的循环。
3. **跑跨语言测试**：`node --test tests/evidence_log/merkle_cross_lang.test.ts`，
   观察 TS 与 Python 的哈希如何逐字节一致。
4. **（进阶）制造篡改**：跑 `far export far-proof --demo-chain --force`，
   编辑 `.far-proof/proof_envelopes.jsonl` 里任意一个字节
   （比如 UNTESTED → CONFIRMED），然后 `far verify .far-proof`——
   观察 tamperStatus: tampered / exit 7。这是 07 章的主线实验，
   提前跑一遍建立直觉。

## 自测

- [ ] 能画出一条证据记录的哈希链（含 prev_hash 的作用）
- [ ] 能解释 canonical JSON 为什么必要，两个配套铁律是什么
- [ ] 知道 Merkle 树的 inclusion proof 有什么用、复杂度多少
- [ ] 知道生命周期为什么用墓碑而不是删除
- [ ] 能解释跨语言一致是"每层刻意设计"而非碰巧

→ 下一步：[07 证明包](07_PROOF_BUNDLE.md) —— `.far-proof` 导出、独立验证、篡改检测。
