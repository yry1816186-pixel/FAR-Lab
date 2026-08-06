# FAR-Lab Progress Checkpoint — 2026-08-06 项目治理会话（商业级整理）

## 治理会话 checkpoint（2026-08-06 22:30 终验）

**任务**：项目治理——全量阅读 + 工作空间梳理整合 + 商业级规划条理。
**方法**：基线实测 → 4 并发子 agent 只读审计（文档一致性/工作区卫生/代码健康/治理完备性）
→ 找全 32 项问题清单 → 批量修复 → 全量重验。

### 修复记录（全部带终验证据）

**A. 工作区卫生（回收 ~2.7GB）**
- 物理删除垃圾：`0/` 45MB、`frontend/0/` 24MB、`tests/*/0/` ×4（anti_theater/cli/falsifiability/fec）、
  `$null`、`docs/audits/0/`、`__pycache__`×2、`egg-info`、`.pytest_cache/`、`.ruff_cache/`、
  `frontend/dist/`、`.far-proof/` 40KB
- **删除旧 Python 环境**：`.venv312` 464MB + `.python-deps` 584MB（已被 `.venv` 替代；
  删除后 `pnpm run test:py` 121 OK 复验）
- 删除子 agent 残留 `_audit_*.cjs/js` 8 个（含 2 个误 staged 的 AD 状态文件）
- **896 个运行时产物 untrack**（`.far-implementation/`+`.far-design/`+`.far-master/` 的
  jsonl/log/ttl/sqlite/flag/rundb，占跟踪文件 26.8%，高频 churn）——`git rm --cached` 保留
  磁盘文件与 git 历史；`.gitignore` 新增 14 条防重跟踪模式（含 `_audit_*`）

**B. 文档一致性（消除数字漂移）**
- "20 anti-theater detectors"→22（6 处）：CHANGELOG.md:19,42 / cli-reference.md:65 /
  determinism.md:65 / verdict.md:79 / design/21:30
- COMPETITION_STRATEGY.md："18 个命令"→25（实测 far --help 输出）、"1484 个测试"→2023（3 处）
- docs/development/AGENTS.md：加 HISTORICAL-SUPERSEDED 警告头（声称 PROJECT_STAGE=DESIGN，
  与 v1.0.0 冲突；权威以根 AGENTS.md 为准）
- GOAL.md：更新 2026-07-19 旧"方向可能错"判断 → 2026-08-06 已验证定位

**C. 治理完备性**
- DEVELOPMENT_ROADMAP.yaml：Phase 2-4 pending→completed（实测证据填充 last_measured）；
  ADR verify 路径修正 `docs/adr/*.md`→`.far-design/DECISIONS/*.yaml`（24 记录真实存在）；
  Phase 5 in_progress（DR runbook 待补）
- 索引合并：docs/INDEX.md 升级为唯一完整索引（71 链接 0 死链），根 DOCS_INDEX.md 改薄转发页
- frontend/package.json version 0.0.0→1.0.0（与根版本对齐）
- 修复 V2ReceiptPage.test.tsx:19 未使用 fireEvent（前端 typecheck 全绿）

### 终验证据（2026-08-06 22:30 实测）
- 后端：typecheck 0 err / lint 0 err / **2023 tests（2017 pass / 0 fail / 6 skip）**
- 前端：typecheck 0 err / **217 tests pass**（+9 新）/ build OK
- Python：121 OK / demo exit 0（14/14 GV）
- 索引链接：docs/INDEX.md 71 链接 0 死链
- 反剧场：改动零 `@ts-ignore`/`: any`/`eslint-disable`

### 未动（需用户决策/真实资源）
- 工作区 50 staged + 50 modified + 11 untracked 为用户前会话未提交工作，未代提交
- uv.lock 523KB 建议提交（Python 锁文件标准做法）——待用户确认后 git add
- 根目录 19 个 md 归档评估：COMPETITION_STRATEGY/DEEP_AUDIT/NEW_SESSION_PROMPT/PACKAGE_MANIFEST
  均为 2026-08-06 活跃文件，归档破坏引用收益低 → 保留（已在索引覆盖）

### 回归修复（2026-08-06 22:40，删除 .python-deps 暴露的真实缺口）
- **license_audit.mjs 双修复**（`pnpm test` 从 2017 pass 暴露 → 2019 pass）：
  1. `readPythonLicense` 硬编码探测 `.python-deps/`（已删）→ 改为候选链：`.venv/Lib/site-packages`
     （Windows）→ `.venv/lib/pythonX.Y/site-packages`（POSIX）→ `.python-deps`（fallback）
  2. PEP 639 兼容：numpy 2.5+ 用 `License-Expression:`（SPDX）替代旧 `License:` 行 → 新增识别分支
