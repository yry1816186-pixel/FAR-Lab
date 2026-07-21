# PI_RUNBOOK — FAR-Lab × pi 全局运行手册(v3)

- 版本: v3.0 · 基线日期 2026-07-20 · 分支 design/s0-safe-boot · HEAD 见 git log(v2 记 df3c2b6 已过时;S-1 重写于对抗轮收尾)
- 适用: 本机 pi-coding-agent 0.80.10,在仓库根 `C:\Users\RichardYuan\Desktop\FAR-Lab` 执行 `1.md`(唯一现行宪章;`agent/contracts/DESIGN_PRIME.md` 已 SUPERSEDED)
- 性质: 只登记已实测事实;门禁以真实退出码为准;全局状态以 `.far-master/STATE.yaml` 为准,设计子状态以 `.far-design/STATE.yaml` 为准

## 1. 控制面分工(五级,同一事实只存一个权威位置)

| 控制面 | 覆盖阶段 | 职责 | 状态 |
|---|---|---|---|
| `.far-master/` | 全局 | 全局 SSOT:STATE.yaml、PHASE_GATES A–H 登记、授权/能力/风险/决策/证据索引 | ✅ 建成(2026-07-20 对抗轮修复 PHASE_GATES 重复键后机读合法) |
| `.far-preflight/` | Phase A | 前检细证据(READINESS_GATE/EXTERNAL_GATES 全文/EV-1..38/reval 日志) | ✅ 只读保留 |
| `.far-design/` | Phase B | 设计冻结控制面(STATE 22 键/RESUME/CLAIMS/IMPLEMENTATION_CONTRACTS 等) | ✅ 冻结(LOCAL_FREEZE_WITH_EXTERNAL_GATES) |
| `.far-implementation/` | Phase C–F | 合同证据 IC-01..12、walking-skeleton、vertical-slice、phase_e/phase_f、adversarial/(2026-07-20 对抗轮) | ✅ 建成 |
| `.far-release/` | Phase G | 发布、安装、SBOM、哈希清单与供应链证据 | ✅ 本地项建成 |

摘要同步纪律(D4):`.far-master` 对 EXTERNAL_GATES/CAPABILITIES 只存摘要+指针,权威全文在 `.far-preflight/`,禁止双写。

## 2. 全局状态机 A→H(2026-07-20 对抗轮复核后)

| Gate | 名称 | 机检 | 出口/状态 |
|---|---|---|---|
| A | Workspace 前检 | validator + design-lint | ✅ PASSED |
| B | Design Freeze | design-lint;S8 全量门 | ✅ PASSED(LOCAL_FREEZE_WITH_EXTERNAL_GATES) |
| C | Implementation Readiness | `gate_c_readiness.mjs`(C1–C5) | ✅ PASSED(READY 5/5) |
| D | Vertical Slice | `gate_d_vertical_slice.mjs`(D1–D6) | ✅ PASSED(READY 6/6) |
| E | Feature & Integration | coverage-gate + depth-gate | ✅ PASSED(depth-gate DEF-12 维持红,未削弱) |
| F | System Assurance | 全量测试+红队重跑+ASSURANCE_CASE | ✅ PASSED |
| G | Release Readiness | zero-tolerance + 发布件核查 | ✅ PASSED_LOCAL_WITH_EXTERNAL_GATES(发布类动作+EG-SECURITY_AUDIT/EG-CROSS-PLATFORM 待用户) |
| H | Production Governance | 生产治理评审(人工) | ⬜ NOT_STARTED |

2026-07-20 对抗式全面验证(12 域,66 项登记,26 项当场修复)见 `.far-implementation/adversarial/FINDINGS.yaml`。

## 3. 门禁矩阵(2026-07-20 对抗轮复跑实测)

| # | 门禁 | 命令 | blocking | 当前 |
|---|---|---|---|---|
| 1 | agent-config | `python scripts/validate_agent_config.py` | 是 | 🟢 exit 0 |
| 2 | design-lint | `node scripts/design_lint.mjs` | 是 | 🟢 exit 0 |
| 3 | typecheck | `node node_modules/typescript/bin/tsc --noEmit` | 是 | 🟢 exit 0 |
| 4 | lint | `node node_modules/eslint/bin/eslint.js src --max-warnings 0` | 是 | 🟢 exit 0 |
| 5 | anti-theater | `node scripts/anti_theater_deterministic_scan.mjs` | 是 | 🟢 exit 0 |
| 6 | confounding-gate | `node scripts/confounding_gate_deterministic_scan.mjs` | 是 | 🟢 exit 0 |
| 7 | no-llm-final-judge | `node scripts/no_llm_final_judge_scan.mjs` | 是 | 🟢 exit 0 |
| 8 | coverage-gate | `node scripts/coverage_gate.mjs`(或 `pnpm run coverage`) | 是 | 🟢 exit 0(对抗轮校正 glob 后:行 95.02%/分支 83.24%,全量套件口径) |
| 9 | fitness(FF 15/15) | `node scripts/fitness_functions.mjs` | 是 | 🟢 exit 0(FF-01..15;FF-14/15 为 IC-12/IC-10 新增) |
| 10 | zero-tolerance | `node scripts/zero_tolerance_scan.mjs` | 否 | 🟢 exit 0(DEF-11 已闭环;对抗轮清理 10 条死豁免) |
| 11 | depth-gate | `node scripts/depth_gate.mjs` | 否 | 🔴 exit 1(DEF-12 存量红:0 stale+33 illegal,维持登记,未削弱) |
| 12 | gate-c | `node scripts/gate_c_readiness.mjs` | 否(未来 blocking) | 🟢 exit 0 READY 5/5 |
| 13 | gate-d | `node scripts/gate_d_vertical_slice.mjs` | 否(未来 blocking) | 🟢 exit 0 READY 6/6 |

