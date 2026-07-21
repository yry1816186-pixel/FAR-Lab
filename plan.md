# FAR-Lab × Pi 执行 1.md 前置 Harness 升级计划

> 目标：让本机 pi-coding-agent@0.80.10 能以最高质量执行 `1.md`(DESIGN PRIME 4274 行设计冻结总宪章)。
> 原则:增量接线,不重建已验证资产;所有门禁必须可机器执行;诚实标注 pi 不原生支持的机制。

## 侦察结论(4 路并行,已完成)

| 发现 | 出处 | 设计后果 |
|---|---|---|
| 1.md 含 11 阶段状态机 S0–S10 + `.far-design/` 26 项控制面 + 33 SSOT + 20 卡片模板 | 1.md:445-476, 515-542, 2759-2822, 3684-4100 | 阶段化 prompt + bootstrap 预生成骨架 |
| `.pi/project.json` gates 不被 pi 原生执行(dist/docs 零命中) | pi 安装目录 grep | 门禁执行 = far-stage 扩展 `far_gate_run` 工具 + prompt 纪律 + design_lint 脚本 |
| pi delegate 子代理本环境 6/6 失败 | .pi/state/MEMORY.md L1–L3 | harness 按主线程串行设计,禁用 subagent 依赖 |
| `.far-design/`、`.agent-state/` 缺失,design_lint 处 SKIP 假绿 | scripts/design_lint.mjs 激活条件 | bootstrap 激活 F1–F8 全绿 |
| pi 长线程最佳实践:阶段 prompt + 会话续跑 + compaction 调参 + `@文件` 回读 | pi docs(compaction/sessions/prompt-templates/usage) | settings 固定 compaction/retry;阶段 prompt 引用 1.md 行区间而非复制 |
| 2 个存量红门(zero-tolerance docs 命中、depth-gate 假 sha)已登记 non-blocking 延期 S1 | .pi/project.json description、.far-preflight | 本计划不处理,不削弱扫描器,runbook 中显式登记 |

## 执行波次

### Wave 1(4 个 coder 并行,文件域互斥)

- **W1 `.pi` 核心配置**:重写 `settings.json`(保留 skills,增补 compaction 24576/64000、retry timeout 600s)、重写 `APPEND_SYSTEM.md`(DESIGN PRIME 操作内核 ~120 行:阶段机/词汇/控制面纪律/诚实禁令/禁 subagent)、`project.json` description 诚实标注"非 pi 原生执行"。验收:`validate_agent_config.py` exit 0。
- **W2 门禁扩展**:新建 `.pi/extensions/far-stage.ts`(session_start 阶段状态注入、`/far-status` 命令、`far_gate_run` 工具真实执行 10 门、before_compact 保真指令)。不动 `far-guard.ts`。验收:jiti + mock ExtensionAPI 冒烟脚本实跑通过,`far_gate_run` 真实执行 design_lint 返回结构化结果。
- **W3 阶段 prompt 库**:`.pi/prompts/` 下 `far-s0-boot.md`…`far-s10-handoff.md` + `far-status.md` + 重写 `far-resume.md`、`far-design.md`(入口路由)。每个 prompt:入口检查 → 1.md 必读行区间 → 交付物清单 → 出口门禁命令 → STATE/RESUME 更新协议 → "门禁不过不得宣布完成"。保留 far-implement/far-release/far-review。
- **W4 Bootstrap + 控制面**:新建 `scripts/far_design_bootstrap.mjs`(幂等、原子写、零新依赖),一次生成:`.far-design/` 26 项(STATE.yaml 22 键须过 lint F2、CLAIMS/DEFERRAL 字段须过 F3/F4)、`.agent-state/STATE.yaml`、`docs/design/` 33 份规范骨架(13 字段 frontmatter,规避 zero-tolerance 全部禁词)+ `machine-readable/` 22 份 + `_LEGACY_MAP.md`(23 个旧命名文件映射)、`.far-design/templates/cards/` 20 个卡片模板。design_lint.mjs 是唯一可执行规范。验收:bootstrap 后 `design_lint.mjs` ACTIVE exit 0、zero-tolerance 不新增命中、validator exit 0。

### Wave 2(1 个 coder,依赖 Wave 1)

- **W5 运行手册 + 集成验证**:`PI_RUNBOOK.md`(环境事实/快速启动/阶段循环图/门禁矩阵/存量红门登记/断点恢复/故障排查/已知限制)、AGENTS.md §4 增补一行指引(总行数 ≤200)、全量门禁复跑矩阵、修复琐碎问题、产出最终验证报告。

## 不做的事(显式非目标)

- 不执行 1.md 本身(S0–S10 是 pi 的任务,本次只做前置)。
- 不修复 2 个存量红门(已登记延期 S1,属 1.md 执行范畴)。
- 不修改 `.pi/state/`(pi 内部状态;CP-1 过期目标仅在 runbook 标注)。
- 不修改 `agent/` 契约层、`.claude/` 层(已验证有效)。
- 不动 DEPTH_LEDGER.md、不削弱任何扫描器、不安装新 npm 依赖。

---

## v2:1.md 巨变适配(2026-07-19 → 2026-07-20,已完成)

背景:1.md 从 4274 行 DESIGN PRIME 变为 9762 行合并生命周期总宪章(新增 Phase A 前检、Phase C–H、profile-linux、附录);DESIGN_PRIME.md 被 SUPERSEDED;v1 harness 的行号锚点全部漂移。三波处置:

- **Wave 1 侦察**:确认 1.md 新结构(七组锚点域)、§19 GATE_A 十组 90 字段、§3 `.far-master/` 15 项要求;登记 2.md 外部删除异常(ANOM-S0-4,内容已并入新 1.md,无损失)。
- **Wave 2 四路并行**:
  - 锚点系统:`scripts/charter_anchor_map.mjs` + `agent/contracts/charter-anchor-map.yaml`(330 锚点,`--check` 校验 md5);1.md 三处合并缺陷修复;DESIGN_PRIME.md 加 SUPERSEDED 头注。
  - GATE_A 复核:`.far-preflight/READINESS_GATE.yaml` 裁决 READY_WITH_EXTERNAL_GATES(2026-07-20);8 partial 闭环;6 外部门禁包十字段齐;治理裁决 packet 化。
  - prompt 体系 v2:`.pi/prompts/` 25 个全部锚点化;`APPEND_SYSTEM.md` 99 行全局版;`far-stage.ts` 支持 `.far-master`(缺失优雅降级);冒烟 exit 0。
  - Phase C–H 资产:`gate_c_readiness.mjs`/`gate_d_vertical_slice.mjs`(正确报红 NOT_READY);`agent/templates/` 四模板;`.far-design/` 新增 QUALITY_POLICY/GATE_MAP/IMPLEMENTATION_CONTRACTS/ASSURANCE_CASE gate_f/TRACEABILITY.csv。
- **Wave 3 收口**:建立 `.far-master/` 全局控制面 15 项(STATE 17 键、PHASE_GATES A–H、授权/能力/风险/决策/追踪/证据/命令/日志/交接);`agent-config-manifest.json` v2(design_contract 指向 1.md);全量验证矩阵(10 门 8 绿 2 存量红、锚点/validator/design-lint/冒烟全绿、gate_c/gate_d 预期 NOT_READY)。

最终架构:五级控制面(`.far-master` 全局 SSOT / `.far-preflight` Phase A / `.far-design` Phase B / `.far-implementation` C–F / `.far-release` G),同一事实只存一个权威位置;锚点导航替代行号引用;门禁三轨执行。**最新操作手册见 `PI_RUNBOOK.md` v2。**
