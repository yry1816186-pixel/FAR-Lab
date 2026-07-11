# 07 风险登记与禁用口径

> 本文档是 FAR-Chain 的**风险登记册、禁用口径权威、LLM 使用边界、Ask Layer、答辩底线、对外材料检查表**的集中处。
> 权威关系：本文件（P0）与 `APPENDIX_E_ANTI_THEATER.md`、`APPENDIX_F_GLOSSARY.md`、`APPENDIX_A_TYPES.md`、`APPENDIX_C_CANONICAL.md` 构成附录三权威与表述红线咬合体。冲突时类型字段以 A 为准、canonical 字节规则以 C 为准、术语语义以 F 为准、反剧场检测以 E 为准、禁用口径与本文件为准。
> 状态纪律（遵守 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §3/§4）：本文件每条能力标注状态标签；**不手填**测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 外部竞品发布时间，所有此类字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`，由 `far status --json`、CI 输出、`git rev-parse HEAD` 与可复核脚本回填。
> 路径约定（遵守 `01` §1）：所有路径以 `<REPOSITORY_ROOT>/` 开头；`far-chain/` 作为真实实现根是禁用口径（仅可在"已废弃历史规划"语境显式标注后出现，见 `08_TRACEABILITY_MATRIX.md` §2）。
> 自包含声明：本文件内容已完整自包含，不写"详见 FINAL_PACKAGE/X"作为有效依赖；旧 `FINAL_PACKAGE` 编号文档物理档案已退役（备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/`），仅作来源溯源。
> 五值裁决枚举（与 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §5、`APPENDIX_F_GLOSSARY.md` §3.1 一致，本文件不改枚举）：`CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`，**禁止第六值**。

---

## 1. 总红线

### 1.1 诚实是竞争力

FAR-Chain 可以强，但必须诚实。项目可信度来自敢于输出 `UNTESTED`、`INCONCLUSIVE` 和 `DEGRADED_SCOPE`，不是把所有东西说成绿灯。

```text
诚实系统做              不诚实系统做
DEGRADED_SCOPE + 标注  ↔ 假装数据正常
切备用 + 标注降级      ↔ 静默换模型不告知
INCONCLUSIVE           ↔ CONFIRMED
UNTESTED + 进 knownFailures ↔ 删掉失败记录
CI 红 block            ↔ --no-verify 跳过
```

> **FAR-Lab 的竞争力 = 敢于降级**。降级路径的完备性本身就是技术深度证据。一个敢在交付前自爆数字漂移 / 路径虚构 / 反向 over-claim 的项目，比把这些藏起来的项目在诚信维度更强——"诚实本身是反-theater 项目最强的护城河演示"。

### 1.2 降级哲学（取严不取宽）

降级是诚实的，不是掩盖。**任何降级都不伪造 `CONFIRMED`、不隐藏 knownFailures、不绕过 CI**。降级 = 把 verdict 落到 `DEGRADED_SCOPE` / `UNTESTED` / `INCONCLUSIVE` 并标注，**不是**把失败包装成成功。

| 情境 | 诚实系统 verdict | 话术 |
|---|---|---|
| 数据源失败 | `DEGRADED_SCOPE` + 标 `baseline_exempt`（F11） | "在线不可得，用缓存，诚实降级" |
| 主基座下线 | FallbackChain 切备用 + 标 `degraded_from` | "主基座不可用，切备用，已标注" |
| 检验边缘未过 | `INCONCLUSIVE` | "证据不足，落 INCONCLUSIVE" |
| 复现失败 | `UNTESTED` + 进 knownFailures | "复现失败也是结果"（F9） |
| CI 红 | block，不声称完成 | "CI 红阻断，不 --no-verify" |

### 1.3 红线体系优先级（冲突时依此裁决）

```text
L0 任务铁律 / CLAUDE.md 全局铁律（最高，凌驾一切）
 └▶ L1 宪法 12 条（项目最高 SSOT）
      └▶ L2 信任根 T1-T12（R2 cross_lang 最高工程优先）
           └▶ L2 反 theater F1-F12（项目灵魂）
                └▶ L2 零容忍 Z1-Z16（CI 必断言）
                     └▶ L3 DO_NOT_CLAIM / 表述口径（诚信底线，本文件 §2-§3 承载）
```

关键裁决：
- 当"高级概念（如 Lean 形式化验证）"与"F10（CAS/SMT 可选非 runtime）"冲突 → 砍高级概念为路线图，保 core gate 可跑。
- 当"演示效果"与"F1 反 theater"冲突 → 保反 theater（含 30% UNTESTED 的链比 100% CONFIRMED 含伪证更可信）。
- 当"novelty 科学发现"与"评分命门半堵"冲突 → 不赌 novelty，赌可靠性方法学。
- 当"4 值 verdict 历史构想"与"现状 5 值枚举 SSOT"冲突 → 统一 5 值，改历史构想。

---

## 2. 禁用说法对照表

### 2.1 核心禁用口径（D1-D15 · 表述红线）

> 与 `APPENDIX_F_GLOSSARY.md` §6.1、`56_SOURCE_OF_TRUTH_RECONCILIATION.md` §4 一致。本节是表述红线的权威集中处。

| # | 禁用口径 | 改写口径 | 来源 |
|---|---|---|---|
| **D1** | 证明科学真理 / 证明科学结论绝对为真 / 给科学结论盖终局真理章 | 判断是否满足冻结可证伪证据契约；`CONFIRMED` = bounded support（非证明为真） | 02 §7.3 / 56 §4 |
| **D2** | 物理不可篡改 / 物理隔离 / 物理拦截 / 事后篡改不可行 | 篡改可检测（tamper-evident）；DB 层 trigger 防 UPDATE/DELETE 但 **DROP TRIGGER 可绕过**，靠 external anchor（gitCommitSha / crossref DOI）兜底，**非 tamper-proof** | 56 §4 R6 / 59 W0-3 |
| **D3** | 完全可复现 | 可独立重算特定 proof input（independently re-computable） | 07 §2 / 56 §4 |
| **D4** | 全自动科学家 / 全自动无人 / 全流程绝对无人参与 | claim-level verification layer；运行时可自动化但密钥授权 / 控制台截图 / 报名提交 / 凭证核验 / GPU 配置须人工 | 02 §7.3 / 56 §5 V2-10 |
| **D5** | 取代同行评审 | 给审稿、合作和复核提供 trust receipt | 07 §2 |
| **D6** | 通用 AI4S benchmark / 通用 AI4S 排行榜 / 找出最准的模型 | FAR-Bench verification protocol / attack corpus（profile_id 永远 `competition_aliyun_qwen`，禁与 CORE-Bench 横向比较） | 02 §7.3 / C13 |
| **D7** | 端到端形式化证明已完成 / 全系统形式化已验证 | 局部 invariant 与 formal route（TLA+/Dafny 路线 = V3 research） | 07 §2 / 56 §4 |
| **D8** | 所有语言完全一致 / 跨语言字节相等已实证 LIVE（无 hedge） | 指明当前已验证语言和字段范围；"4 字段白名单 + 数值类已实证；`1e-7` 科学计数法鸿沟诚实披露" | 56 §4 R7 |
| **D9** | 第三方验证生态已完成 / .far-proof 已通过 IETF/RO-Crate 官方认证 | P0 independent recomputation；第三方生态是 V2/V3；IETF VAP 是进行中草案非 RFC | 07 §2 / 56 §5 V2-7 |
| **D10** | 最新 / 第一 / 唯一（无来源支撑、无 hedge、无查新） | "据我们所知首个" + 差异化三连（D1 缺位补位 / D2 runtime 非 benchmark / D3 国产基座）+ `UNVERIFIED_PRIOR_ART`（查新前）+ 答辩前查新 | 07 §2 / 56 §4 R8 |
| **D11** | `far-chain/` 作为真实实现子目录 | `<REPOSITORY_ROOT>/`（工作区根即实现仓） | 56 §2.2 / 01 §1 |
| **D12** | "1038/662/546/1092 tests"（任意裸测试数 / 文件数） | `<TEST_COUNT_FROM_STATUS_DUMP>`（由 `far status --json` 回填） | 56 §2.1 |
| **D13** | "96a6372bdf04 是根哈希 / 是 merkle 根 / 是 proofHash" | "`REPRO_CONTEXT_FIXTURE` 单向量 expectedHex（非 merkle 根，非 proofHash，非 suite root）" | 56 §2.3 |
| **D14** | 发现新科学规律 / 发现新行星（TESS demo） | "检测到周期性下降"（须 odd-even / duration / SNR / systematics 全 PASS + vetting 才能升级，且仍非 CONFIRMED） | 02 §7.3 / C15 |
| **D15** | "据我们所知首个"（无查新） | "据我们所知首个" + D1/D2/D3 + 查新（答辩前）；未查新前标 `UNVERIFIED_PRIOR_ART` | 56 §4 R8 |