- 新增测试 ④（tests/scripts/license_audit.test.mjs）：PEP 639 + .venv 探测回归保护
- 终验：license_audit 17/17 全白名单 / scripts 49 tests / **2024 tests（2019 pass / 0 fail / 5 skip）** /
  typecheck 0 / lint 0 / py 121 / 前端 typecheck 0

### Phase 5 补缺（2026-08-06 23:00，治理完备性子 agent 报告闭环）
- 新增 `docs/governance/disaster-recovery-runbook.md`：backup 已实现+测试（VACUUM INTO +
  integrity_check fail-closed）、restore 为文档化人工流程（§3 六步含回滚）、DR 演练待真实环境（§4）
- docs/governance/README.md 索引更新；DEVELOPMENT_ROADMAP Phase 5 disaster_recovery
  PARTIAL→NEAR（文档闭合，演练 pending）
- 子 agent 报告其余项已闭环：治理文件 19/19 ✅ / CI 7 workflows 无断链 ✅ / 版本对齐 ✅ /
  ADR 路径修正 ✅；MAINTAINERS/CITATION 占位符为 NEEDS_HUMAN_OPERATION（需用户决策）

### 文档一致性 agent 报告闭环（2026-08-06 23:10，最后一个子 agent 报告）
- **代码注释 "20 detectors"→22（4 处）**：verify.ts:7,929 / far.ts:852 /
  verifier_structural_gate.ts:241（此前只修了 md，子 agent 报告触发代码注释扫描）
- 已复核：src/ 零 "20 detectors" 残留；tests/ 零旧数字断言；typecheck 0 / 2024 tests 全绿
- CHANGELOG 1581/1517、audits dated 快照为历史记录，保留不改（历史真实性）

---

# FAR-Lab Progress Checkpoint — 2026-08-06 系统风险清单验证会话（只读复核 · 阅读全部解决）

> **⚠️ 恢复说明（2026-08-06 22:xx 治理会话）**：本文件在工作区含未提交新增（21:59 会话
> checkpoint，358 行）时被误覆盖，已从 HEAD 恢复并依据 `docs/audits/SYSTEMIC_RISKS_2026-08-06.md`
> （该会话的权威审计文档，33KB）+ 覆盖前读取的原文片段重建本 checkpoint。核心事实与数字
> 均以 SYSTEMIC_RISKS 文档为准。

> **本会话（第三轮·穷尽扫描）**：用户要求"把问题找全再全部解决"。17 维度穷尽扫描
> （类型/质量/安全/架构/测试/一致性/性能/依赖/前端/Python/深层逻辑），零修复先列全 6 项，
> 后批量修复全部 6 项（详见下方"第三轮修复记录"）。

## 第三轮修复记录（2026-08-06 21:55 终验）

- **P1 ask_runner 零直接测试** → 新增 `tests/api/ask_runner.test.ts`（4 测试：offline 6-stage+密封 /
  gateway 注入 / quick mode 单轮终止 / 密封幂等）。**编写过程暴露真实盲区**：quick mode 语义是
  "裁剪迭代数"（QUICK_TERMINATION maxIterations=1）而非裁剪阶段——测试固定了正确行为。
- **P2 V2ReceiptPage 零测试** → 新增 `frontend/src/__tests__/V2ReceiptPage.test.tsx`（9 测试：
  demo 段 / 六维演示 / 列表+总数 / 分页边界 / 空列表 / 列表 503 / demo 500 非阻塞 / Uploader 渲染）。
- **P3 Python 裸 except:pass ×3** → scripts/build_report_ppt.py:44,77 + render_ppt.py:12 改
  `except Exception` + 容错注释（py_compile 通过）。
- **P4 ROADMAP 旧数字** → DEVELOPMENT_ROADMAP.yaml 5 处 last_measured 重测更新（coverage 96.37/86.65、
  2023 tests、lint/typecheck 0、audit 0 vuln、CI green）。**连带发现真实安全缺陷**：
  brace-expansion override 5.0.8 低于补丁线（>=5.0.9）→ 修复为 5.0.9 → `pnpm audit` 从 1 high 归零。
  修复过程 pnpm install EPERM 中断致 better-sqlite3 半装（136 测试失败）→ npm 单包重装修复，2023 全绿。
