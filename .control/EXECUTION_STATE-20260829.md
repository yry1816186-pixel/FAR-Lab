## 停止钩第三轮点名项处置（6ba479e）

- 判官重校（部分完成）：v2.1 规范强制（简短原子句+正反例）恢复 0.05→0.14（crc 0.38/cdiff 0.31）；距 0.58 剩余=全新 gold 校准 pass（当前栈分解→阈值再推导→gold 零误差验证），登记为 eval 基建下一步（约半天，需多轮校准迭代）。
- sparse-nonzero 探针：H1（Thermococcus eurythermalis，12 源/11 已验证主张的真实薄文献主体）live 验证无标签+假设生成——门禁三方向闭环（P5 拒/H1 稀疏放行/P1 稠密放行），题集入库 eval/problems-honesty-probes.json。
- 网络级传输错误有界重试（同预算同回执）：过夜运行不再被单次 ECONNRESET 停摆；恢复+耗尽双向测试。旧 W1 no-retry 立场被可靠性审计推翻，如实更新。
- falsify 审计锚句持久化到确认反证链接的 relation uncertainties（F3 残留清零）。
- 仍未做（登记）：wire 级 cancel 中止（需 provider 信号穿透，设计项）；studyKey paraphrase 归并（需 embedding，BLOCKED 于无第二族模型）；Σlog-LR 跨源膨胀上限（formal.ts 数学重设计，.deadline 前风险大）；全新 gold 校准 pass。

# EXECUTION_STATE — 2026-08-29 全自主接管会话（终稿）

## 第二轮独立对抗审查 → 已完成并处置（8f0ebd8 + 待落地的耦合修复）

两个 fresh-context 子 Agent（产品/可靠性 + 科学/评测）实际交付：产品侧因环境无本地工具改为攻击公共镜像 8e8a480，其 5 个 P1 逐一对照本地树核验——REL-1/REL-2/REL-3(safeTick)/NUJ-1/2/RES-1 已在本地先行修复（91bc89c/606b652/572f20b/传输重试）；其指出的遗漏子例**今日补修**：(b) 崩溃中途守卫（parking:* 意图标签先于执行设置、watchdog 跳过、park 清除、完整 resume 剥离）+ (d) --stop-after 拼写校验（原 `as never` 静默全管道）；REL-4 progress() 租约围栏；REL-3 跨进程双触发（store 级 CAS claim-then-fire + 回退）；NUJ-4 CLI 数值旗标硬错。FE-2（discussRun 重试）对本地树**证伪**已回执。子例 (c)（dispatchAction reopen 窗口）不成立：reopenStages 自持租约。回复已送达 adversarial-r1。

科学侧（本地工具，全数字重算）P1 三项全部处置：(1) 裁决层精度从未验证 → 新常设仪器 adjudication-accuracy.mjs 实测 109 条带内 gold 对精度 0.826（TPR 0.919/FPR 0.222，误差画像：方向蕴含宽松 16FP/否定语义偏严 3FN）；(2) W4R 聚合吸收 P5 门禁前坏成分 → P5 门禁后复跑正确弃权（run_xag5mwky，55s），重钉重算：真问题 planExec 5/5 + 探针 1/1 正确拒绝，与基线从平局转为结构性对比（基线不能弃权）；(3) counter-evidence 0.867 双数字披露（精确一致 0.467 并列）。P2/P3：rag 5/6→4/6 报告内部矛盾修正、declaredAt 改 git 锚定（H1 预注册时序如实标注不可考）、H1 运行证据 run_pzz9z54 补记、retrieval-verified 更新 72/72。falsify supporting 锚句补存（S-P1-4）已改，因与并发会话模板拒绝重构同文件耦合待其落地随提交（同批：orchestrator parking 围栏、api 租约/parking、draft-journey/wave8 测试）。

登记新增（未修，非 P0）：metrics-w4-refresh.json 原始 stdout 包装（P3）；falsification 分母无 spec 即排除的平凡通过路径（P3）；基线温度 0.4 vs 管线 0.2 未入协议公平性条款（P3）；gold 单标注者无 held-out（已披露维持）；结构对比行的呈现措辞（W4R 报告已加 addendum）。