### 2.2 V2 专属禁用词（FI-8 叙事轴边界）

> 叙事主语从"我们（防御性克制）"翻转为"你（可亲手验证）"（V2 进攻性诚实），但**不放宽任何 DO_NOT_CLAIM 边界**。

| # | 禁止声称 | 理由 |
|---|---|---|
| V2-1 | "Arena 证明 AI 不聪明" / "测出最准模型" | Arena 测"能否被结构化证伪"，非智商 / 准确度（守 C13） |
| V2-2 | "跨模型法庭找出最可靠模型" | 法庭只标一致性盲区，不排座次 |
| V2-3 | "可靠性证书给出 X% 真理概率" | 证书结构化（一致区 / 盲区），禁单一百分比（守 C9） |
| V2-4 | "WASM 验真证明科学结论" | 验真 = 过程可信证据可机器检，非真理证明 |
| V2-5 | "DomainPack 是通才科研系统" | 每 pack 只覆盖一类示范 claim（守 C16） |
| V2-6 | "时光机证明 AI 可重现"（FI-7） | 仅 deterministic track 可 byte-equal；真实 LLM 轨道不成立 |
| V2-7 | ".far-proof 已通过 IETF/RO-Crate 官方认证" | 路径 A 未完成前禁用；IETF VAP 是进行中草案非 RFC |
| V2-8 | "形式化已验证全系统" | 仅局部最小不变式锚点 |
| V2-9 | "首个"（无 hedge 无查新） | 须"据我们所知" + D1/D2/D3 + 查新 |
| V2-10 | "物理隔离 / 区块链证明 / 全自动无人" | 既有禁用词，V2 重申 |

### 2.3 DO_NOT_CLAIM 7+1 条（绝对禁称已实现）

> L3 表述底线。任何对外材料出现下列即视为违反本文件。

1. **完全自动发现新天文规律**（D14 联动）。
2. **已实现 eval-ring 物理隔离**（F4：eval-ring 是类型层约束 `purpose_tag` + CI 审计，非物理隔离）。
3. **FAR-Bench 是通用 benchmark**（D6 / C13）。
4. **LLM 可作最终科学裁判**（F3：禁 LLM-as-judge，裁决 deterministic）。
5. **证明科学结论绝对为真**（D1）。
6. **全流程绝对无人参与**（D4）。
7. **无真实百炼调用也声称参赛 profile 已闭环**（不允许假绿，见 §2.4）。
8. **（扩展）把博客/媒体/行业报告数字（BioSkepsis / R&D World 类·非同行评审）当确定结论引用**——须标来源性质 + "PDF 前核原出处"，PDF 前优先寻找同行评审替代源。

### 2.4 不允许假绿 6 条（02 §7.2）

1. **纯 fixture mock 代替真实 appendRecord**。
2. **未真实跑百炼却声称 request_id 已验证**。
3. **未导出 proof 却显示 passed**。
4. **LLM 自评代替 verdict protocol**（F3）。
5. **图表无数据绑定**。
6. **source_anchor 指向不可访问来源**。

### 2.5 CI grep 禁用词门（W0 落地）

```yaml
# <REPOSITORY_ROOT>/.github/workflows/honesty-grep-gate.yml（DESIGN_LOCKED）
- name: 诚实 grep 门（禁用词零容忍）
  run: |
    # 全 PDF/README/pitch/摘要 零裸禁用词
    ! rg -q "物理拦截|物理隔离|物理不可篡改|证明.*科学真理|全自动无人|首个(?!.*据我们所知)|已通过 IETF|全系统形式化" \
        README.md docs/ FAR_LAB_MASTER_PLAN/ --glob '!56_*' --glob '!43_*' --glob '!59_*'
```

例外：`43`（总纲）/`56`（真相统一）/`59`（W0 审计纲领）/本附录自身在"订正清单 / 禁用词表"里引用原措辞是**元层面演示**，不触发门。

---

## 3. 高风险点

### 3.1 表述与工程口径风险（10 类）

| # | 风险 | 影响 | 缓解 | 状态 |
|---|---|---|---|---|
| H1 | 旧文档互相冲突 | 工程和答辩口径混乱 | 本 SSOT（P0）优先，旧文档（P3）只作来源；冲突裁决见 `01` §2 | `IMPLEMENTED_VERIFIED` |
| H2 | `far-chain/` 虚构路径 | 工程交接失败（评委照此跑会路径级崩溃） | 全部改为 `<REPOSITORY_ROOT>/`；`packages/` 拆分标 V3 路线图（59 决策②） | `IMPLEMENTED_VERIFIED` |
| H3 | 手填测试数 / 文件数 / CI 通过率 | 被追问时失信（HONESTY-A3：README 硬编码 1038/92.80% 实测 769） | status dump / CI 作为唯一来源；占位符 `<TEST_COUNT_FROM_STATUS_DUMP>` | `DESIGN_LOCKED` |
| H4 | LLM 输出直接决定 verdict | AI 验 AI 自举失败（Z2-BOOTSTRAP） | deterministic kernel + rule trace；CI grep `createdBy[:=]"llm"` 阻断 | `IMPLEMENTED_VERIFIED` |
| H5 | Browser verifier 被夸大 | 答辩被击穿 | 明确它验证链密码学完整性（轻量入口验真），全规则验证在 `far verify` CLI + Python 路 | `IMPLEMENTED_VERIFIED` |
| H6 | FAR-Bench 被说成通用榜单 | 过度宣称 | 定位为 verification protocol / attack corpus；profile_id 永远 `competition_aliyun_qwen` | `DESIGN_LOCKED` |
| H7 | ProofEnvelope 被理解为真理证书 | 科学性风险 | Trust Receipt 明确 limitation（必含 limitations 段，省略即违反诚信红线） | `IMPLEMENTED_VERIFIED` |
| H8 | 外部竞品事实过期（novelty 被反杀） | 答辩被反杀（RR-14 overclaim） | 答辩前复核 + 标 `NEEDS_EXTERNAL_VERIFICATION`；谱系图主动承认后发 | `NEEDS_EXTERNAL_VERIFICATION` |
| H9 | 多包拆分（`packages/`）提前 | 工程复杂度爆炸、fresh-clone 风险 | 当前遵守 `src/` 扁平现实；packages/ 标 V3 开源路线图 | `RETIRED`（packages 作为真实路径已退役） |
| H10 | V3 设想写成已完成 | 诚信风险 | 状态标签强制化（§7 状态纪律） | `DESIGN_LOCKED` |

