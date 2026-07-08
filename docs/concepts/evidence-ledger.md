# Concept: Evidence Ledger

> 证据账本是一条 **append-only** 的内容寻址哈希链。所有 evidence / verdict / FEC 契约按 SHA-256
> 落库，写入后不可改、改了必被检出。跨语言（TS / Python / 浏览器）哈希**字节一致**。

## 它解决什么

科学证据容易「事后替换」「悄悄删 unfavorable 结果」。append-only 哈希链让每一次写入都留下
不可篡改的指纹：任何事后修改 → 哈希链断裂 → 立即检出。

## 内容寻址（content-addressed）

每条记录的 `current_hash = SHA-256(canonical(previous_hash + content))`，`prev_hash` 指向上一条。
这形成一条单向链：

```
genesis(0x000...) → evidence_1 → verdict_1 → evidence_2 → verdict_2 → ...
```

修改任何中间记录的内容 → 其 `current_hash` 变 → 后续所有 `prev_hash` 链断 → `verifyChainHead` 检出。

## append-only 触发器

SQLite 层用 migration `0008_anti_theater_trigger_v2` 等触发器强制 append-only：尝试 UPDATE/DELETE
已有行会被数据库层拒绝。这是 fail-closed 红线的存储层兜底。

## 跨语言哈希一致性

`canonicalHash`（TS `src/evidence_log/`）≡ `canonical_hash`（Python `repro/far_chain_repro/`）：
对同一输入产出**字节相等**的 SHA-256。这由 `tests/evidence_log/cross_lang_consistency.test.ts`
+ Python mirror 在 CI 强制（`cross_lang` 是 R2 最高优先闸门）。

- TS 侧：`canonicalHash`（字符串键稳定排序 JSON → sha256）
- Python 侧：`repro/far_chain_repro/canonical_json.py` + `proof_hash.py`
- 浏览器侧：Web Crypto（frontend/public verify 脚本）

> 诚实边界：字符串键哈希完全证明；浮点序列化正迁移至 RFC 8785 JCS（V3 路线）。Python 轴需
> `pip install -e .`，缺失则该轴 skip（不伪造通过）。

## Merkle 聚合根

套件级用 Merkle 树聚合所有测试结果，产出单一 `suiteIntegrityRoot`。浏览器侧可用 Web Crypto
独立重算复核，无需信任 CI。

## 相关命令 / 脚本

```bash
far status --db <path>           # 验证链头（verifyChainHead）+ 迁移计数
far verify --db <path> --mode chain    # 第三方重算哈希链
node ci/verify_chain_smoke.ts    # CI 链完整性 smoke
node ci/merkle_integrity_smoke.ts      # Merkle 根 smoke
```

参见：[far-proof.md](far-proof.md) · schema 见 `schema/migrations/0001..0017.sql`