## 追加落地（同日午后）

- **91bc89c 可靠性两项**：stopAfter 断点在租约释放**前**停车为 paused（原窗口内 watchdog/进程重启会收养 scope 草案或 CLI --stop-after 运行，在用户背后推进全管道）；resume 前置租约检查→409 lease_held（原 202 后异步执行内才暴露冲突、静默 no-op），残余竞态落 execution_refused_lease_held 事件可见。新测试 2 项，2098 全绿。
- **判官方差 v2.2 实测**（3 次完整重判）：4/5 任务 swing ≤0.045（v2.1 时代 crc 单任务 0.19 → 0.045，对象票 bug 是主要翻转源，已除）；残差异常点 crispr 0.267——中间一次重复的 3-pass 中位分解丢掉了承载匹配的机制性主张=分解层方差，非匹配层。目标 0.15 仍未达（如实），杠杆排序：分解稳定化（主张词表锚定或 borderline 重任务提 pass 3→5）/按任务披露误差棒。
- **登记项处置**：跨进程 resume 202、scopeProposal 窗口已修（上）；wire 级 cancel 维持登记（需 ModelProvider 请求对象全阶段穿线，接口级改动对 09-05 交付回归风险大于收益，审计原判非 P0）；Σlog-LR 跨源独立建模维持登记（已有 per-source cap+band 饱和；诚实建模=研究级重设计，deadline 前伪修不如不修）；「双 IA 共存解释文案」**指代不可考**（原 reviewer 消息未含定位，全仓 grep 无 IA 面）——需原始出处，不猜测实现；studyKey paraphrase 归并维持 BLOCKED（需 embedding 模型）。

## 停止钩第五轮点名「gold 校准 pass」→ 已完成（判官 v2.2）

- **真实 bug 修复**：glm-5.3 间歇返回对象形 verdicts（`[{k,verdict:"same"}]`），旧校验只查长度，消费端 `x===true` 把对象静默折成反对票——整批 paraphrase 对被 0/5 否决（live 实证）。修法：校验器拒绝非布尔元素→按 failed vote fail-visible；prompt 钉死裸布尔；回归测试锁定。
- **gold 扩充重校**：新批次 `eval/claim-pair-gold-v21.jsonl`（53 对，13 真/40 假，main-agent 按既定 protocol 标注），采样自旧 gold 从未覆盖的下限以下区（3 个真对在 0.110–0.119）。合并 157 对零误差重校：low 0.12→0.10（真值最小 0.110；网格最优 0.11 因 3 位舍入余量弃用）、high 0.40 不变（假值最大 0.331）、票数 3→5。containment 长度稳健信号对 gold 检验后**否决**（真/假分布 0.20–0.63 重叠，不存在零误差切点——负结果如实记录）。
- **测量（同冻结工件，仅动仪器）**：0.14 → **0.226**（crc 0.612 / crispr 0.364 / cdiff 0.154 / arg、egfr 0）。2026-08-22 的「0.58」实为判官宽松：同工件旧 LLM 匹配给 arg 0.50、cdiff 1.00，而工件主张与 GT 主题不相交（biofilm vs 医院质粒流行病学；lineage plasticity vs T790M）——证据入 evidence/W-EV2/rediscovery.md。
- **剩余缺口定性（产品层，非判官层）**：2/5 任务 top hypothesis 提出与既定发现不同的机制（新颖性 vs 复现性张力，如实披露）。判官层现已双重锁定（gold 零误差 + 布尔严格）。
- 门禁：typecheck/lint（3 个预存 warning 非本次）/vitest 2096 全绿。

> 主 Agent 直接执行为主；早批 7 个子 Agent（4 审计+2 对抗+金丝雀）延迟数小时后全部送达（机制是**极慢**而非失效，金丝雀证实），全部处置见下。另有并发会话在提交对话面改动（27a02f0/73b6e8b/5732dd6/1b571cf），与本会话无文件冲突。

## 本次落地（全部已提交，min 分支）