### 3.2 技术与外部依赖风险（12 类）

> 概率/影响为**判断估计**（非实测），标注 `[估计]`。状态：风险登记册已设计；具体概率/影响待 day-1 真运行实测复核。

| ID | 风险 | 概率[估计] | 影响 | 降级/缓解 | 状态 |
|---|---|---|---|---|---|
| RK-01 | Qwen snapshot `qwen3.7-max-2026-05-20` 下线风险（团队 2026-06-27 verified_live·**无百炼官方维护期承诺**·竞赛周 day-0 GET /v1/models 实测复核） | 高 | 高 | FallbackChain（§5）；cached LLM 响应离线 Demo 兜底；day1:verify 强制实测（无 key 不算 graceful skip 通过） | `IMPLEMENTED_VERIFIED`（day-0 实测 2026-07-10：GET /v1/models 返回 200 + `qwen3.7-max-2026-05-20` 在 model list；`snapshot_liveness_smoke.ts` OK） |
| RK-02 | cross_lang byte-equal 不成立（TS vs Python canonicalHash） | 中 | 极高 | **不可降级**·必须修（白名单/排序/分隔符/NaN/Unicode 对齐）；golden_vectors 防回归；CI R2 block merge | `IMPLEMENTED_VERIFIED`（数值类·边界按 NUMERIC_KNOWN_DIVERGENCE 归 RED 待 V3） |
| RK-03 | MAST 在线查询失败（TESS 光变曲线） | 中 | 中 | cached fixture（T-W2-01）；verdict 落 `DEGRADED_SCOPE`；标 `baseline_exempt`（F11） | `PARTIAL`（day-0 实测 2026-07-10：cached fixture fallback 路径已验证·science_harness c_astro_pipeline R4 DEGRADED_SCOPE 落地；真实 MAST lightkurve spawn 待 Linux 双启动——`.python-deps` 新旧 astropy 7.2.2/8.0.1 + erfa 冲突在 Windows 阻塞 P1-6b） |
| RK-04 | novelty=0 评分瓶颈（FAR 不产出新发现·传统 novelty 维度=0） | 确定 | 高 | 命门补救：重定义 novelty（让 AI 科研声明可机器检验）+ FI-3 先进性维度出口（59 决策①）+ 诚实护城河 | `DESIGN_LOCKED` |
| RK-05 | 竞赛日程紧·规范未冻结 | 中 | 极高 | M1-M7 里程碑排序（非裁剪·全部模块必须实现）；诚实报告进度 | `DESIGN_LOCKED` |
| RK-06 | 评委误解"proof"为数学证明 | 中 | 中 | PDF 边界章节 + Q&A 预案（§6）+ 反复声明"reliability evidence package，非数学证明" | `DESIGN_LOCKED` |
| RK-07 | sandbox 非物理隔离被质疑 | 中 | 中 | 诚实声明 F4：类型层约束 + CI 审计，**不声称进程级物理隔离** | `IMPLEMENTED_VERIFIED` |
| RK-08 | GPU 不可得（ProbeAtlas N=30、对抗博弈批量） | 中 | 中 | 代码实现 + 测试脚手架必须完成；真实跑标 `NEEDS_GPU_VALIDATION` | `DESIGN_LOCKED` |
| RK-09 | dashscope rate limit / quota | 中 | 中 | 限流 + 指数退避 retry 3 次（1s/2s/4s）+ cached 响应；Demo 前预跑缓存关键调用 | `DESIGN_LOCKED` |
| RK-10 | fresh-clone 环境差异（评委机器跑不出相同 hash） | 低 | 高 | requirements.lock + Python venv 锁定 + repro 七分量（MODEL_SNAPSHOT / CalcSpec / env_hash 全锁） | `IMPLEMENTED_VERIFIED`（day-0 实测 2026-07-10：`fresh_clone_smoke` 12/12 PASS 带 key / 10/12+2SKIP 无 key offline_replay；repro 七分量全锁；非项目成员 fresh-clone 录屏仍 `NEEDS_EXTERNAL_VERIFICATION`） |
| RK-11 | 引用 UNVERIFIED 残留进 PDF | 中 | 中 | PDF 引用前逐条人工核实；标【已核实】或【UNVERIFIED·须核实】；Robin Nature / PaperRepro / SocSci 26xx / CodeEvolve 必须核 | `NEEDS_EXTERNAL_VERIFICATION` |
| RK-12 | 评委 Demo 现场失败 | 中 | 高 | 降级预案（Plan B/C/D，见 §6.3）；**绝不伪造 CONFIRMED**；"复现失败也是结果"（F9） | `DESIGN_LOCKED` |

### 3.3 安全威胁模型（取自 `35` §1，状态：`DESIGN_LOCKED`·安全分析待 day-1 实测）

| 威胁者 | 能力 | 动机 | 缓解边界 |
|---|---|---|---|
| 恶意 researcher | 可修改本地代码/数据，可控制 LLM prompt | 产出看似可信实则伪造的科学声明 | 信任根前提——代码是诚实的；篡改自洽但语义破坏属哲学边界 |
| compromised LLM provider | 可篡改模型输出、注入后门、记录 prompt | 静默引导科研结论、植入偏见、拒绝服务 | LLM 输出不进 verdict 决策路径（F3）；所有度量确定性（C21） |
| supply chain attacker | 可通过 npm/PyPI 依赖注入恶意代码 | 篡改 hash 计算、绕过 verdict、伪造 evidence | SBOM（S7）+ lockfile hash 进 proofHash（AT-DEP-FLOAT-DRIFT） |
| insider（有仓库写权限） | 可改 CI 脚本、改 migration、改 golden_vectors | 绕过 CI 门、伪造"可复现"、隐藏失败 | git history audit + 要求 fresh-clone 独立验证（评委） |
| network adversary | 可拦截/篡改 MITM 的 HTTP 请求到百炼 API | 篡改 LLM 调用、窃取 prompt、伪造 request_id | TLS 1.2+ 强制（SEC-0002） |
| time adversary | 可控制系统时钟 | 伪造 isoTimestamp、绕过 snapshot 下线检测 | snapshot day-0 实测（无 key 不算通过）；时间戳非 verdict-critical |

