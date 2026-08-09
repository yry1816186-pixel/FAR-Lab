# 修正通知机制 — Retraction/Correction Notice（阶段 7 P2 · BA3-3）

> 本文档回答「**修正后如何通知相关方**」——findings BA3-3 的诚实落地：当前无邮件/webhook
> 渠道，通知 = **可查询 + 可导出 + 可核验**，主动推送登记为 V2 项。

## 1. 问题

科学记录被修正/撤回后，引用它的人必须能发现修正——否则错误结论继续传播
（findings BA3-3：缺错误指控修正通知/公开机制）。

## 2. 机制（三支柱·本阶段已落地）

### 支柱 1：可查询（API 只读端点·BA3-3 接线）

```
GET /api/v1/lifecycle/events?targetKind=claim&targetId=xxx
```

- 返回该 target 的**全部生命周期事件**（active→contested→corrected/retracted/superseded）
- 每事件含：actor、reason（修正理由）、prevHash/currentHash（事件哈希链绑定·篡改可检）
- 无事件 → 空数组（不是 404——「无生命周期变更」是有效答案）
- 语义：**修正不静默**——任何持 targetId 的相关方（引用者/评审/裁判）可自查

### 支柱 2：可导出（.far-proof bundle A3 分量）

- bundle 含 `lifecycle.jsonl`（0021 迁移以来全部事件·append-only 哈希链）
- 离线核验：`far verify` 独立重算事件链（与 call_records 链同构）

### 支柱 3：可核验（事件链完整性）

- `verifyLifecycleChain(db, targetKind, targetId)`：从 GENESIS_HASH 重放全部事件
  ——prevHash 断链即篡改信号
- 与证明包 integrity.json 全分量 SHA-256 清单联动

## 3. 主动通知（V2·登记未做）

| 渠道 | 状态 | 说明 |
|------|------|------|
| 邮件/webhook 推送 | V2 | 需订阅模型（谁关注哪个 claim）+ 外部依赖 |
| 前端订阅（Wizard 面板徽标） | V2 | 需前端事件流消费（P0-4 SSE 已有——接线即可） |
| 撤回元数据（DOI/出版面） | V2 | 依赖 Zenodo/出版渠道（BE3-1 并行项） |

## 4. 触发流程（谁何时做什么）

1. **发现**：独立 re-verification（BA3-1 复审入口）或人工复核发现证据缺口
2. **标记**：`applyLifecycleTransition(db, { targetKind, targetId, toState: 'contested'|'corrected'|'retracted'|'superseded', actor, reason })`
   ——reason 是通知内容的核心（**必须可读·禁止空 reason**）
3. **发布**：事件写入 append-only 哈希链（无法静默删除）
4. **通知**：相关方查询 /api/v1/lifecycle/events（本阶段）→ V2 主动推送

## 5. 诚实边界（cannotProve）

- 本机制保证「修正**可被发现**」——不保证「所有人都会发现」（无强制推送渠道）
- reason 由 actor 提供——本层校验非空与链完整性，**不校验 reason 的事实正确性**
  （独立复审是 BA3-1 的职责）
- 事件时间戳是服务端墙钟（TK10 签名/TSA 时间戳落地前无法防时钟回拨——
  与 findings BA3-124.6 衔接·登记 TK10 依赖）