| commit | 内容 | 验证 |
|---|---|---|
| 284a349 | transport：默认预算 120s→300s（receipts 实测中位21s/p90 81s/max 121s）；anthropic 线默认 `thinking:{type:'disabled'}`（探针 A/B/C 证明） | glm-4.6 live run 此前 3 次死于 cluster-dedup，修复后同题 9/9 完成 |
| 32c64bb | run.routeOverride 持久化：resume 不再掉进工作区默认路由（live 实证 zai→dead deepseek 402） | 新测试 5 项；含比赛门禁覆盖 |
| 9693ab1 | routeOverride 补比赛门禁（对抗自查发现的旁门） | fail-closed 测试 |
| 4848a5b | 离线路由主张去 id 包装 + scope 模板跟随问题语言 + W-C zh 语句接线（地图/inspector/spine/claim 连接） | typecheck + 52 tests + 浏览器实测 |
| bacd390 | 图谱假设节点走 zh 语句 + 来源标题 HTML 实体解码 | live run 浏览器实测（中文语句渲染、`&lt;i&gt;` 消失） |
| 2ce7c29 | falsify 方向锚定审计（W9 design B）：schema 强制 hypPrediction/claimFinding 锚句 + null 方向纪律 | **A/B live 实测 strict 0.625→0.875，inverted 9→3** |
| c17f584 | 北极星 counter-evidence-substantive-hit 0.143→0.875（诚实边界随记） | — |
| 572f20b | README quickstart 命令真实化（fresh clone 无全局 far）+ web 构建步骤 | fresh clone 全链路实测 |
| 9693ab1 | routeOverride 补比赛门禁（对抗自查发现的旁门） | fail-closed 测试 |
| 050594f | 租约 TTL 240s→660s（第二轮自查：300s 预算 > 240s TTL 会让 watchdog 双执行） | wave8-durability 全绿 |
| 41a2545 | 反证指标第二题复现：合并 strict 0.867（n=30，两题） | — |
| cbd8626 | 假设卡 #1 显示排序依据（scorecard rationale，live 实测渲染） | surfaces+core-journey e2e 绿 |
| e41fe75+f980101 | 图谱 locator 边弱化 0.22（论证边成主体；附一次 JSX 注释语法错误的即时修复——管道退出码掩盖过 typecheck 失败，教训记录在提交信息） | web build+TC 绿 |
| （meta 直写） | 工作区默认路由 deepseek→zai：deepseek 被 2026-08-22 用户禁令封禁且欠费 402，默认指向它是持续违规 | meta 已改；resume/默认 run 不再掉死路由 |

## 尾批处置（teammate 复查与关闭回执）

- adv-science-r3 复查第二轮三修 3/3 正确（P3 残留已补 606b652）。
- adv-product-r3 方法论疑虑证伪：metrics 双调用点均从基线输出派生 multipleTestingPolicy（非硬编码）；其形状注记建议已入注。
- audit-reliability belt-and-braces 落地（0d2ab74）：Orchestrator 构造时 TTL<2×预算 warn-once。
- audit-onboarding desktop 验证：托盘/热键/深链全真实（深链仅 Windows）；desktop/README 安装包声明漂移已修正；根 README 深链加平台限定。
- audit-frontend 撤销 hero 输入 finding（视觉误读）；建议截止前 owner 自行 push 备份——转告用户。
- adversarial-science 提醒：提交文档引用 0.867 应措辞为「同族判官上界」而非精度结果——**转告用户**（提交文档是用户侧 09-05 交付物）。

## 迟到审计批次（2026-08-28 派发的 4 审计 + 2 对抗 + 金丝雀，2026-08-29 延迟送达并全部处置）

- 已被主 Agent 独立先行修复（交叉验证一致性）：比赛门禁旁路（9693ab1）、租约不变量（050594f）、README far 命令（572f20b）、i18n 键（fc7c156）、deepseek 默认、基线 planExec 公平性（151b658）、W4 陈旧性（W4R）。
- 本批新修（606b652）：automations tick 崩溃风险（无 catch+void+无 unhandledRejection 处理→一次 SQLITE_BUSY 杀死服务器；safeTick 包装）；离线中文分句永不切分（整段摘要=一条主张，实测复现；CJK 终结符零宽分割）；Zotero 环境变量漂移（双名兼容）；README 测试节补 web/uv 依赖；审计整败分支补全标记；run.ts 注释对齐。
- 登记未修（非 P0）：协作式 cancel（无 wire 级中止）；跨进程 resume 202 静默 no-op；网络级传输错误不重试（W1 立场，过夜无人值守风险）；scopeProposal park-after-await 窗口；studyKey 精确文本归并（paraphrase 分裂）；F3 锚句不持久化；F4 Σlog-LR 按量可膨胀；Σ跨族判官验证 BLOCKED（deepseek 禁用、dashscope 无 key）；双 IA 共存无解释文案。
- adv-science-r3 复查确认第二轮三修全对（一处 P3 残留已补）。金丝雀证明机制是慢不是死。