**已知安全局限（诚实标注·不可掩盖）**：
1. **"信任根"前提**：假设代码是诚实的——若攻击者能改源码，任何防护都无效（类似 Ken Thompson "Reflections on Trusting Trust"，非工程缺陷）。
2. **SQLite 无网络隔离**：本地文件系统数据库，任何能访问 SQLite 文件的人可读全部数据。
3. **沙盒非真隔离**：沙盒是 manifest lint + resource limit，非 Docker/VM 级隔离；不出站沙盒可被 `import socket` 绕过（当前依赖 Python 代码审计非运行时阻断）。
4. **LLM prompt 注入无防护**：claim 内容、dataset 内容直接拼入 LLM prompt 无转义；当前"防护"仅依赖 F3（LLM 输出不进 verdict 决策）。
5. **dashscopeRequestId 不可离线验证**：攻击者可编造任意 request_id 字符串，当前无在线反查通道验证其真实性。

### 3.4 不可降级项（DO_NOT_CLAIM 硬约束）

> 这些项降级 = 作弊，绝不允许。

| 不可降级项 | 理由 | 红线 |
|---|---|---|
| cross_lang 不等 → 必须修，不降级 | 信任根基石（RK-02） | T1 |
| 检验 WARN → 不可标 CONFIRMED | 反 theater | F1 |
| knownFailures → 不可隐藏/删除 | append-only + 诚实（F9） | T2 / F9 |
| CI 红 → 不可 --no-verify 跳过 | 铁律 3/4 | L0 |
| API key → 不可进 git/records/PDF | 安全 | S1 |
| 物理隔离 → 不可声称（除非真做） | F4 | F4 |
| 通用 benchmark → 不可声称（FAR-Bench 只自测） | C13 | C13 |
| 发现新规律 → 不可声称 | 命门补救基调 | D14 |

---

## 4. LLM 使用边界

### 4.1 裁决纪律铁律（F3）

**LLM 不得作为最终裁决者；裁决必须 deterministic。** 这是 FAR-Chain 反 theater 的核心红线（与 `APPENDIX_E_ANTI_THEATER.md` §1 F3 / `APPENDIX_F_GLOSSARY.md` §6.6 一致）。

裁决枚举固定（禁止第六值）：

```ts
// 五值裁决 enum —— 固定（03 §5 / 11 §3 / APPENDIX_F §3.1 SSOT）
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

裁决优先级（`03` §6，take the strictest）：

```text
DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED
```

### 4.2 LLM 允许清单

LLM 可在以下场景辅助（输出**不**进 verdict 决策路径，可进 `humanSummary` 等 non-proofHash-critical 字段）：

- 生成候选 claim；
- 辅助 FEC 草案（`measurableImplication` / `requiredEvidence` 草案）；
- 解释 verdict（生成面向人的报告文案）；
- 生成报告（markdown / README / PDF 草稿）；
- 生成形式化证明草稿（Lean4/Dafny，但须经独立验证器 type-check，F10）；
- 帮助用户理解 failure（friendly error message）。

### 4.3 LLM 禁止清单

LLM **不得**：

- **直接输出最终 verdict**（`VerdictNode.verdict` / `ProofCheck.outcome` 的 `computedBy` 必须 `startsWith("deterministic_")`）；
- 覆盖 deterministic kernel（`decideFiveValueVerdict` 是纯函数）；
- 隐藏 protocol deviation（POSTHOC_THRESHOLD / METRIC_SWAP / ALPHA_INFLATION 必须留 reasonCode）；
- 在 proofHash 外悄悄改 evidence（`affectedProofHashInputs` 必须进 proofHash）；
- 把自然语言 reviewer 当独立真相源（LLM reviewer 写 `"supports_strongly"` → kernel 不变）；
- 自动把 `UNTESTED` 改成 `CONFIRMED`；
- 决定 anti-theater finding 的 `severity` / `reasonCode`（`runAntiTheaterLint` 全程 deterministic）。

### 4.4 CI 闸门（独立于 runtime 检测·编译期阻断）

```yaml
# <REPOSITORY_ROOT>/.github/workflows/anti-theater.yml（DESIGN_LOCKED）
- name: no_llm_final_judge_scan
  run: |
    ! grep -rE "createdBy\s*[:=]\s*['\"]llm['\"]" <REPOSITORY_ROOT>/src/ || \
      (echo "F3 violation: LLM-as-judge detected"; exit 1)

- name: deterministic_lint_grep
  run: |
    # runAntiTheaterLint 模块不含 llm/openai/chat.completions 导入
    ! grep -rE "openai|chat\.completions|llm_gateway" <REPOSITORY_ROOT>/src/anti_theater/ || \
      (echo "F3 violation: anti-theater module imports LLM"; exit 1)
