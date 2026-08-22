# EVIDENCE_INDEX.md — Active Evidence Routing

Keep this index small. It points to evidence that currently changes construction; the large pre-research corpus stays cold under `research/reference/`.

## Current official competition

- Source: current official competition page (URL re-verified before any consequential claim)
- Rechecked: 2026-08-21
- Decision-changing facts: Track 1 Direction 1A loop; officially required model-calling route (model family per current official rules, re-verified at release); proof of calls required; technical solution PDF <=20 pages; interactive frontend/API/video encouraged/optional; current scoring 40% scientific value / 30% technical depth / 30% application potential.
- Canonical interpretation: `project-spec/COMPETITION.md`.

## Current ZCode

- Official docs root: `https://zcode.z.ai/`
- Rechecked: 2026-08-21
- Relevant docs: Agent/AGENTS, Goal, Plugin, Skill, Commands, Subagents, Hooks, MCP.
- Canonical interpretation: `zcode-harness/COMPATIBILITY.md` and `zcode-harness/ZCODE_SETTINGS.md`.

## Agent-harness survey (six external projects)

- Source: `research/HARNESS_SURVEY_2026-08.md` (Codex / Claude Code leaked source / OpenCode / pi / OpenClaw / OpenHarness proxy for "Dancing Harness")
- As-of: 2026-08-22
- Decision-changing facts: FAR-Lab harness layer missing (agent loop / tool system / compaction / extensions) while pipeline backbone is sound; verdict = BUILD minimal kernel + ADOPT convergent designs, REJECT vendoring all six; leaked Claude Code code is design-study-only (legal).
- Load policy: read before any harness-layer architecture work (H1-H5 plan inside).

## Wave-S plan-design restructure (2026-08-22)

- Source: `research/PLAN-DESIGN-RESTRUCTURE.md` **v2（工程级六层协议栈：L0 域模型→L1 形式语义(log-LR 区间代数+QBAF+Carneades+分布化评级)→L2 确定性门链 14 道(含谓词区间 V&V/预测冲突矩阵/正交晋升/冻结审计)→L3 LLM 诱导协议→L4 自校准环(PredictionLedger+RPS+基线锚)→L5 产品面)** + `research/WAVE-S-SCOUT.md` + 底稿 `research/wave-s-reports/s1..s6, d1..d4`
- Decision-changing facts: ① P0 = plan 层结构化预注册（自由文本不可审计）；② 最大科学性缺口 = 单源晋升→正交晋升漏斗+双层 GRADE+ACH 补步；③ 技术制高点 = 自校准闭环（AI 科研系统 no verified precedent found，RPS 主分+无知基线锚）；④ L1 形式语义层（词→LR 区间，对数池；QBAF 多项式渐进语义；preferred 语义 NP-c 拒）；⑤ EEL 侧 MDE 硬门/PB 筛选/数值白名单/因果发现护栏（causal-learn 只作假设生成）；⑥ 不做清单见 plan §10（含 NOTEARS/实物期权/SemMedDB）。
- Load policy: read before any plan.ts / plan stage / rank / falsify / EEL spec-validation / trust-surface / B4 action work. Citation corrections + UNVERIFIED list in WAVE-S-SCOUT.md.

## OSS porting-fusion v2 (full user list, 2026-08-22)

- Source: `research/oss-porting-scan/PORTING-FUSION-PLAN.md` (v2) + 底稿 v2-{harness,statemachine,plugin,tools-sandbox,protocols,algo-multi-obs}.md
- Decision-changing facts: ① `src/agent/mcp.ts:73-82,140` two real defects (nextCursor pagination dropped; tools/list_changed notification dropped) — GO fix, no SDK; ② GO extracts: agentscope permission mode machine/bypass_immune + HintBlock + Offloader, vercel/ai HMAC approval + StopCondition + repair loop, mastra dual timeout, ag2 sandbox.py×5 container discipline → EEL E5 (EEL lane owns those paths); ③ user-list claims falsified: agentscope "HarnessAgent"/eliza "LangGraph-based"/"deepseek-ai/cordis"/Eko registerPlugin all VERIFIED-ABSENT; ④ category keeps: linear stage machine (no DAG engine — 3 re-open triggers), self-owned plugin 四分法, zod protocol union as authority (A2A/AG-UI DEFER with triggers), no reflection loops (registry C standing).
- Load policy: read before touching src/agent/{mcp,permissions,loop,compaction,tool}.ts or EEL E5 container/timeout work; DEFER-trigger registry in plan §10.

## Cold pre-research corpus

- `research/reference/FARLAB_PRE_RESEARCH_INTELLIGENCE_BASELINE.md`
- As-of: 2026-08-20
- Authority: non-authoritative discovery baseline; explicitly states named external candidates were not executed/benchmarked during consolidation.
- Load policy: never auto-load; search/read only the relevant section when a current decision needs candidate discovery, then revalidate decisive facts against current primary sources/runtime.