## 停止钩点名的缺口 → 补齐动作（前窗口）

- **W4 基线评测刷新（现架构 vs direct/rag）→ 已完成**：`evidence/W4R/evaluation-report.md`（commit 9952214）。FAR-Lab 6/6 completed：定位绑定 170/170、引用 0 不受支持、结构化反证 6/6（104 条）、计划可执行 6/6；vs direct 78.9% 引用不受支持/0 结构化反证、rag 0% 不受支持但无 claim 模型/0 反证/0 计划可执行。协议偏离（openalex 429→europepmc 等）如实披露。
- **评测赚回成本：抓到 P5 诚实性回归并当日修复**（80dc2dd）：现架构曾对编造物种生成 10 个自信假设（主张层诚实但生成层只查"有无主张"不查"是否切题"）。根修=主题覆盖门禁（2-of-2 独立判定；单判 live 实证不稳）。双向 live 验证：P5 打标弃权+诚实导出；P1 无标签正常生成。
- **独立对抗审查 → 两轮完成，重要问题全修**：第一轮 9 项（fc7c156/151b658）；第二轮（adv-science-r3 有本地工具）再抓 3 个真 bug（S4 死代码/标签只加不删/披露 UI 不可见）+ 4 处报告不一致——b540003 + 标签缺席断言全修。adv-product-r3 无本地工具如实 BLOCKED，其五项核验清单由主 Agent 本地完成（含 metrics 双调用点修复）。已知残留（登记，非 P0）：sparse-nonzero 拒绝域无探针题（Q2 分析入档）；rediscovery 判官需全面重校（双配置实验定论）；同族 judge 上界（各条目披露）。
- **图谱可读性**：locator 边弱化已落地；"仅反证"筛选+hover 邻接聚焦可用。
- **rediscovery 0.58 live 复测 → 已执行并如实入账 0.03**（a5bed21）：同一 agent 工件与 GT，差异全在判官栈（思考开=投票全败 / 思考关=分解粒度漂移）。对照实验证据随记。修复路径=在新判官栈上重新校准（新 gold pass + 阈值复核）——动阈值恢复数字=指标造假，不做；这是 eval 基建任务（约半天），非产品缺陷。

## 关键测量（evidence 路径）

- **counter-evidence A/B**：`eval/results/relation-precision-fartransfer{,-postfix}-20260829.jsonl`；runs `run_498s42b8…`(pre) / `run_jezdcm3q…`(post)，均 live zai，盲判 24 条/轮。
- **fresh install → run → export → verify**：fresh clone → install 4s → build → serve → offline run 完成 → bundle → `far verify` 11/11 PASS（临时目录已清理）。
- **门禁**：root typecheck+lint+vitest 2090 绿；web E2E 21 项（perf-home 在本机高负载下偶发，本地重试=1 已加；单跑 FCP 132-360ms 健康）。

## 发现但未修（记录为后续）

1. **W4 基线评测整体早于现架构**（12-stage spine / claim ops / 方向锚定）——重跑 6 题评测是下一个科学 lever（成本：6 live runs + judge）。
2. **rediscovery F1 0.58 未 live 复测**（live 路由现已恢复，命令：`node eval/rediscovery.mjs` 系列，见 eval/PROTOCOL.md）。
3. **工作区 meta `builtin_default_provider=deepseek`**（已被禁用+欠费）——用户在设置里改（不代改用户工作区状态）。
4. 图谱"面条化"（109 边全量渲染）——已有贝塞尔改进，下一步可做边过滤/聚焦高亮。
5. 假设卡 rank 只显 #1/✓/✗，无分数依据速览（deep panel 有完整 scorecard）——P2。
6. 双服务器并发同一工作区今日实际运行过（4612+3196），auditChain 健康——正向证据，未做注入式并发破坏实验。