- **P5 c_astro.ts:130 非空断言** → 保留（onlineResolved 守卫已证安全，lint 层面改进收益低，见下）。
- **P6 工作区卫生** → .far-implementation 运行产物跟踪问题，需用户决策（未动）。
- **终验**：typecheck 0 / lint 0 / **2023 tests（2017 pass / 0 fail / 6 skip）** / audit 0 vuln /
  V2ReceiptPage 9/9 / ask_runner 4/4。

## 验证结论（32 项全部复核）

- **基线实测**：typecheck 0 err / lint 0 err / **2023 tests（2017 pass / 0 fail / 6 skip）** /
  frontend 208 tests + build OK / py 121 OK / demo 14/14 GV / `npm pack` 512 files（0 V8 缓存）。
- **FIXED 20 项全部为真**（代码证据 + 行号核对）：
  - P0-1 FTS 懒同步 `src/evidence_log/search.ts:109-118`（COUNT 比较→自动重建）✓
  - P0-2 幂等三态 `schema/migrations/0024_hypothesize_idempotency.sql` + hypothesize.ts + 前端 FNV-1a ✓
  - P1-2 sandbox `MAX_OUTPUT_BYTES=10MB` 超限强杀 + outputLimitExceeded 透传（真实 python 20MB 洪泛测试）✓
  - P1-3 `src/api/internal/singleton_cache.ts` promise 单例 + benchmark mtime 失效 ✓
  - P1-4 `server.ts:173-176` app.close() + db.close() ✓
  - P1-5 `server.ts:83-84` requestTimeout=900s/connectionTimeout=60s + 前端 AbortController + 卸载 abort + react-query signal ✓
  - P1-6 package.json files 排除 `!src/**/0/` + 物理删除（实测 0 V8 目录残留）✓
  - P1-8 ci.yml L201-202 `pip install numpy lightkurve` ✓
  - P2-1 doctor.ts:224 `TRIGGER_NAME_RE` 白名单正则 ✓
  - P2-2 v2_receipts.ts 结构 guard + v2_receipts_persist.ts 数组元素级校验 ✓
  - P2-3 verdict.ts Fastify params schema（`^[A-Za-z0-9_-]+$` + 长度）+ isFinite guard ✓
  - P2-4 structural_gate bundle 模式一次性 stderr 告警 ✓
  - P2-5 repl.ts:132-134 queue.catch 保持链不断 ✓
  - P2-6 `frontend/src/lib/useTimeout.ts` hook + Leaderboard/Integrity/Wizard 接线 ✓
  - P2-7 AGENTS.md:10 = 326 文件 ✓ / detectors 22 ✓（残留 1 处已修正：npm pack 514→512）
  - P2-12 schedule.ts `.sha256` 侧车密封 + loadSchedule fail-closed 校验 ✓
  - P3-1 V8 缓存目录物理删除（实测 0 残留）✓
- **PARTIAL 1 项**：P2-9 jwt_middleware:90 catch(err) + 服务端诊断日志 ✓（其余 42 处有 body 语义正确→保留合理）
- **ASSESSED-KEEP 10 项复核通过**（理由与文档一致：行为保持重构风险>收益 / 有意设计 / 已文档化）：
  - P0-3 内核巨型函数：R 优先级表已显式化注释（L293-315）+ 60+ 测试覆盖 → 不重构正确
  - P1-1 API→CLI 倒置：arena_service:16 import ask.ts 真实存在，但上提 executeAskRun 涉及双调用面大重构 → 记录待架构演进
  - P1-7 巨型函数：核心有测试覆盖；demo_seeds 模板提取为机械重构无稳定性收益 → 待办
  - P2-8 process.exit 33 处：CLI 惯例 → 保留
  - P2-10 结构门：memoized 已存在，首击一次性 → 保留
  - P2-11 benchmark guard：文档化可信源决策 → 保留
  - P3-2/3/6/7/8/9：有意设计/低危/已文档化 → 保留
- **EXCLUDED 1 项**：P3-4 i18n fallback 误报（translate() 双层兜底存在）✓
- **N/A 1 项**：P3-5 工作区状态记录。

---

# 历史检查点保留（2026-08-06 及之前，供追溯）

## Checkpoint 2026-08-06 Session (Full Autonomous Hardening) — 13/13 任务

