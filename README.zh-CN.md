<div align="center">

# FAR-Lab（中文摘要）

**受证据约束、可证伪、可修正的科研工作台。**

输入一个研究问题，FAR-Lab 会检索真实文献、生成并按"证据支持度 + 可证伪性"
对竞争性假设排序、合成可执行的研究计划，并产出任何人可独立验证的可复现包——
同时在实验并未真正运行时，绝不谎称其运行过。

[![CI](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A5%2024-brightgreen.svg)](https://nodejs.org/)

> 本文件是英文版 [README.md](README.md) 的中文摘要。完整、权威的技术细节以英文 README 为准。

</div>

---

## 一句话理念

> 大模型负责提出语义内容；确定性代码负责 ID、schema、校验、授权、事务、
> 判定与溯源。

由此得出三条硬约束：

- **主张逐字绑定来源**——每条证据主张都对应源文本中可解析的具体片段，绑定关系
  机器可校验，而非自由文字声明。
- **软件绝不伪造执行**——当计划的现实环节（台架、田野、人体、档案）无法计算化
  执行时，FAR-Lab 登记一个冻结的预注册"协议"并在人类见证台账中等待真实记录，
  而不是模拟结果。
- **未知即未知**——成本只由用户声明的定价推导；缺少密钥时诚实拒绝，而非编造演示内容。

## 核心能力

12 阶段科研流水线，把一个研究问题变成可证伪、有据可依的研究计划：

```
scope → retrieve → verify_sources → build_evidence → generate_hypotheses
→ critique_falsify → rank → plan → execute → feedback → revise → export
```

文献来源：**OpenAlex、arXiv、CrossRef、EuropePMC**。运行内证伪级联在"轮次 /
token 预算 / 无实质差异"的有界约束下确定性地闭环 `实验 → 反馈 → 修正 → 再实验`。

- **实验执行层**——Python 侧车（`experiment-runtime/`），含持久化调度器、数据集
  获取（ARFF / CSV / OpenML）、机械统计判定，以及在 fail-closed 的 Docker Linux OCI
  隔离边界内的探索式 CodeAct。CodeAct 输出**只是候选发现，绝非判定**。
- **研究协议层（范式诚实执行）**——预注册材料与分组、由计划哈希播种的代码内
  随机化序列（重生成而非重随机）、fail-closed 伦理闸门与停止条件、只追加的人类
  见证台账。
- **可复现包**——零大模型、确定性的 IMRaD 论文投影，局限性由真实计数合成，BibTeX
  仅取自已存元数据；可用 `far verify` 独立验证。
- **模型控制面**——模型无关、网关中立的容灾链；内置路由 `zai`（默认）、`dashscope`、
  `deepseek`、`universal`，以及自定义路由。Qwen/DashScope 只是其中一条可选路由。
  `universal` 当前验证的协议契约为 OpenAI Chat Completions 兼容、OpenAI Responses API、Anthropic
  Messages 兼容和 Gemini `generateContent` 原生协议；未实现的其他协议会明确拒绝，
  不会静默伪装成兼容路由。
  Responses 路由选择 `openai_responses`，基础地址如 `https://api.openai.com/v1`，模型 ID 以网关实际提供为准。
  支持流式输出、结构化输出，以及将声明的 `reasoning_effort` 映射为 `reasoning.effort`。
  外部 Responses 服务尚未实测，状态为 `UNVERIFIED_EXTERNAL`；本地契约测试不等于外部服务认证。
- **多端形态**——CLI 工作台（`far`，20+ 命令）、React Web 工作台、可选 TUI、
  Tauri v2 桌面壳（未签名/未公证，不作为受支持分发渠道）。

## 环境与快速上手

依赖：Node.js ≥ 24、npm ≥ 10；实验侧车另需 Python + uv ≥ 3.11；生产 `explore_code`
另需 Linux 模式 Docker；SQLite 经 `node:sqlite` 内嵌，无原生依赖。运行时生产依赖仅
**zod** 一项。

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
npm install && npm run build

export ZAI_API_KEY=你的智谱密钥        # 默认路由；也可用 dashscope / deepseek / universal
# 无密钥时：检索仍会真实调用免费公共 API（OpenAlex / arXiv / CrossRef / EuropePMC），
# 但判稿阶段（scope / 假设生成 / 排序）会被诚实拒绝并记录原因——绝不编造演示内容。
# （--route 只接受真实路由：zai | dashscope | deepseek | universal。）

node dist/cli/main.js research start \
  "生物膜中抗生素耐药基因水平转移的驱动机制有哪些？" \
  --domain microbiology --goal exploratory

node dist/cli/main.js research status <run-id> --watch
node dist/cli/main.js research export <run-id> --format bundle --out ./output
node dist/cli/main.js verify <bundle-id>
```

Web 工作台：

```bash
cd web && npm install && npm run build && cd ..
npm run serve            # 默认端口 3196（far serve 默认 8787；均可用 PORT 覆盖）
```

配置项的完整带注释模板见 [`.env.example`](.env.example)。

## 项目结构（顶层）

`src/` 下按职责分层：`cli / agent / app / domain / pipeline / providers / sources /
server / experiment / persistence / kernel / model-plane / ingest / plugins / report /
platform / shared`；另有 `web/`（React，中英文）、`experiment-runtime/`（Python 侧车）、
`packages/tui/`、`desktop/`（Tauri）、`tests/`、`eval/`、`scripts/`、`project-spec/`、`docs/`。

## 测试

```bash
cd web && npm install && cd ..
npm test          # Vitest（forks 池）；无 uv 时侧车测试优雅跳过
npm run typecheck # 严格 TS + noUncheckedIndexedAccess
npm run lint
```

测试离线为本：需要真实路由的测试在 CI 与本地同样会失败。

## 许可

[Apache License 2.0](./LICENSE)。第三方归属见 [NOTICE](./NOTICE)。
