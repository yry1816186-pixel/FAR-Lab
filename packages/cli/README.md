# @far-chain/cli

FAR-Chain CLI 包 —— AI4S 科学声明的**声明级验证层**（确定性 R0-R9 内核 · 篡改可检测 · 反剧场）。

本包是 monorepo workspace（`packages/cli`），入口 `bin/far.mjs` 转发到根 `src/cli/far.ts`
（node 24 原生 type-stripping 跑 `.ts`，项目无 dist build）。

## 安装（monorepo）

```bash
pnpm install          # workspace 链接 packages/cli → 根 src
pnpm far status       # 或：node packages/cli/bin/far.mjs status
```

## 命令（全部 fresh-clone 零密钥可跑）

| 命令 | 作用 |
|---|---|
| `far status` | 单一 SSOT 状态报告（禁手填数字） |
| `far verify --bundle/--envelope` | 第三方独立重算验证（proofHash + chain + 10 规则） |
| `far verify-golden --all` | 14 Golden Vectors 经真实 R0-R9 内核 |
| `far export receipt/far-proof` | Trust Receipt / V1 `.far-proof` bundle 导出 |
| `far bench run` | Science-125 基准 profile |
| `far fec compile/freeze` | FEC V2 编译（10 项检查）+ fecHash 重算 |
| `far fsm advance` | 9-state CLI 协议 FSM |
| `far demo` | 一键演示（14 GV + demo chain + 真实统计裁决） |
| `far api` | REST API server（Fastify · frontend 网关） |
| `far ask "<q>"` | 一次性跑 6-stage FSM + ASK-9 密封 |
| `far stream "<q>"` | 同 ask 但实时流式打印每阶段 |
| `far repl` | 交互式 REPL（提问/fork/history） |
| `far replay --db/--bundle` | 重放证据链（时光机） |
| `far court "<claim>" --models` | 跨模型可靠性法庭 |
| `far arena "<h>"` | 对抗科学竞技场 |
| `far init <domain>` | DomainPack 脚手架生成 |

## 诚实边界

- **默认 offline_replay profile**（零密钥 · fixture 回放）：展示「6-stage FSM 端到端 + 证据链工程 +
  确定性裁决内核接线」，**非**「AI 证明科学结论为真」。
- **真实推理**需 `--profile competition_aliyun_qwen` + `FAR_DASHSCOPE_API_KEY`（qwen_vl_adapter 真实 HTTP）。
- **红线**：LLM 不作最终裁决者——裁决由 R0-R9 确定性内核给出。
- **独立发布**（脱离 monorepo）：需将根 `src/` 一并打包，或引入 `tsc` build 产出 `dist`。当前为
  monorepo workspace 模式。

## 相关

- 根 CLI 实现：`../../src/cli/far.ts`
- 设计文档：`../../FAR_LAB_MASTER_PLAN/05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` §9（命令矩阵）