### P0 — 当前工作区缺陷修复（此前"前端未绿"是最大绊脚石）
1. **WizardPage.tsx 2 个 TS 错误修复**：删未用 Badge import + VerdictBadge
   接口从 `verdict=` 改为 `decision=`（+ VerdictValue 类型导入）
2. **4 个前端测试失败修复**：
   - App.test.tsx 导航数 14→15（实际 NAV_ITEMS 15 项，测试过期）
   - WizardPage.test.tsx waitFor 超时 1000ms < 页面故意 1500ms pipeline 停留
   - jsdom `navigator.clipboard` 只读 getter → defineProperty
3. **前端全绿**：typecheck 0 err / 208 tests pass / build OK
4. **后端回归**：typecheck 0 err / lint 0 err / 1974 pass 0 fail 6 skip /
   test:py 121 OK / demo exit 0 / coverage gate PASS
5. **工作区整理**：341 dirty files → 2 个 checkpoint commit，工作区 clean

### P1 — 发布与真实案例
6. **真实科学案例端到端**：`far real-paper --paper bem` 双模式实测——
   as-published 模式 anti-theater 捕获 1 个多重检验未校正缺陷；
   corrected 模式得 INCONCLUSIVE (R8)。新增独立 Python 复算轴
   `repro/real_paper/bem_statistics_recompute.py`（纯 stdlib 精确
   不完全 beta，与 TS studentTCdf 同构，4e-15 一致），+8 测试
7. **npm pack 验证**：514 文件/1.2MB/bin shebang/schema/repro 全入包；
   README "Pre-1.0" 版本语义与 1.0.0 冲突已修复（→ Early-stage 1.x），
   release.yml 示例 tag v0.1.0 → v1.0.0

### P2 — 信任闭环
8. **V2 clean-room 跨语言对拍**：新增测试证明 independentCanonicalJson
   （Node 原生实现，不共享 producer canonicalizer）与 Python canonical_json
   在中文/嵌套/转义/负零样本上 sha256 字节级一致（PS-04 硬证据）
9. **安全响应通道修复**：SECURITY.md/SUPPORT.md/CODE_OF_CONDUCT.md 的
   `security@far-lab.example.com` 假邮箱占位 → GitHub Private Vulnerability
   Reporting 真实可用通道（PS-09 从 FAIL 降为部分可用）

### P3 — 证据工程
10. **性能基准实测**：kernel p95=0.1µs / 14.1M verdicts/sec / 200K 迭代
    堆增量 0.69MB 无泄漏；API keep-alive p95=1-2ms（修正旧 250ms 是
    curl 无 keep-alive 的 TCP 开销，非应用逻辑）。Phase 4 标准 PASS
11. **JSDoc 覆盖 100%**：修正扫描器（多行 JSDoc 主体以 `*` 开头，旧审计
    误报 165/762），新扫描 1135 导出符号 0 缺失；修复 5 个真实缺口。
    `scripts/jsdocs_scan.py` 固化为可复用工具
12. **英文文档**：新增 `docs/design/00_ENGLISH_ABSTRACT_INDEX.md`——
    33 个中文设计文档的英文 5 分钟摘要索引（国际评委入口）

### FINAL
13. 全量最终验证 + checkpoint

### 最终验证证据（2026-08-06 实测）

| 轴 | 命令 | 结果 |
|---|---|---|
| 后端 typecheck | `pnpm run typecheck` | 0 errors |
| 后端 lint | `pnpm run lint` | 0 errors |
| 后端测试 | `pnpm test` | 1974 pass / 0 fail / 6 skip |
| Python 轴 | `pnpm run test:py` | 121 OK |
| demo | `node src/cli/far.ts demo` | exit 0, 14/14 GV |
| coverage | `node scripts/coverage_gate.mjs` | PASS (≥85% line / ≥75% branch) |
| 前端 typecheck | `cd frontend && pnpm run typecheck` | 0 errors |
| 前端测试 | `cd frontend && pnpm run test` | 208/208 pass |
| 前端 build | `cd frontend && pnpm run build` | OK |
| JSDoc | `python3 scripts/jsdocs_scan.py` | 1135 symbols, 0 missing |
| real-paper | `far real-paper --paper bem --mode as-published` | ANTI_THEATER_FAIL (1 finding) |
| real-paper | `far real-paper --paper bem --mode corrected` | INCONCLUSIVE (R8) |
| clean-room | `node --test tests/evidence_log/cross_lang_consistency.test.ts` | PASS (含 V2 对拍) |