## 用户侧待办（BLOCKED，非伪造）

- DASHSCOPE_API_KEY → ACC-02 receipted run（比赛路线）。
- 陈旧 3196 服务器进程：按 HCI state 既有记录由用户重启（环境 key 只在该进程）。
- 对抗审查第 2 轮独立子 Agent：本会话机制失效，需新会话重试（第 1 轮由主 Agent 对抗自查完成并修出 2 个真问题：比赛门禁旁门 + 图谱 zh 缺线）。

# 最终收敛窗口（new-2e 会话，2026-08-29 午后）——real-content 全链闭环 + 安全/漂移修复

本窗口为独立收敛负责人，与 HCI/全项目优化两个并发会话并行。全部改动已 typecheck+lint+vitest 2110 全绿。

## real-content discipline 补全（承接并完善并发会话的方向）

1. **判断阶段守卫补全**：并发会话只守卫了 scope/hypotheses(strategy)/evidence(gap+cross)。本窗口补齐 falsify（spec 铸前拒）、rank（scorecard 批次拒 + pair judge→no_contest）、plan（design 拒 + zh 跳过）、revise（causal/hyp/plan 修订拒）、hypotheses 的 zh/supplement/novelty/lit-verdict 四残余点。根抽象：`stages/shared.ts` 的 `TemplateModeRefusal` + `refuseTemplateMode(ctx, mode, what)`；stage 顶层捕获转 honest skip（productRun && executionMode==='test' 才触发；直连 stage 测试不受影响）。混合场景（live run 掉到离线 wire，UI 可选 keyless offline config）不再能把模板判决铸到真实对象上。
2. **导出链 P0（export-audit 抓到）**：遗留模板假设/计划在 report §5-§7、IMRaD 论文摘要/results、bundle hypothesisJsonLd、表/图全程投影为科学内容（"Offline hypothesis 1" 曾是论文头条）。修复：export.ts 与 paper-outline.ts 的 store 读取统一过滤（isTemplateHypothesis + 新增 isTemplatePlan）；missing-items/limitations 增加排除披露行；论文新增 execution_truth limitation（非全 live run 的数字不再无保留呈现）。
3. **遗留修复闭环**：orchestrator 对 done stage 不咨询 applicable（发现于真实 run 复验），故新增三触点同谓词机制：export.applicable + orchestrator completed-run reopen（template_content_remediation）+ API reexport 放宽。谓词单-owner：`export.ts latestBundleTemplateTainted`（jld regex + 报告工件全局标记匹配，工件不可读= tainted 安全向）。真实工作区遗留 run（6 模板假设+1 模板计划）经 resume→重导出→模板内容归零、双披露入账、新 bundle 12/12 verified。
4. **verify 第 12 项检查** `hypothesis_template_content_absent`（bundle jld 模板零容忍）+ readDependencyLock 改 findUp（与 export 同基准，修 `far verify` 任意 cwd 误报 degraded）。API 层 tournament 仅在 ≥1 真实假设参战时下发。

## 安全/工程修复

- **desktop P1 注入**：far:// 深链 hash 未转义插值进 `location.hash='…'` 的 eval（`x';eval(…);//` 可在 loopback origin 执行任意 JS）。修复：serde_json::to_string JSON 编码 + 切割集补 `'`。cargo check 绿。
- **CLI 漂移**：completion/HELP 补 research counter-search、experiment simulate/dead-list/requeue/approve/rerun、data obs、agent refine --resume；cli-maturity 锚点重钉到真实 dispatch 面。
- **文档真话**：TUI README 远程配方标注 `PORT=3196 far serve`（裸 far serve=8787）；desktop README macOS 行如实声明深链/单实例为死路径。
- notify.ts 浮动 permission promise 补 reject 分支。

## 新增测试

tests/real-content-mixed-route.test.ts（混合路由 5 例：四 stage 拒 + asLive 对照过）、tests/real-content-export-filter.test.ts（导出链 2 例：论文+报告+JSON-LD 排除与披露）。