执行三轨: ① bash 直跑 ② far-stage 扩展 `far_gate_run` 工具 ③ prompt 纪律。blocking 门(1–9)全绿才允许宣布阶段完成。

### 3.1 存量红门与延期

- **DEF-11 zero-tolerance**: 已闭环(U-10,exit 0;扫描器零削弱;对抗轮再清 10 条死豁免)。
- **DEF-12 depth-gate**: 0 stale + 33 illegal(DEPTH_LEDGER 假 sha);维持登记;解除路径=U-18 fetch(待用户)。禁止为转绿削弱扫描器或手填账本。
- **DEF-16..19(对抗轮新增)**: 报告协议对账(DEF-16)/全分量锚定(DEF-17)/一致伪造防护(DEF-18)/门禁脚本跟踪政策(DEF-19,用户 .gitignore 显式忽略 6 扫描器,处置权在用户)。

## 4. 快速启动

| 场景 | 操作 |
|---|---|
| 新会话(任意阶段) | 读 `.far-master/STATE.yaml` + `PHASE_GATES.yaml` + `.far-design/RESUME.md` 顶部,与 git 事实三方交叉 |
| 复核门禁 | 按 §3 逐门 bash 直跑,记录真实退出码 |
| 终端差异 | PowerShell/CMD: `pi`;Git Bash: `pi` 不在 PATH,用 `"$APPDATA/npm/pi.cmd"`;pnpm 同理用 `"$APPDATA/npm/pnpm.cmd"`(shell shim 在本环境解析错) |

## 5. 锚点导航(不许凭记忆引行号)

- 一切 1.md 引用用锚点 ID;行区间以 `agent/contracts/charter-anchor-map.yaml` 为准。
- 查单个锚点: `node scripts/charter_anchor_map.mjs --anchor master/§2`
- **1.md 变更后**: 先 `node scripts/charter_anchor_map.mjs` 重生成,再 `--check` 校验。

## 6. 已知限制(诚实登记)

- `.pi/project.json` gates 仅登记表,pi 不原生执行;以真实退出码为准。
- delegate/subagent 在本环境 6/6 确定性失败的历史记录(`.pi/state/MEMORY.md`);2026-07-20 对抗轮经用户显式授权使用 Kimi Work AgentSwarm 多开只读验证(授权仅覆盖该轮)。
- `.pi/` 整体 gitignored,当前为本地配置。
- 仓库无 git remote:无推送目标,一切副作用仅本地;push/发布类动作禁止(U-18 fetch 决策待用户)。
- 2.md 已被外部删除(ANOM-S0-4),内容已并入新 1.md;U-03 维持 BLOCKED_EXTERNAL。
- far doctor 两条预期 WARN(python 3.14 检测器缺陷、DASHSCOPE_API_KEY 未设),非阻断。
- 6 个 blocking 扫描器被用户 .gitignore 显式忽略(DEF-19):fresh clone 无法重放这些门;处置权在用户。
- V1 边界(对抗轮登记):bundle 目录级 verify 覆盖=信封+call_records 白名单+lifecycle 链,其余分量仅存在性(DEF-17);keyless hash 链一致伪造不可检(DEF-18);sanitizer 为纵深防御非信任边界(法德日/ChatML/同形变体残余,OWASP 自承)。

## 7. 故障排查

| 症状 | 定位 | 处置 |
|---|---|---|
| design_lint 红 | 输出含 F1–F8 类别码 | 以 exit code 为准;按类别修复,不削弱规则 |
| far_gate_run 不存在 | 扩展未加载 | bash 直跑 §3 对应脚本,记录真实退出码 |
| 锚点 --check 报 stale | 1.md 已变更 | 重跑 `node scripts/charter_anchor_map.mjs` 再 --check |
| 会话丢失/中断 | STATE + RESUME 顶部 + git 三方交叉 | 以文件与 git 事实为准;HANDOFF.yaml 为压缩凭据 |
| Git Bash 找不到 pi/pnpm | `which pi` 为空 | 用 `"$APPDATA/npm/pi.cmd"` / `"$APPDATA/npm/pnpm.cmd"` |
| FF-14 红(DRIFT) | schema/json 与 TS 类型漂移 | `node scripts/generate_json_schema.mts` 重生成;勿手改生成物 |
| 安装器复跑 | install.sh 硬编码 GitHub REPO_URL | 净机前先 push 或本地适配(见 RELEASE_CHECKLIST 注记) |

---
本手册只登记已验证事实;未完成即如实未完成。下一动作=用户 HA-1..8 与发布类授权。