### Git 状态
- branch `design/s0-safe-boot`（ahead of origin/main）
- 3 个 commit：`ffa0dcd` chore(checkpoint) P0 hardening / `2e2d1bc` feat(repro) Bem / `24c95c7` docs(jsdoc) 100%

### 与世界顶尖项目的差距（截至 2026-08-06 诚实评估）

**已闭合**：前端全绿 / 版本语义 / JSDoc 100% / 性能实测 / 安全通道可用 /
clean-room 跨语言证据 / 真实论文案例端到端 / 包内容完整。

**仍开放（需真实世界资源，非代码可闭合）**：
- PS-01/03/08 发布：需人类推送 v1.0.0 tag（release.yml 已就绪），GHCR 需
  配置 packages write 权限；`NEEDS_RELEASE_PUBLICATION`
- PS-07 OS 沙箱：science runner 无强制隔离（需架构决策，非本次范围）
- PS-12 维护者：bus factor=1，第二维护者需人类加入
- PS-04 独立验证：clean-room 证据已建立，但"独立团队 rerun"需外部团队
- M34 EXP：真实 author-reviewer 用户研究，需真实用户（DEFERRED_WITH_TRIGGER）
- Phase 5 DR：backup/restore 演练需真实环境

## Checkpoint 2026-08-05 Session (Final) — 5 Phases: 3 COMPLETED + 2 PARTIAL

### Phase 1: Foundation Hardening — COMPLETED ✓ (6/6 gates PASS)
### Phase 2: Architecture Excellence — COMPLETED ✓ (4/4 gates PASS)
### Phase 3: Scientific Rigor — COMPLETED ✓ (4/4 gates PASS)
### Phase 4: Performance — PARTIAL (benchmark exists, p95/memory not measured)
### Phase 5: Production Readiness — MOSTLY COMPLETE (Docker+health+OTel, DR partial)

（历史证据：typecheck 0 err / lint 0 err / 1518 pass / FF 17/17 / coverage
96.56% / JSDoc 缺失 220 — 其中 JSDoc 数字已被 2026-08-06 修正扫描器推翻：
实际 0 缺失，旧清单是扫描器误报。）

## Checkpoint 4 FINAL — 9 批次全部完成（2026-08-05）

1-A 供应链加固 / 1-B trapTaxonomy / 1-C FTS5 / 2-D 证据质量 GRADE /
2-E 上下文压缩 / 2-F State Revert / 3-G far schedule / 3-H JSONL session /
3-I math fallback — 全部落地，零回归（1581 tests）

## Checkpoint 5 — V2 Domain Contract Set（2026-08-06 早）

src/v2_domain/ 26 模块 + 311 测试（contract_enums/state_transitions/
algorithm_registry/receipt_manifest/independent_verifier/audit_lineage/...）
待办：M14 policy registry、M16-M17 CLI/API v2、M18-M19 static viewer、
M23-M24 sandbox worker、M29 RO-Crate/PROV、M30-M33 fixture track、
M34 DEFERRED（需真实用户）

## 下一步建议（下个会话）

1. 人类推送 v1.0.0 tag → 触发 release workflow → 验证 GitHub Release assets
2. 录制 3 分钟英文 demo 视频（HeroDemoPage 已就绪）
3. 评审 docs/far-lab-reboot/ 的 IMPLEMENTATION_READINESS_GAP_MATRIX.md
   30 个 gap 中选 P0 项实施（M14 policy registry / M16 CLI grammar）
4. V2 六维收据的完整 CLI 用户旅程（export receipt-v2 → verify --v2）补端到端测试

## Checkpoint 6 — 2026-08-07 发布前治理（熵值审计 + 迁移准备，等待人类确认）

**完成（只读审计 + 交付物，未执行破坏性操作）**:
- 全量熵值审计: docs/audits/PROJECT_CLEANLINESS_AUDIT_2026-08-07.md
  纯度指数 20.0%（排除依赖环境）→ 清理后可达 88.4% · E 类污染 0 · D 类 9 文件 3 组
- 迁移脚本（dry-run 已验证，--apply 待确认）: migrate.sh / migrate.ps1
- 死代码审计: docs/audits/dead_code_report.md（TS/Python 交付轴 0 死代码，typecheck exit 0）
- 开发指南/清理清单: DEV_GUIDE.md / CLEANUP_MANIFEST.md
- 重构后结构预览: tree.txt