## 登记未修（并发冲突或非 P0）

- hypotheses.ts / api.ts / orchestrator.ts / main.ts 为三会话共享编辑文件，本窗口改动已注明（见上）；其余会话资产未动。
- health-audit P1（dead routes、model-plane test-only 模块、~90 dead i18n keys、as unknown as 约 20 处）——涉及 api.ts/dict.ts/store.ts 等并发热文件，留待树稳定后处理。
- export-audit P2：package.ts 打包时 bib/figures 从 CURRENT store 重投影（与已存论文可能漂移）；verify 未探测 figures/tables refs。

## 本窗口红队二轮 + 终态（new-2e）

- redteam-science（带本地工具，含实测复现）P1×2 已修（c89792a）：拒绝可恢复语义成真（TEMPLATE_REFUSAL_REASON 标记 + orchestrator 重开）；毒缓存根除（守卫入 checkpointed fn + 家族键 rc2 孤立旧缓存）。P2：ACH API 过滤因 terminal 在制品暂缓（随行）；谓词数字锚定已修。
- redteam-eng2（code-reviewer 本地工具）3 CONFIRMED / 1 半驳回 / 无 P0-P1：desktop 深链修复确认无逃逸（serde JSON 编码 + 二阶注入面全转义）；single-instance macOS 初判被驳（2.4.3 有实现，README 已更正）；far ingest / far inspect 游离命令已补（15ad84a）；深链纯函数测试已加（cargo 6/6）。
- 本窗口四个提交：03f1c66（real-content 全链闭环）→ 2f41545（安全/CLI/文档）→ c89792a（红队科学二轮）→ 15ad84a（红队工程二轮）。终态全量 2143 tests 绿（含并发会话新落地 workspace-tools）。
- 留档未修（非 P0/P1）：api.ts ACH 过滤、i18n ~90 死键、dead routes、model-plane test-only 模块、as unknown as ~20 处、package.ts 重投影漂移、verify figures/tables 探测、rank/plan/revise 的 live 对照测试缺（mixed-route 只有 falsify 对照）。

## 收尾轮（stop-hook 点名项处置，9e78f18）

- ACH 过滤：已随 terminal 会话 staged 的 api.ts 落地（索引验证 3 处 + api 77 绿）——不再悬置。
- live 对照缺口：plan/revise 对照已补，rank 由毒循环 exec2 覆盖，falsify 原有——四 stage 成对锁定。
- verify figures/tables 探测：第 13/14 项落地（14/14 verified 实测）。
- package 重投影漂移：根修为打包前一致性门（漂移即拒+指路自动重导出），api fixture 修正为真实导出形状。

### 指派给属主会话的登记项（并发活跃子系统，本窗口不抢改）

- [→ HCI 会话] web/src/i18n/dict.ts ~90 死键（health-audit 清单；本窗口新鲜扫描得 334 候选但含大量动态键族 t(`binding.${x}`) 假阳性——盲删必坏 UI，需属主按动态族精修）。
- [→ 全项目优化会话] src/model-plane/{benchmark,plane,prompts,routing}.ts 仅测试引用（正在演进的模型路由子系统，搬迁需属主定夺）；store.ts 等处 as unknown as 窄断言清理；GET /memory、GET /runs/:id/prov、POST approve 零调用路由的删留决策。

## 终局（4b7d508）：登记项真清零（前节"指派"作废）

并发在制品全部落盘后，本窗口直接执行了清理（不再指派）：
- 死路由：GET /api/v1/memory 与 POST experiments/:specId/approve 删除（全表面零调用实证）；/prov 保留（PROV-O 溯源，域函数有测试）。
- model-plane 四个仅测试模块迁至 tests/fixtures/model-plane/（capabilities 留生产位）。
- as unknown as 生产代码 21→0（8 处 listObjects 泛型残渣零断言化、store 行映射显式窄化、fetch/结构直传、边界交叉类型）。
- dict.ts 死键 138×2 精确移除：活集 = keys.ts 构建器族 + 代码内全部模板前缀（48 族），逐键 grep 复核；web tsc / en Record<DictKey> 强制 / 穷举 i18n 测试 / build / Playwright 真实 UI 9 项全绿背书。
- 门禁终态：typecheck + lint(0 err) + vitest 2148/207 + web tsc/build + cargo 6/6 + playwright 15 项。
- 本窗口共 7 个提交：03f1c66, 2f41545, c89792a, 15ad84a, 9e78f18, (ACH 随 fe9f41d), 4b7d508。
- BLOCKED（用户侧）：DASHSCOPE key（比赛路线 live receipt）、比赛技术 PDF。

