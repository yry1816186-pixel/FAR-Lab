# 29_OPEN_SOURCE_AND_PAPER_ROUTE.md — 开源与论文路线

> **来源**：调研优化版 `14_OPEN_SOURCE_AND_PAPER_ROUTE`。开源仓库的工程结构以仓库根 `<REPOSITORY_ROOT>/`（含 `src/` `packages/` `schema/` `frontend/` `tests/` `golden_vectors/`）为权威；本文件给出面向开源/论文的目录建议、README 结构、License、技术报告大纲与论文 title/abstract。

## 1. 开源仓库结构建议

```text
far-chain/
├── README.md
├── LICENSE
├── CITATION.cff
├── docs/
│   ├── concept/
│   ├── schemas/
│   ├── verifier/
│   ├── qwen_profile/
│   ├── tess_demo/
│   └── open_science_export/
├── schemas/
├── examples/
│   ├── tess_offline_fixture/
│   ├── anti_theater_cases/
│   └── proof_packages/
├── benchmarks/
├── adapters/
│   ├── providers/local_fixture/
│   ├── providers/aliyun_qwen/
│   ├── open_science/
│   └── tracing/
├── cockpit/
├── tests/
├── .github/workflows/
└── papers/technical_report/
```

> 注：实际工程实现根是 `<REPOSITORY_ROOT>/`（工作区根即实现仓），不是 `far-chain/` 子目录。上面的树是「开源发布视图」的示例命名，发布时以真实仓库布局为准。

## 2. README 结构

项目一句话；Why not another AI Scientist；30 秒 verify demo；Core concepts；offline quickstart；Qwen/DashScope profile with secret warning；proof package format；anti-theater examples；limitations/DO_NOT_CLAIM；citation/contribution。

## 3. Docs / examples / benchmark

`docs/concept/` 讲可证伪证据链；`docs/schemas/` 放 schema；`docs/verifier/` 放验证与 diff；`examples/tess_offline_fixture/` 放主 demo；`examples/anti_theater_cases/` 放伪造/降级 case；`benchmarks/mini_bench/` 放 P0 小集。

## 4. License 建议

核心代码 Apache-2.0 或 MIT；文档 CC-BY-4.0；数据/fixtures 遵守原数据源 license 并说明来源。

## 5. Technical report 大纲

Introduction；Threat Model；FAR-Chain Overview；Scientific IR and FEC；Evidence Ledger and ProofEnvelope；Deterministic Verdict Kernel；Open Science Export；Evaluation；Limitations；Ethics and Scientific Integrity。

## 6. Paper title 备选

- FAR-Chain: Proof-Carrying Research Objects for AI Scientists。
- Falsification-Anchored Research: Tamper-Evident Evidence Chains for Scientific Agents。
- From AI-Generated Claims to Verifiable Research Objects。
- A Reliability Runtime for Agentic Scientific Discovery。

## 7. Abstract 草案

Large language model agents can propose scientific hypotheses and automate parts of analysis workflows, but their outputs often lack claim-level evidence binding, falsification records, reproducible provenance, and independent auditability. We present FAR-Chain, a proof-carrying runtime for AI-assisted science. FAR-Chain compiles AI-generated scientific claims into falsification evidence contracts, binds them to source anchors, datasets, code artifacts, run records, statistical plans, causal assumptions, and agent traces, and emits deterministic five-value verdicts with proof envelopes. The resulting `.far-proof` package can be validated, replayed, diffed, and exported to open-science provenance formats.

## 8. Evaluation sections

Engineering invariants；Anti-theater benchmark；TESS demo；Baselines；Ablations；Limitations。

## 9. Demo video / website / community

视频：AI claim -> FEC -> TESS -> run/result -> verdict -> proof -> tamper fail（脚本见 `28_DEMO_VIDEO_SCRIPT`）。网站：slogan、verify demo、concepts、proof package spec、examples、benchmarks、docs、paper、community。社区目标：AI4S、Agent、Reproducibility、Benchmark、科学数据中心。

## 10. 来源

- **W3C PROV-O**：<https://www.w3.org/TR/prov-o/>
- **RO-Crate specification**：<https://www.researchobject.org/ro-crate/specification>
- **Workflow Run RO-Crate**：<https://www.researchobject.org/workflow-run-crate/>
- **ScienceAgentBench**：<https://osu-nlp-group.github.io/ScienceAgentBench/>
- **CORE-Bench**：<https://crab.cs.princeton.edu/core-website/>
- **MLR-Bench**：<https://arxiv.org/abs/2605.04677>
- **MAST TESS mission archive**：<https://archive.stsci.edu/missions-and-data/tess>
- **Lightkurve**：<https://lightkurve.github.io/lightkurve/>