**P0 风险（3 项，均待 migrate --apply 或手动处置）**:
1. docs/learning/ 13 章教学脊柱 100% 未追踪（git ls-files=0）→ 立即 git add 保护
2. 896 个暂存删除未落地（63% 指向 .far-implementation/adversarial/raw/）→ 完成 commit
3. C 类物理残留 ~32.5MB（0/ frontend/0/ .pi/state/ .pi/baseline-logs/ __pycache__/ .benchmarks/）

**下一步（人类决策）**: bash migrate.sh --apply（或分步: git add docs/learning → commit 896 删除 → 物理清理）

## Checkpoint 7 — 2026-08-07 治理执行完成（migrate --apply + 3 commits，全部落地）

**执行（用户授权"全面开工"后）**:
- 基线: typecheck exit 0 / lint exit 0 / test 2024 (2019 pass / 0 fail / 5 skip)
- commit 1: 896 暂存删除落地 + 7 归档 rename（adversarial raw 证据清理）
- commit 2: migrate.sh --apply 全部 Phase + docs/learning 14 文件追踪 + D 类去重 + 交付物
- commit 3: INDEX.md ULTIMATE_DESIGN 索引 + CLEANUP_MANIFEST + PROGRESS

**结果验证**:
- 物理删除 8 项（0/ frontend/0/ .pi/state/ .pi/baseline-logs/ __pycache__×2 .benchmarks/ .agent-state/）→ 释放 ~32.5MB
- docs/learning/ 已追踪（14 文件）· D 类 3 组去重 · .gitignore 追加 8 条防御规则（含 .far-implementation/adversarial/ 防回库）
- 纯度指数: 20.0% → 88.4%（估算，A 类 8.4MB / 项目内容 9.5MB）

**遗留（非本次治理范围）**: 48 个功能 staged + 11 个功能 untracked（v2_receipts/ask_runner/sandbox 会话成果）保持原样，待功能会话提交。

## Checkpoint 7 补记 — 1625 过程产物全清 + 3 事故修复（2026-08-07 深夜）

commit 1 的 pathspec 陷阱洗掉 896 staged D → 改用 git ls-files -i -c 全量清 1625（commit b45cddc）；
**/ _*.py 误伤 3 个 __init__.py → 从 b45cddc^ 恢复 + 规则改 _[a-z]*.py（commit 08ee31d）。
最终：adversarial tracked=0（保留 3 活文件）、.far-implementation 843K 活状态、功能 staged 47 未动、
测试基线零回归（2024/2019 pass/0 fail/5 skip）。细节见 CLEANUP_MANIFEST "执行中发现并修复的问题"。

## Checkpoint 8 — 2026-08-07 第二轮增量治理（migrate_clean.sh --apply 完成）

**触发**: 用户发起"深度审计与治理"（蓝图: src/ + tests/unit|integration + scripts/ + assets/ + docs/historical/ + migrate_clean.sh）
**审计结论**: 蓝图 80% 已由第一轮治理达成（src/ 24 模块化、tests/ 26 子目录、scripts/ 50+、docs/ 295 文件、gitignore 162 行）。强行执行蓝图目录大迁移 = 破坏 2023 测试 import 图 + 616 文件引用链 + 8 处文档引用，判定负收益，本轮零 src 移动。

**执行（--apply）**:
- C 类回收 ~23MB: 0/ (NODE_COMPILE_CACHE 22MB/2040 文件) + .ruff_cache/ (1MB/70 文件) → .trash_backup/migrated_20260807_012012/
- untrack 9 个被追踪日志 (.far-release/gates/ ×8 + installer) → 先 mv 再 git rm --cached（Pitfall #10 安全序列）
- .gitignore 追加 10 条蓝图强制条目 (.trash_backup/ *-agent-*/ *.tmp *.cache + 豁免) + 全局 *.log
- 归档 project_manifest.txt → docs/audits/PROJECT_MANIFEST_2026-08-07.txt

**交付物**: AUDIT_REPORT.md / migrate_clean.sh (dry-run 默认 + --apply) / CLEANUP_REPORT.txt
**验证**: typecheck 0 · lint 0 · test 2024 (2019 pass/0 fail/5 skip) 零回归 · demo 核心引擎 OK · 保护断言 63=63 · fixture 完好
**遗留**: 104 功能变更未提交 (47 staged + 45 mod + 12 untrack, 含 uv.lock/0024 迁移) 待功能会话; .trash_backup 待人工复核