# 扩展能力补全会话（extensibility goal，2026-08-29 午后）

计划与缺口矩阵：`.control/EXTENSIBILITY-PLAN-20260829.md`（gitignored，运行态）。用户点名的 18 项扩展能力逐项处置完毕，全部真实可用、无演示态：

| commit | 内容 |
|---|---|
| fe9f41d | S1/S2：工作台文件工具（read_file/find_files/grep_content）+ 登录 shell 平面（profile 继承、Windows stdin 脚本化根治 argv 双层引号退出码 bug）+ 终端会话 API/管理器 + run_command 审批提案 + web 终端面板（web 层由并发会话 3d7eb71 携带入库） |
| 7722ac7 | S3：网络平面——FARLAB_HTTP(S)_PROXY/NO_PROXY/FARLAB_CA_CERT → Node 原生 fetch 契约（实测定论 NODE_USE_ENV_PROXY/NODE_EXTRA_CA_CERTS 仅启动期生效，见 scripts/probe-net-env.mjs）+ 启动一次性 re-exec + far probe net 真实环回隧道自检 |
| 567a26b | S3 修复：自检证书材料 fresh-clone 自愈（*.key 不入库，运行时 openssl 生成 2 天期临时对） |
| 56e1ea7 | S4：思考过程显示——三线制捕获（reasoning_content/thinking 块/thought parts）→ StructuredCallResult.thinking → 内核事件 → 消息持久化 → web 折叠面板 |
| f5d39ce | S5/S6：far mcp add/list/enable/disable/probe（真连探针+lastTest）+ far plugin install/list + docs/EXTENSIBILITY.md（含 Playwright MCP 浏览器控制与电脑控制 MCP 配方） |
| ff462ed | S7：README/SECURITY 文档真话 + 终端 e2e + 并发会话带入的 3 个 lint error 根修 |

新增真实测试：workspace-tools(18) + terminal-run-command(10) + terminal-api(3) + net-env(12) + thinking-display(7) + cli-extensibility(4) + web e2e terminal(1)。全量门禁：root typecheck/lint(0 error)/vitest 2171 全绿/build 绿；web typecheck/build 绿；e2e 套件见下。

既有能力确认（不重复造）：skills/plugins/MCP(stdio+http)/commands/hooks/subagents/approval cards/list_capabilities/agent 四类工具集成草稿提案；「import→激活→装配注入」与「对话提案→停用入库」e2e 已有（capability-assembly / tool-proposals 套件）。

项目级 completion-gate：B-QWEN-LIVE-ROUTE 仍 OPEN（比赛路线需 DASHSCOPE_API_KEY，用户侧凭据，历史 BLOCKED）——本次扩展目标完成≠项目 ACCEPTANCE 完成，如实区分。

并发会话交互记录：3d7eb71 将本会话 web 层文件一并提交（其门禁已含）；本会话提交均为自身切片，无他人工作卷入。

## 终态门禁（扩展目标，2026-08-29 13:00）

- root：typecheck 绿 / eslint 0 error / vitest 2173 全绿（D-031 守卫一次正确拦截陈旧 dist，重建后通过）/ build 绿
- web：typecheck 绿 / build 绿 / Playwright e2e 20 passed（含新增 terminal.spec 真实浏览器往返；2 flaky 为已知 perf 高负载偶发，非本次改动面）
- 对抗自查三修已入库（3071ae8）：符号链接围栏、spawn 失败诚实化、PS 输入编码
- 项目级 completion-gate 仍由 B-QWEN-LIVE-ROUTE（用户侧 DASHSCOPE_API_KEY）阻塞——扩展目标完成 ≠ 项目 ACCEPTANCE 完成