```

**纪律**：`AntiTheaterFinding.deterministic` 字段恒为 `true`（`APPENDIX_E` §1）；出现 `false` 即 CI fail。

### 4.5 AI 验 AI 自举应对（Z2-BOOTSTRAP · 答辩必备）

> 任务铁律之一：证据链从 claim 到 evidence 全是 AI 写的，AI 自产自销自证，可信性何来？

**答辩锚**（59 W0-7 / 61 Q2）："我们不证明 LLM 说的对——我们证明它说了什么之后**不可篡改、可独立复算、可证伪**；可信性 = reproducibility（字节相等重算）+ falsifiability（可被反例推翻）的联合属性，非 LLM 自评；external anchor `gitCommitSha` / crossref DOI 是可外部验证的离线锚点。demo 现场浏览器重算 hash 当众证明'重算≠相信内容'。"

**AI 验 AI 范式**（61 Q2）："AI 写证明，机器检查证明——这是 PCC（Proof-Carrying Code）范式，**AI 不被信任，proof 被信任**。" AI 形式化的输出仍经 Lean4/Dafny 独立验证（`math_verifier` 路由 `L3_formal`），独立验证器是规则/类型检查器非 LLM。**不可声称"不调 AI"**——AI 介入是诚实的，但 AI 输出不进 verdict 决策路径（F3）。

---

## 5. Ask Layer（必须停下来问人）

### 5.1 9 类必须询问的工程操作（02 §7.5）

> 以下情况必须显式询问或阻断，不允许静默假设。对应铁律"安全优先：不确定时询问，危险操作前确认"。

| 情况 | 行为 | 来源 |
|---|---|---|
| 改 Schema（migration DDL） | 阻断 + 询问（migration 0001-0008 已锁，新增走独立 migration 0009+；0001 五表禁 ADD COLUMN 除 `verdict_nodes` 经 Ask 裁决的 `uq_grade`/`repro_certificate_id`/`sensitivity_envelope_id` C29 例外） | S5 / T10 |
| 改依赖（package.json / requirements.txt） | 阻断 + 询问（lockfile hash 变 → proof head 变，RK-10） | Z7 |
| 改 CI（workflow / gate） | 阻断 + 询问 | S5 |
| 改部署（docker-compose / k8s） | 阻断 + 询问 | S5 |
| 改环境变量（`.env*`） | 阻断 + 询问（secrets 安全 S1） | S1 / S5 |
| 删文件 | 阻断 + 询问 | S5 |
| 重命名 | 阻断 + 询问（跨文件命名漂移） | S5 |
| 付费 API 调用（真实百炼 / 真实 GPU） | 阻断 + 询问 | S5 |
| 人类官方科学背书（含 CONFIRMED verdict 终审） | 阻断 + 询问（科学结论须人工背书） | L1 §9 |

### 5.2 运行时阻断清单

| 情况 | 行为 | 输出 verdict |
|---|---|---|
| claim scope 不明确（`SCOPE_UNBOUNDED`） | FEC 编译期 throw → 不进链 | `UNTESTED`（`FEC_NOT_COMPILABLE`） |
| primary metric 缺失（`METRIC_MISSING`） | FEC 编译期 throw → 不进链 | `UNTESTED` |
| dataset license/privacy 不清 | 阻断或标 warning | `UNTESTED` 或 warning |
| workflow 会执行任意代码 | sandbox + allowlist（manifest lint） | `UNTESTED`（沙盒超时 F-09） |
| 外部网络依赖 | 标注 network policy；沙盒出站默认禁 | `UNTESTED`（`SANDBOX_NETWORK_VIOLATION` SDBX-0004） |
| 统计计划在结果后出现（HARKing） | anti-theater fail（`AT-HARK`） | 禁 `CONFIRMED` → `UNTESTED`/`INCONCLUSIVE` |
| 用户要求改 verdict 文案 | **只允许改 `humanSummary`，不改 structured verdict**（structured wins，03 §8） | — |
| 证据不足但用户想要 green | 输出 `UNTESTED` / `INCONCLUSIVE`（F1） | `UNTESTED` / `INCONCLUSIVE` |

### 5.3 FEC 编译失败码（fail-closed）

FEC 编译失败时不得输出 `CONFIRMED` 或 `REFUTED`，只能进入 `UNTESTED` 或阻断：

| 失败码 | 触发条件 | 处理 |
|---|---|---|
| `FEC_NOT_COMPILABLE` | claim 无法编译为可证伪契约 | throw → 不进链 |
| `SCOPE_UNBOUNDED` | scope 缺失或无界 | throw → 不进链 |
| `METRIC_MISSING` | 无 primary metric | throw → 不进链 |
| `THRESHOLD_MISSING` | 无可判定 threshold | throw → 不进链 |
| `EVIDENCE_REQUIREMENT_MISSING` | required evidence 为空 | throw → 不进链 |
| `STAT_PLAN_MISSING` | 无统计计划 | throw → 不进链 |
| `PROTOCOL_INCOMPLETE` | freeze 不完整 | throw → 不进链 |

---

## 6. 答辩 Q&A 底线

### 6.1 核心必问预案（11 问 · 最难优先）

> 每问给出「一句话锚」+「展开」。被问时先抛锚，再按评委追问深度展开。

#### Q1 ★ 赛道偏移质疑（必问）
**问**："赛道是'科学假设生成'，你的 demo 全在验证，生成创新在哪？"
**锚**："我们不是做了更好的假设生成器，而是让 AI 生成的科学假设**第一次可以被独立验真地证伪**。"
**展开**：FEC 绑定 = 生成时强制附可证伪条件；生成可证伪假设 > 生成漂亮假设，更接近科学方法本义。

#### Q2 ★ AI 验证 AI 自举（Z2 · 必问）
**问**："competition 下 autoformalizer 包 LLM 形式化，AI 验证 AI 怎么保证？"
**锚**："AI 写证明，机器检查证明——这是 PCC 范式，**AI 不被信任，proof 被信任**。"
**展开**：见 §4.5。**不可声称"不调 AI"**。

#### Q3 ★ 同构竞品 PCA（最难学术追问）
**问**："PCA (ACSAC 2025) 已经做了 Merkle + 签名 + claim-evidence 映射，你和它有何本质区别？"
**锚**："PCA 自己承认**只验 provenance 不验 truth**。FAR-Chain 在 PCA 验不了的 pre-commitment 层，用 anti-theater 确定性规则裁决 + DB ABORT 兜底。"
**展开**：PCA README 明文承认 truth-gap；FAR 五值裁决 + 0008 trigger 填的就是这个 gap；这是经 PCA 自己承认的可辩护差异。

#### Q4 ★ CONFIRMED 可伪造（技术深挖）
**问**："DB 层 checks 全 PASS 的 CONFIRMED envelope 能落库吗？CONFIRMED 能骗吗？"
**锚**："CONFIRMED 不是物理不可伪造，反 theater 靠**证据充实度 + 外部 anchor**，非单一硬墙。"
**展开**：诚实承认 sealer 层 CONFIRMED→INCONCLUSIVE 是软约束，DB 层 0008 trigger 只在 checks 含 WARN/FAIL 时拦；构造全 PASS 需真实证据充实度（`AT-FAKE-PASS` 检测），外部 anchor 提供独立交叉验证。**不可声称"CONFIRMED 物理不可伪造"**。

#### Q5 ★ 测试数（数字诚实）
**问**："你说有 N 个测试，具体多少？"
**锚**："以答辩前 `node --test --test-reporter=tap` 实测为准，现场展示真实数字。"
**展开**：禁手填（D12）。演示时直接跑 test runner 展示真实计数（`far status --json` `testCount`）。若仍 Pending，诚实说"测试数在持续增长，以 CI 实测为准"。

#### Q6 ★ Right-to-History 抢先
**问**："Right-to-History (arXiv:2602.20214) 2026-02 就说'首个 CT for agent execution'，你不是首创吧？"
**锚**："对，我们不是首创。FAR-Chain 是这条拥挤赛道上'**科学证伪专用 + 三路可独立验真**'的变体。"
**展开**：主动展示谱系图（PCC1996→CT→{Right-to-History, AgentLedger, Log-is-the-Agent}→{POPPER, PCA}→FAR-Chain）。诚实承认后发 = 反 theater 加分。状态：Right-to-History 同构度 `UNVERIFIED`（须 PDF 前核 arXiv 原文）。

#### Q7 ★ 跨语言字节相等只到 Node/Python（技术诚实）
**问**："你说三路字节相等，但浏览器路 canonicalHash 是 TS 重写，不是跨语言吧？"
**锚**："跨语言字节相等在 **Node=Python 路**成立；浏览器路是**同语言（Node TS→Browser TS）独立环境**重算。三路是'3 independent re-implementations'非'3 cross-language'。"
**展开**：HonestyBanner 已前置标注。真正 cross-implementation 需 Go/Rust 重写 verifyChainHead（V2+）。

#### Q8 ★ 1e-7 鸿沟没解决（诚实深挖）
**问**："1e-7 这个鸿沟你没解决，是不是说明跨语言字节相等不成立？"
**锚**："恰恰相反——**能精确指出 1e-7 边界用例，证明字节相等是真跑出来的**。这是 V3 RFC 8785 JCS 迁移回归门。"
**展开**：golden_vectors 锁定 N2b_sci_1e-7（TS '1e-7' vs Py '1e-07'）；canonicalHash 4 字段白名单全 string，信任根 byte-equal 不受数值域影响；1e-7 是数值序列化层的已知差异，刻意用 `assert.notEqual` 锁定为回归基线，禁伪造绿。

#### Q9 ★ tamper-evidence vs tamper-proof
**问**："DROP TRIGGER 能绕过 DB 层，你的 anti-theater 是 tamper-proof 吗？"
**锚**："**tamper-evidence 非 tamper-proof**。篡改可被检测（哈希链断裂），不是物理不可篡改。"
**展开**：诚实承认 SQLite trigger 可被 DROP 绕过，但哈希链（canonicalHash prevHash 链式）使任何篡改在验真时暴露。tamper-evidence 是透明日志（CT/RFC 6962）的标准语义，FAR 不假装 tamper-proof。

#### Q10 ★ 五值裁决 vs 类型系统
**问**："五值裁决不就是 if-else / 类型系统吗？"
**锚**："裁决器**确定**（`decideVerdict` 纯函数零 LLM），但**输入**（evidence/support/refute）来自 LLM/人工——所以它不是编译期类型系统，是**运行时确定性裁决 + DB ABORT 物理约束**。"
**展开**：不 claimed 类型系统（易被"输入是 any"击穿）。novelty 落在"确定性规则裁决 + DB ABORT 物理兜底"+"五值（含 INCONCLUSIVE/DEGRADED_SCOPE）搜索零命中"。

#### Q11 ★ 证据链全是 AI 产物（Z2-BOOTSTRAP 自举·补条）
**问**："证据链从 claim 到 evidence 全是 AI 写的，可信性何来？"
**锚**：见 §4.5 答辩锚。

### 6.2 三个失败路径演示（必演）

无论哪个答辩版本，**诚实自爆幕不可砍**——它是反 theater 的灵魂，砍掉则前面所有验真的可信度归零。

1. **三路字节相等**（Node/Python/Browser 同 hash）→ 一字节翻转三路同时红 `TAMPER DETECTED at seq=4`。
2. **1e-7 红灯特写**：`cross_lang_consistency.test` N2b_sci_1e-7 `assert.notEqual('{"n":1e-7}', '{"n":1e-07}')` → "这是我们没解决的 1e-7 鸿沟——它证明字节相等是真跑出来的。"
3. **谱系图承认后发**（PCC1996→CT→...→FAR-Chain）→ "我们是这条赛道上科学证伪专用的变体，不是开创者。"

### 6.3 演示失败三级后备（Plan B/C/D）

> 假设：答辩日评委笔记本环境不可控（Windows/无 build tools/断网/版本不匹配）。三级后备逐级降级，**任何一级都要保证三路验真核心可演**。

| Plan | 触发 | 后备动作 | 诚实话术 |
|---|---|---|---|
| **B** | 网络/安装失败 | 预打包 `.far-proof.tar.zst` 离线包 + 预编译 `better-sqlite3` binary（Win/Mac/Linux）+ 预 bundle `verify.html`（esbuild 单文件）+ 离线 `node_modules`；评委无需联网编译，解压即跑 | "为规避环境差异，使用离线包" |
| **C** | 评委笔记本彻底不可用 | 主讲人自备已验证环境笔记本 HDMI 投屏；评委可上台亲手操作主讲人笔记本 | "为规避环境差异，使用预验证环境，评委可上台亲手操作" |
| **D** | 极端故障（全黑） | 预录三路验真全流程 4K 录屏兜底；现场至少保留"主讲人翻转一个字符 → 指出哈希链断裂位置"的口算演示（不依赖任何软件） | 直接说"切换到 Plan B/C/D"，**不可掩饰** |

**铁律**：演示失败时不可掩饰，直接说"切换到 Plan B"。诚实本身就是反 theater。Plan B/C/D 必须答辩前 3 天各演练一次。

### 6.4 核心答辩 Q&A 必答四问（基础底线）

#### 问：你们是不是又做了一个 AI Scientist？
答：不是。AI Scientist 生成或执行科研工作，FAR-Chain 验证其输出的科学声明是否满足冻结证据契约。

#### 问：hash 不就是普通防篡改吗？
答：普通 hash 只能发现字节变化。FAR 的 proof input 还绑定 FEC、数据、workflow、统计计划、执行痕迹和五值裁决 trace。复制 hash 易，复制闭环难（FEC freeze + dataset/workflow/stat binding + deterministic verdict + ProofEnvelope + independent recomputation + anti-theater attack corpus + claim graph + benchmark suite + honest defense discipline）。

#### 问：你们证明结论正确吗？
答：不。我们证明的是该证据包在冻结契约下如何被裁决，以及第三方能否重算并发现篡改。验证的是"是否通过预注册证据检验"，不是证明真理。

#### 问：LLM 自己生成再自己验证，有意义吗？
答：LLM 不被信任为最终裁决者。FEC validation、statistical evaluation、verdict kernel 和 proofHash 是确定性机制（F3）。

#### 问：为什么不是二值通过/失败？
答：科学证据常见的是证据不足、范围缩小、结果冲突。五值裁决防止把不确定性伪装成通过（`UNTESTED` 防假成功；`DEGRADED_SCOPE` 防过度外推；`INCONCLUSIVE` 防二元剧场）。

---

## 7. 对外材料检查表

### 7.1 发布前必检（15 项）

> 每次更新 README / PPT / 答辩稿 / 报告 / PDF 前，逐项打勾。与 `APPENDIX_F_GLOSSARY.md` §10 一致。

- [ ] 是否用了主名（`APPENDIX_F` §4：`FAR-Chain` / `真研 FAR-Lab` / `FEC` / `ProofEnvelope` / `Trust Receipt` / `proofHash` / `ledgerRoot` / `canonicalHash` / `golden vectors`），未用弃用名（Ψ / Ω / `far-chain/` / 4 值枚举 / `ACCEPTED`/`REJECTED`/`DEGRADED`）。
- [ ] verdict 是否只用 5 值（`CONFIRMED`/`REFUTED`/`INCONCLUSIVE`/`DEGRADED_SCOPE`/`UNTESTED`），无第六值。
- [ ] 是否出现 §2.1-§2.4 禁用词（D1-D15 / V2-1 至 V2-10 / DO_NOT_CLAIM 7+1 条 / 假绿 6 条）。
- [ ] 是否手填裸数字（测试数 / 文件数 / CI 通过率 / benchmark 数 / commit / 竞品时间）——应来自 `far status --json`；未覆盖字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。
- [ ] 路径是否写 `<REPOSITORY_ROOT>/`，未写 `far-chain/`（作为真实实现根）或 `packages/`（作为真实实现根，标 V3 路线图）。
- [ ] 是否把"可验证"读成"证明为真"（D1）；是否把 hash 说成物理安全（D2）。
- [ ] 是否暗示 FAR 取代同行评审（D5）。
- [ ] 是否声称所有 verification 已跨语言完成（D8）；是否把 browser verifier 说成完整跨语言第三方验证。
- [ ] 是否把 LLM reviewer 当 final judge（§4）；是否把 `UNTESTED`/`INCONCLUSIVE` 文案改成 `CONFIRMED`。
- [ ] 是否把 V3 路线（Rust/Go/WASM full verifier / external transparency log / full formal specification / FAR-Level 4 supply-chain profile / large public benchmark / third-party verifier ecosystem）写成当前完成。
- [ ] 是否把 `.far-proof` 自验证冒充第三方验证（RR-2）；是否把 `.far-proof` 说成 IETF/RO-Crate 官方认证（D9）。
- [ ] 是否引用未复核外部事实（应标 `NEEDS_EXTERNAL_VERIFICATION`；博客/媒体数字须标来源性质）。
- [ ] 是否遗漏 Trust Receipt 的 `limitations` 段（省略即违反诚信红线）。
- [ ] 是否每个能力都带了 §1.3 状态标签（`IMPLEMENTED_VERIFIED`/`IMPLEMENTED_UNVERIFIED`/`PARTIAL`/`DESIGN_LOCKED`/`ROADMAP`/`RESEARCH`/`RETIRED`/`NEEDS_EXTERNAL_VERIFICATION`），未混写"已实现"和"应实现"。
- [ ] 是否写入真实个人路径、用户名、邮箱、密钥或本机信息（守 S1 / `42_PRIVACY_AND_PROFESSIONALISM_GUIDELINES.md` R1-R7）。

### 7.2 谱系图诚实守则（novelty 边界）

> novelty 口径全部 hedge，无单点首个声称（D10/D15）。答辩前查新清单扩展（59 决策④）：覆盖 MLAgentBench / SCITT / C2PA / Sigstore，标注"待查新同构度评估"，**不**断言一票否决。

```text
        PCC 1996 (Necula, Proof-Carrying Code)
                        │
                CT / RFC 6962 (透明日志)
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  Right-to-History  AgentLedger    Log-is-the-Agent
  (2602.20214)     (SSSR6417378)   (2605.21997)
        │               │               │
        └───────┬───────┴───────┬───────┘
                │               │
            POPPER          PCA
          (2502.09858)    (ACSAC2025)
          二值证伪        验provenance
                │          不验truth
                └─────┬─────┘
                      │
              ★ FAR-Chain 2026
      「科学证伪专用 + 三路独立验真 + 五值 anti-theater」
