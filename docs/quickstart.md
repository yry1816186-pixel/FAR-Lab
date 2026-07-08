# Quickstart

> 目标：5 分钟内看到 FAR-Chain 的核心价值——**确定性裁决 + 篡改可检测**，全程 offline，零 API key。

## 前置

- **Node.js ≥ 24**（硬依赖：CLI 用 Node 24 原生 type-stripping 直接跑 `.ts`，无 dist build）
- pnpm 10.x（`corepack enable` 即可）
- Python 3.11+（可选，仅科研验证轴 SymPy/Z3；缺失则该轴 skip，不影响 offline demo）
- git

## 1. 安装

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
```

详细安装（macOS/Linux/Windows/Docker）：见 [installation.md](installation.md)。

## 2. 环境自诊断

```bash
node src/cli/far.ts doctor
```

`far doctor` 检查 Node/pnpm/Python/git/Docker、项目依赖、能加载 native 模块、能离线 verify demo
fixture。缺少 API key 时**只 WARN 不 FAIL**——offline demo 不需要它。退出码：`0` 全绿 / `1` 有
FAIL（核心损坏）/ `2` 仅 WARN。

## 3. 跑 offline demo

```bash
node src/cli/far.ts demo tess-offline
```

你会看到：① 14 条 Golden Vector 经真实 R0–R9 内核裁决；② 端到端 TESS 声明（`C-ASTRO-0001`）
经 FEC 编排 → 内核裁决 → fail-closed 密封。全程零凭据、零网络。

## 4. 验证持久化证明包（第三方独立重算）

```bash
node src/cli/far.ts verify examples/tess-offline/output/demo.far-proof
#   tamperStatus: clean · recomputation.node: pass · exit 0
```

`far verify` 对 bundle 做**第三方独立重算**：重算 proofHash 并与存储值比对，验哈希链完整性。

## 5. 看篡改检测

```bash
cp -r examples/tess-offline/output/demo.far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
node src/cli/far.ts verify /tmp/tampered
#   tamperStatus: tampered · recomputation.node: fail · exit 7
rm -rf /tmp/tampered
```

任何被 proofHash 覆盖的字节改动 → 重算哈希 ≠ 存储哈希 → 立即检出 `tampered` / exit 7。这是
fail-closed 红线：**被篡改的证明永远无法通过验证**。

## 下一步

- 完整 demo（含 MMLU hero pipeline · 真实统计驱动 CONFIRMED）：`far demo`
- 导出自己的证明包：`far export far-proof --demo-chain --out <dir>`
- 概念深入：[concepts/far-proof.md](concepts/far-proof.md)
- 真实 Qwen 推理（需 key）：[providers/qwen-dashscope.md](providers/qwen-dashscope.md)