```

投影此图 + 一句"我们是这条赛道上科学证伪专用的变体，不是开创者"= 反 theater 加分。状态：所有外部引用同构度 `UNVERIFIED`，须 PDF 前核原文。

### 7.3 复制成本矩阵（护城河证据·诚实口径）

> 取自 `72`。回答"别人两周抄一个 hash + report 系统，你们凭什么不可复制？"

| 核心件 | 浅复制会被打穿（reasonCode） | 深复制需要 | FAR 当前状态 |
|---|---|---|---|
| FEC | `POSTHOC_THRESHOLD_DEVIATION` / `PRIMARY_METRIC_SWAPPED`（无统计计划） | measurement / stat plan / freeze / deviation | `DESIGN_LOCKED` |
| 五值裁决 | `MULTIPLE_TESTING_UNCORRECTED`（不处理 null/untested/scope） | deterministic kernel + rule trace | `DESIGN_LOCKED` |
| Evidence binding | `DATASET_HASH_MISMATCH` / `DATASET_SCHEMA_MISMATCH`（dataset drift） | content/schema/stats/license/source | `DESIGN_LOCKED` |
| ProofEnvelope | `REPORT_VERDICT_MISMATCH`（report/proof mismatch） | self-excluding proofHash + verifier | `IMPLEMENTED_VERIFIED`（V1）/ `DESIGN_LOCKED`（V2） |
| Independent verifier | shared bug（同代码 recompute） | TS/Python/Browser/Rust/Go vectors | `IMPLEMENTED_VERIFIED`（Node/Python/Browser）/ `ROADMAP`（Rust/Go） |
| Anti-theater | `EVIDENCE_INSUFFICIENT`（全 PASS fake） | attack corpus + false green metric | 19×`DESIGN_LOCKED` + 1×`ROADMAP`（AT-OVERFIT） |
| Defense discipline | overclaim kills trust | DO_NOT_CLAIM + hedge + source cards | `IMPLEMENTED_VERIFIED`（本文件） |

复制成本估算（设计分析，非工期承诺）：hash+report（2-5 天·低）→ append-only evidence log（1-2 周·中）→ FEC+statistical kernel（3-6 周·高）→ cross-language proof verifier（4-8 周·高）→ AI4S adapter ecosystem（2-4 月·很高）→ full claim graph + FAR-Bench500（3-6 月·极高）。

---

## 8. 错误分类（Error Taxonomy · 取自 `35` §4）

### 8.1 错误码体系

```text
FAR-CHAIN 错误码 = 字母前缀 + 4 位数字
  前缀:
    FEC-xxxx  FEC 编排层错误
    GW-xxxx   LLM Gateway 错误
    EV-xxxx   Evidence/verdict 错误
    DB-xxxx   SQLite/迁移 错误
    SDBX-xxxx Sandbox 错误
    HASH-xxxx Hash/验证 错误
    CFG-xxxx  配置错误
    SEC-xxxx  安全违规
    NET-xxxx  网络错误
    PROV-xxxx Provider 错误
```

### 8.2 关键错误码（与 §5 Ask Layer 联动）

| 错误码 | 消息 | 原因 | 处理 | FATAL? |
|---|---|---|---|---|
| FEC-0001 | `FEC_MISSING_SOURCE_ANCHOR` | claim 无 sourceAnchor（F7 三件套） | throw → 不进链 | 是 |
| FEC-0002 | `FEC_MISSING_REPRO_HASH` | claim 无 reproHash | throw → 不进链 | 是 |
| FEC-0003 | `FEC_MISSING_FALSIFICATION_SPEC` | claim 无 falsificationSpec | throw → 不进链 | 是 |
| FEC-0004 | `FEC_FALSIFIABILITY_GATE_FAILED` | FalsificationSpec 不可证伪 | throw → 不进 evidence | 是 |
| EV-0001 | `VERDICT_MAPPING_UNDEFINED` | verdict_mapping 无对应路径 | throw → 不进 verdict_nodes | 是 |
| EV-0002 | `VERDICT_ENUM_INVALID` | verdict 值不在 5 枚举中 | throw → 不进 verdict_nodes | 是 |
| DB-0003 | `TRIGGER_MISSING` | append-only trigger 不存在 | 阻断启动 | 是 |
| HASH-0001 | `CANONICAL_HASH_MISMATCH` | TS vs Python hash 不等 | R2 红 → 阻断 CI（RK-02） | 是 |
| SEC-0001 | `SECRET_IN_CODE` | grep 检测到密钥明文 | CI 红 | 是 |
| SEC-0002 | `INSECURE_HTTP` | HTTP 连接（禁 HTTPS） | 阻断请求（TLS_ERROR NET-0002） | 是 |

---

## 9. 状态与边界总结

| 模块 / 风险 / CI gate | 状态 | 备注 |
|---|---|---|
| 禁用口径对照表（§2） | `IMPLEMENTED_VERIFIED` | D1-D15 / V2-1..10 / DO_NOT_CLAIM 7+1 / 假绿 6 条已固化 |
| 风险登记册 RK-01..12（§3.2） | `DESIGN_LOCKED` | 概率影响为 `[估计]`，待 day-1 实测复核 |
| 安全威胁模型（§3.3） | `DESIGN_LOCKED` | 取自 `35` §1，安全分析待 day-1 真运行 |
| 不可降级项（§3.4） | `IMPLEMENTED_VERIFIED` | 已固化，与 T1/F1/F9/S1/C13 咬合 |
| LLM 使用边界（§4） | `IMPLEMENTED_VERIFIED` | F3 + CI grep `no_llm_final_judge_scan` |
| Ask Layer（§5） | `IMPLEMENTED_VERIFIED` | 9 类工程操作 + 运行时阻断 + FEC fail-closed |
| 答辩 Q&A 底线（§6） | `DESIGN_LOCKED` | 11 问预案 + 4 必答 + Plan B/C/D |
| 对外材料检查表（§7） | `IMPLEMENTED_VERIFIED` | 15 项发布前必检 |
| 错误分类（§8） | `DESIGN_LOCKED` | 取自 `35` §4 |
| FallbackChain | `DESIGN_LOCKED` | 取自 `24` §5 / `35` §6.1，待实现 |
| 数据源降级 | `DESIGN_LOCKED` | 取自 `24` §6，待实现 |
| Demo 降级预案 | `DESIGN_LOCKED` | 取自 `24` §9，与 `61` §3 同步 |
| 降级代码实现 | `PARTIAL` | 部分已实现，待补全 |

**一句话边界**：本文件是 FAR-Chain 风险登记与禁用口径权威。FAR-Chain 可以强，但必须诚实——可信度来自敢于输出 `UNTESTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE`。LLM 不得作为最终裁决者（F3）；裁决 deterministic；篡改可检测（tamper-evident）非物理不可篡改（tamper-proof）；所有数字（测试数 / CI 通过率 / 攻击命中数）由 `far status --json` 与 CI 回填，**不**手填。任何对外材料出现禁用词、裸数字、`far-chain/` 路径、第六值 verdict、把 LLM 当 final judge、把 V3 路线写成已完成，即视为违反本文件。

---

## 10. 来源溯源（物理档案已退役）

本文件并入的内容来自以下 `FINAL_PACKAGE/` 编号文档。物理档案已退役，离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。旧编号→新位置映射见 `08_TRACEABILITY_MATRIX.md`。本文件自包含，以下仅作来源溯源（非有效依赖）：

| 旧编号文档 | 并入内容 | 并入位置 |
|---|---|---|
| `02_CONSTRAINTS_AND_RED_LINES.md` | 红线体系 L0-L3、DO_NOT_CLAIM 7 条、假绿 6 条、降级铁律 F11、Ask 层 9 类、优先级裁决 | §1.3 / §2.3-§2.4 / §3.4 / §5 |
| `24_RISK_AND_DOWNGRADE_PLAN.md` | 降级哲学、风险登记册 RK-01..12、FallbackChain、不可降级项、Demo 降级预案、诚实状态 | §1.2 / §3.2 / §3.4 / §6.3 |
| `35_SECURITY_AND_FAILURE_MODEL.md` | 威胁模型、信任边界、已知安全局限、错误分类体系 | §3.3 / §8 |
| `59_ADVERSARIAL_AUDIT_VERDICT_AND_CORRECTIONS.md` | W0-7 措辞订正（trigger tamper-evident / Core 中立 / 自举 Q&A / snapshot 时间炸弹）、novelty 维度归属、诚实护城河 | §2.1 D2 / §4.5 / §3.2 RK-01 / §6.1 Q11 |
| `61_DEFENSE_BATTLE_MANUAL.md` | 15 问预案、Plan B/C/D、谱系图、三路验真演示 | §6.1-§6.3 / §7.2 |
| `68_ANTI_THEATER_ADVERSARIAL_HARDENING.md` | AntiTheaterHarness、20 攻击目录、null result first-class、AntiTheaterScore、答辩口径 | §4（LLM 边界）/ §3.4（详见 `APPENDIX_E`） |
| `72_MOAT_HARDENING_AND_COPY_COST_ANALYSIS.md` | 复制成本矩阵、护城河加固、评委追问口径 | §6.4 / §7.3 |
| `74_DEFENSE_WEAPON_EXTENSION_Q21_TO_Q50.md` | Q21-Q50 答辩武器扩展（null result 一等证据 / UNTESTED 优势 / 复制成本） | §6.1（取部分锚句） |
| `42_PRIVACY_AND_PROFESSIONALISM_GUIDELINES.md` | 隐私占位词表、R1-R8 诚实职业纪律、AI agent 输出 sanitize | §7.1（最后一项检查） |

> 冲突处理（遵守 `01` §2）：本文件（P0）与上述来源冲突时，以本文件与 `APPENDIX_F_GLOSSARY.md`（P0）为准；旧 `FINAL_PACKAGE` 编号文档（P3）仅作来源。裁决枚举、优先级、路径写法、禁用词以 `APPENDIX_F` §3.1/§3.2/§7/§6 与 `01` §1 为权威。anti-theater reasonCode / attackId 以 `APPENDIX_E` §0.3 为权威。

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目原为融合 backlog；当前 FUSION-OS-1..14 已由受控突变双跑写回 `WIRED_GREEN`，唯一剩余红项见 DEPTH_LEDGER §A `P1-3_DASHSCOPE_CI_EVIDENCE`。

### 与本文档（07_RISK_REGISTER_AND_DO_NOT_CLAIM）相关的融合缺口

- **FUSION-OS-2 / FUSION-OS-4**（§188 OS 隔离风险的用户态缓解）：sandbox spawn 用 detached=true 独立进程组 + 超时 `process.kill(-pgid)` 组播清理（防 numpy/OpenBLAS 子孙成孤儿）+ spawnVenv 前 `preflightWorkingDir` 预算扫描（.git-cap / symlink-O_NOFOLLOW / container 检测）；Open Science setsid + gitScanWorker 范式。**真 OS 级隔离仍 V2（§188 自承做不到），这是用户态降级，绝不宣称运行时隔离。**
- **FUSION-OS-8**：spawn env 剥离 secret 白名单（`*_API_KEY` / `*_SECRET` / `*_TOKEN`）+ Python `addaudithook` 拒绝可写目录 dlopen；Open Science secret-strip + dlopen guard 范式。
- **FUSION-OS-6**（假绿 6 条补充·新型假绿）：LLM 自证 provenance（来源由被验证方/工作负载自填而非系统重算）是新型假绿 —— Open Science `data_vid=None` 范式要求来源字段强制 null + 系统 hash 重算绑定 + `provenanceClass` tag。

> 接线时升 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN（见 DEPTH_LEDGER §D）。取序建议见 CLAUDE.md §4 P-FUSION。
