# EXECUTION_STATE — 2026-08-29 收敛会话（协议层 / converge/protocol-execution，PR #131）

## 目标对齐

接管目标：FAR-Lab 从假设生成工具收敛为贯穿科研全过程的 research operating environment。
本会话选定的最大结构性缺口：**非计算型研究此前只有 execute 阶段的诚实 SKIP，没有任何可执行产物**
（目标原文：物理工作必须诚实转化为可执行 protocol、检查表、采集表、外部接口与人工确认节点，
绝不伪装成已执行）。

## 本会话落地（全部在 PR #131→#132，CI 为唯一验证面——本会话无本地执行工具）

1. **域模型**（src/domain/protocol.ts，12 项域测试）：
   - ProtocolSpec：预注册操作化——材料（含危章）/仪器（含校准要求）/分组臂/抽样计划/
     随机化序列（mulberry32+分块洗牌，种子=冻结 planHash，确定性可复现）/步骤
     （人工确认节点：human_signed/instrument_record/photo/witness）/测量变量
     （声明式 QC：range/required/enum）/伦理门（human_subjects 强制同意，
     requiresApproval 必须命名机构）/停止条件；planHash 冻结绑定，计划因果修订→重新注册
   - ProtocolExecution：append-only 人工背书台账；确定性状态机（伦理门 fail-closed、
     依赖序强制、类型/QC 校验、QC 失败值保留可见、终态闭锁）；采集表由变量投影（零 LLM）
   - 反馈桥：protocolOutcomeFeedback → FeedbackSignal(source=experiment) 进入既有因果链
2. **起草器**（src/experiment/protocol-from-plan.ts）：模型封闭空间提议，确定性组装
   （步骤重编号/依赖重映射/同意底线/分配降级），一切调整 draftNotes 披露；
   纯计算计划诚实 infeasible
3. **execute 阶段接线**：表格+文献池双腿不可用→协议回退（checkpointed 内
   TemplateModeRefusal 守卫，产品 run 拒绝模板协议；同 planHash 幂等）
4. **迭代语义**（src/app/iteration.ts）：已注册协议抑制 execute 触发器——机器迭代止于
   人工执行节点，停止提示指向协议；快照 +protocolsRegistered；ExperimentLegStatus
   union 不变（api/next-action/web 零破坏）
5. **HTTP 面**（src/server/protocol-ops.ts + api.ts 手术）：
   GET /runs/:id/protocol（协议+台账+采集表+步骤态）、
   POST /runs/:id/protocol/records（人工背书记录；完成/显式发布一次性铸造 experiment 反馈）
6. **大文件手术机制**：store.ts/api.ts/README 由 CI 内锚点脚本落库
   （scripts/surgery/*.mjs + .github/workflows/surgery.yml，fail-loud 唯一锚点 + 幂等，
   仅 converge/** 分支）——本会话无本地写权限下的安全路径，全部一次命中
7. **文档**：SCIENTIFIC_MODEL.md §7.5 协议语义 + §1 对象图 + §11 非目标边界
   （不成为 ELN/LIMS 替代品）；README 特性条目

切片 1 已合并 main（ec4cb26，PR #132 squash）：全量 213 文件/2205 用例
2198 通过 7 诚实跳过 0 失败；手术 workflow 合并前休眠。

## 切片 2（converge/web-protocol，PR #133）——web 表面

1. **web/src/api/protocol.ts**：协议 HTTP 契约镜像 + coerceMeasurementInput
   （数值本地收敛，避免 409 往返；5 单测）
2. **web/src/lab/ProtocolPanel.tsx**：范式/状态/planHash 冻结徽章；伦理门 fail-closed
   呈现与审批表单；步骤台账（依赖序按钮态）；测量记录表（QC 徽章+采集表披露）；
   偏差三问；暂停/恢复/中止（armed）；终态只读+结果发布状态；非 404 拉取失败可见
3. **StudyMap 锚点手术**（apply-web-protocol.mjs）：协议拉取并入 loadScience
   （404=无协议→带缺席）；band 位于假设带与结论回退之间；dict.ts zh/en map.protocol.*
   键；lab.css 样式。**中途一次错位**：band 落在结论条件括号内（相邻 JSX 根，
   lint/web 构建全红）——d607462 修正落位并加自愈逻辑（移除错位块+正确位插入）
4. **tests/protocol-api.test.ts**：真服务器 HTTP 契约（投影 200/404×2、依赖序 409、
   无效体 400、QC 失败值保留）——补上 #132 登记的 HTTP e2e 留白
5. 手术 workflow 分支作用域重启用→本切片末位重新休眠（仅 workflow_dispatch，零 job）

## 切片 2 迭代史（诚实，含本会话自误）

1. **根因一（诊断 #16 裁决）**：夹具用 newId('tsk') 铸出 tsk_…，而 ids.ts
   ID_PREFIX.task='task'（TaskId 要求 ^task_…）→ seedProtocol 的
   ProtocolSpec.parse 直接抛 ZodError，两个 HTTP 契约测试从未跑到断言。
   修复：newId('task')×2。
2. **根因二（我的一次反向误改）**：修复一时误把 409 的 error.code 期望从
   'validation' 改成 'state_conflict'——只读了 protocol-ops.ts 的内部错误码，
   没读 api.ts 路由层的公开词表收敛（apply-api-protocol.mjs 铁证：
   `code: e.code === 'state_conflict' ? 'validation' : e.code`，状态码 409 不变）。
   修复：改回 'validation' 并在断言处注明两层契约差异。教训：HTTP 契约以路由层为准。
3. **取证污染教训**：GitHub Actions 列表页对未登录视图存在分钟级滞后（同一页
   混合新旧渲染），期间我据“完成时长 2m26-2m50”误判多轮绿失败；裁决一律以
   SHA 锁定的 diag.txt / 无扰动完成的 run 为准。
4. **诊断 #17 裁决（3d26979）**：typecheck 干净、lint 0 错误、全量 vitest 216 文件
   2205 通过 + 7 诚实跳过 + 0 失败——含 protocol-api 两个 HTTP 契约测试与
   protocol-web/protocol-ops 全部用例。
5. **根因三（诊断 #18 扩容裁决，db89731→f54316a）**：#17 全绿而 ci 仍红——盲区在
   根门禁不编译 web。诊断扩容镜像 ci 全部 verify 步后定位：web build 的 tsc 报
   dict.ts zh 块缺 map.protocol.ethicsApprovalBody（en 有、ProtocolPanel:168 在用，
   TS2353+TS2345）——根门禁从未见此错。一次性修复脚本挂入 apply 链。
6. **根因四（#20 apply-log 裁决）**：v1 脚本断言 en-minus-zh 恰为单键——抽取器
   视角真实是两键 [ethicsApprovalBody, feedback.intro]，断言 exit 1 而当时 apply
   无日志通道 → #19 apply 哑死（diagnose 08:22:37 落 ddc3f0f，apply 零落且不可见）。
   feedback.intro 真相（#21 dump 铁证）：zh 里它与 feedback.title **两键同行**，
   行首正则抓不到行中第二键；tsc 语义无漂移（f54316a 上 TS2353 仅一条）。
   v2：插入协议键 + dump feedback 行原文 + 仅对 zh-minus-en（真实破坏方向）
   fail-loud，残余抽取器可见漂移仅记录。#21 apply 1b76aca 落地修复，
   raw 直读确认 zh 块 title 之后即 'map.protocol.ethicsApprovalBody': '审批机构'。
7. **根因五（#20 apply-log 同页裁决）**：APPLY_RC=0 且无 SCRIPT FAILED——GitHub
   默认 bash（步骤未显式 shell: bash）**不带 pipefail**，node|tee 掩盖退出码，
   diagnose 的 *_FAILED 标记自始是死代码。全部 tee 步显式 set -o pipefail 后修复。
   这是我自己在进 apply 可观测性时引入的同类错（追 pipefail 的错时犯了 pipefail 的错）。
8. **取证再污染教训**：GitHub MCP list_commits 命中 CDN 缓存（多轮轮询返回过期
   head，误判 #19 无任何提交落地）；PR status 接口返回的 sha 更新鲜——轮询以
   PR status 为准、两源互斥时取更新者。

## 验证状态（诚实）

- 切片 1：全量绿（见上）+ 311f4a7 ci verify succeeded
- 切片 2：诊断 #17/#18 交替定位（#18 揭示 web build 红项）；dict 修复经 #21 apply
  落库（1b76aca，apply-log 铁证 + raw 直读复核）；#21 diagnose 快照 8c137fa。
  **最终合并门 = 本末位提交（surgery 休眠 + 控制面补记）head 上的 ci 全绿，
  此后无任何推送**（bot 推送不触发 ci，不作为门）
- 中途 lint 解析错误（手术脚本语法、band 错位）已修；诊断提交竞态已由
  stash 后重 add 修复（ff1aaad）

## 切片 3（converge/protocol-cli，PR #134）——终端表面

1. **src/cli/protocol.ts + tests/protocol-cli.test.ts**（6c29a24，自包含先行）：
   进程内同引擎（createApp + protocol-ops，非 HTTP 客户端）；show 渲染冻结协议
   真相（范式/planHash 截断/步骤态/QC 汇总/伦理闭锁提示+解锁命令）；record
   --kind 8 类背书，--actor 必填存档，数值测量本地收敛；UsageError→exit 2、
   ProtocolOpError→exit 1 诚实呈现；状态机裁决权全在 domain，CLI 绝不自行推进执行。
   测试：seed 镜像 protocol-api（HTTP 建 run + 直写 store，命令自开 app）、
   依赖序拒绝/使用错误 exit2/QC 失败值保留可见全覆盖
2. **main.ts 接线**（68KB 无法整写，锚点脚本 apply-cli-protocol.mjs → bot 52bb932）：
   在唯一锚 `  if (cmd === 'campaign') {` 前拼接与 experiment 块同构的 17 行路由；
   done 标记幂等（#27/#28 apply-log 铁证 "already routes protocol — nothing to do"）
3. **一致性三件套**（b2d0fcc）：completion FAR_COMMANDS + HELP 两行（2 空格缩进
   满足双向正则）+ cli-maturity 期望数组与 subs 断言同步
4. **根因六（bump-2 diag 423af9d 铁证）**：protocolCommand 的
   `return record(o, runId, kind)` 返回**未 await 的 promise**——record() 内抛的
   UsageError 拒绝绕过 try/catch 直达调用方，"enforces usage (missing --actor…)"
   用例红（217 文件中唯一失败；其余 2208 用例全绿）。修复 fb5dd7a：两个分发点
   加 await（show 同病同修）。**bump-3 终裁（3549990 快照）**：217 文件 216 通过
   1 跳过；2216 用例 2209 通过 7 跳过 0 失败（+1 恰为该用例转绿）；
   typecheck 0 错/lint 0 错 3 既有 cosmetic/tui 49/49/web build ✓/license PASS，
   全快照无任何 _FAILED 标记。protocol.ts（8.4KB）经 base64 contents API 字节
   忠实整写（web 读取器剥 <> 是显示层伪影，非文件实况）
5. **休眠形态根因（runs #22-25 现象）**：`on: workflow_dispatch:` 零 job 的 workflow
   是无效定义——每个携带它建分支/推 heads 的 push 都登记幽灵 Failure run（含
   main 上 #23/#24 两条）。本切片末位改为 workflow_dispatch + 单 no-op job 的合法
   休眠：无 push 触发、手动派发亦零作用，main Actions 历史不再被污染。
   **合并实证**：#134 squash 到 main（4ee0aab）后 surgery 无新 run——对比 #133
   合并时的两条幽灵 Failure，根治生效
6. **侦察/取证教训**：68KB main.ts 直读不可行 → 派生代理字节级锚点侦察（含 agent
   块 4 空格缩进陷阱）后一次命中；子代理若无本地 Read 会自作主张改走网络并可能
   误取旧快照误导裁决（曾误读 main 上切片 2 旧 diag）——委派须显式指定 Read 工具
   与本地路径。#27 diagnose 与 #26 字节同快照（无 diff 不提交）曾致“无提交”误判——
   同内容无 diff 是正常静默，非丢失

## 切片 3 验证状态（诚实）

- bump-2 诊断（423af9d）：唯一失败 protocol-cli usage 用例，根因六定位
- bump-3 诊断（3549990）：全绿（217 文件/2209+7 跳过/0 失败；无任何 _FAILED）
- **合并门兑现**：末位提交 c19ffed head ci #647 8m1s 全绿 + PR sync #648 7m49s 绿，
  此后无推送；PR #134 squash → main 4ee0aab，main ci #649 8m15s 绿

## 切片 4（converge/export-protocol，PR #135）——导出链

1. **Schema**（provenance.ts）：ReproducibilityBundle + protocolEvidence（可选；
   protocolId/executionId 可空/protocolArtifactHash/ledgerArtifactHash 可空/
   recordCount/deviations/qcFailedMeasurements——镜像 experimentEvidence 形态）
2. **铸造**（export.ts）：execute() 读 protocol/protocol_execution；规格与台账
   canonical bytes 入 artifact store（内容寻址）；逐协议 limitations 披露行
   （含偏差/QC 计数，点名协议 id）；applicable() 增 count-based 台账增长重导出
   触发（records 数越过 bundle 记录值即重导——镜像 source-count 规则）
3. **验证**（verify.ts）：第 15 检查 protocol_evidence_resolvable——对象可解析、
   台账归属、records/偏差/QC 计数与 store 一致（漂移→点名重导出）、
   工件哈希核验、**披露 laundering 守卫**（有偏差/QC 失败而无点名披露行=红）；
   缺席=空转通过（旧 bundle 不因新字段回溯变红）
4. **论文**（paper-outline.ts）：protocol_deviations 第 10 类确定性限制（仅台账
   条目计数；计划风险不是协议事实）；PROVENANCE_NOTE 同步披露
5. **打包**（package.ts）：protocol/<prt>.json + protocol/<pex>.ledger.json 入包、
   MANIFEST、RO-Crate；README Limitations 逐字回放自动覆盖协议行；
   字节漂移 fail-closed（报错要求重导出）
6. **落地机制**：全部六处源码编辑经 apply-protocol-export.mjs 锚点脚本
   （insert-only，五文件，每编辑独立 done 标记；apply 一次全中，bot df7f5b7）；
   tests/protocol-export.test.ts 端到端契约（种子图+协议+QC 失败测量+偏差→
   export→protocolEvidence 计数/工件哈希→verify 绿→paper 限制类→package
   文件/MANIFEST/README→台账漂移触发重导出+verify 红→旧 bundle 缺席空转通过）

## 切片 4 迭代史（诚实）

1. **根因七（bump-1 diag f89db40 铁证）**：PlanId 前缀是 pln_ 而非 plan_——夹具
   newId('plan') 在 ProtocolSpec.parse 即抛 ZodError（与切片 2 根因一 tsk/task
   同型：id 前缀凭直觉写而不是查 ids.ts）。修复 a807768：newId('pln')
2. **我的一次提交信息失真（0db9d9d）**：单文件调用只改了触发标记却挂了
   fix(test) 信息——真实修复在下一提交 a807768 并在信息中显式纠正。教训：
   多文件修复一律用 push_files 单提交，不用 create_or_update_file 拆分
3. **根因九（a807768 checks 页注解铁证）**：v1 锚点把 protocolEvidence 声明块
   插在 `const bundleId`（limitations 数组**之后**），使用点在数组内——
   TS2448/TS2454 先使用后声明，ci `Build backend dist` 步 ~40s 真红。
   **连带纠正两处我此前的误判**：①#30/#31 诊断 48s 早崩并非瞬时故障——
   diagnose 的 build 步同因真红，快照步无 if:always() 故无证据落库；
   ②本分支 ci 37-45s 短 run 并非并发取消干扰——就是 build 真红。
   （另：b39bf77 我曾收尾过早——在未验证的树上推了休眠+控制面记录，其 ci
   如预期红；已由后续提交以真实修复与诚实记录取代）
4. **教训（锚点手术的顺序约束）**：insert-only 锚点补丁只验证锚唯一，不验证
   声明-使用相对位置——跨多锚点的补丁必须把声明块锚在**最早使用点之前**
5. **根因十（bump-5 apply-log 铁证）**：修复脚本自身的幂等守卫比较方向写反——
   `i > k`（块偏移在 limitations 之后=坏树）反而命中“已修好”跳过分支，移动
   分支永不可达，树仍坏（日志却报 already sits above）。修复 cd45403：
   守卫反转为 i<k（块已在上才跳过）+ 移动前 k>i 防护 + 落盘前
   block<limitations<bundleId 严格有序与唯一性终局断言。教训：**写“位置比较”
   守卫时先用文件偏移语义自证一遍（above = offset 更小）**
6. **根因十一/十二（bump-7 快照 b02b7fe 裁决）**：BUILD/typecheck/lint 全过
   （根因九/十修复生效）但 vitest 2218 用例 2 败，均测试侧：
   ①根因十一：api.test.ts:1310 钉死 checks=14，verify 新增第 15 检查
   protocol_evidence_resolvable（本切片功能）后计数契约更新——15 为新真值
   （全仓搜索确认仅此一处计数耦合）；15th 检查对无协议夹具空转通过，
   首项/全过断言不受影响 ②根因十二：protocol-export.test.ts:369 断言
   'Human-attested ledger'（大写 H）vs 实现渲染 'human-attested ledger(s)'
   （句中小写）——断言文案凭记忆写未对照实现输出。修复走
   apply-protocol-export-tests.mjs（远端整行替换保字节，全仓唯一锚点
   fail-loud + 幂等；bot e7b91bd，apply-log 9df65d2 逐字证据）。教训：**新检查
   计数是公开契约，全链测试计数断言必须同 PR 同步；断言文案从实现渲染
   输出复制，不凭记忆写**
7. **取证通道教训**：no_cache 也会命中读取服务对 GitHub 页面的缓存渲染
   （同一 request-id）；GitHub Actions 列表页 CDN 滞后依旧；本轮可靠通道=
   API 直读（diag/apply-log blob sha + list_commits/PR status）+ commit checks
   页一次性裁决 + raw.githubusercontent 全文。
ci (pull_request) 于 29e3f56 全绿（verify success 8m13s，零失败注解）——
   与 diagnose 同构的全门禁、独立 runner

## 切片 4 验证状态（诚实）

- bump-1 诊断（f89db40，树=补丁前）：唯一红=夹具 pln 前缀（根因七）
- a807768 checks：根因九定位（TS2448/TS2454 export.ts:860）
- bump-6 diag（4ac79d4/d6e82f0 前身，blob 598f5c7→b02b7fe 前）：build 红铁证
  （同时证明 if:always() 快照修复生效——早崩也有证据落库）
- bump-7 诊断（b02b7fe）：BUILD/typecheck/lint 全绿 + 2218 用例 2209 过 7 跳
  2 败（根因十一/十二，均测试侧）
- **修复树终裁：29e3f56 ci (pull_request) verify success 8m13s 零注解**
  （含 e7b91bd 两处测试同步的全门禁绿）
- **合并已兑现**：PR #135 squash → main c017409（签名）；1f1e516 闭尾 ci verify
  3m18s 全绿 + main 合并后 ci verify 3m5s 全绿（唯一注解为既有 Node 20 弃用警告）

## 切片 5（converge/theory-executor，PR #136）——theory 数值恒等验证腿

1. **域**（src/domain/theory.ts，新）：TheorySpec/TheoryClaim/TheoryVariable 预注册
   ——闭合表达式空间（长度/字符/括号门 + 自由标识符⊆网格变量 + 函数白名单 +
   pi/e 常量与变量名冲突拒绝）、网格点上限 20k（TS+python 双侧）、
   checkTheorySpec fail-closed（绑定审批覆盖门/探索性显式门）、
   theoryIdentityVerdict 机械判决（非有限格点=insufficient_data；
   残差<容差=supports 否则 falsifies）
2. **草案**（spec-from-plan.ts +draftTheorySpecFromPlan）：LLM 仅提议变量范围与
   lhs/rhs 表达式（闭合空间 prompt）；确定性代码拥有容差 1e-6/网格分辨率表
   {1:41,2:23,3:13,4:9}/claim id/primary/thresholdProvenance='model-stipulated'
3. **执行**（src/experiment/executor-theory.ts，新）：镜像 executor-meta/
   executor-simulation 权威结构——specHash 绑定、真实 sidecar identity_check
   逐 claim 求值、点数一致性断言、退化区间 StatReport（identity_max_abs_residual/
   identity_grid/level=1）、内容寻址残差数组、hash 域序贯守卫、
   逐字披露 "NUMERICAL SPOT-CHECK on the preregistered grid, not a symbolic proof"
4. **sidecar**（ops.py +op_identity_check）：stdlib ast 白名单解析（数值常量/算术/
   白名单 numpy 函数/网格变量；attribute 访问拒绝=exploration.py P0 教训镜像；
   绝不 eval）、linspace 笛卡尔网格、非有限点计数与 worst-point 定位
5. **接线**（execute.ts 第 2.5 层）：tabular → literature-pool → theory identity →
   protocol fallback；refuseTemplateMode 镜像协议路径；skip 理由串含 theory 段；
   offline 路由显式拒绝（不伪造 theory 实验）
6. **契约扩展**：MetricKey + identity_max_abs_residual；StatReport.test.kind +
   identity_grid（镜像 meta_iv_* 先例）；store KIND_SCHEMAS + theory_spec
7. **测试**（tests/executor-theory.test.ts，新）：确定性双（bound 判决三态/
   无审批 fail-closed/词法门）+ 真实 sidecar（真恒等式 machine-epsilon 残差、
   attribute/不可解析/未知变量三重拒绝）+ execute 三层路由端到端（真实 sidecar）
8. **落地机制**：新文件整推（a8b59e0）+ apply-theory-executor.mjs 七文件锚点
   集成（bot dcc16a8）+ apply-theory-store.mjs（bot 3e98c46，bump-3）

## 切片 5 迭代史（诚实）

1. **根因十三（bump-1 产物回读定位）**：apply 脚本 DRAFT_BLOCK 生成的
   THEORY_SYSTEM_PROMPT 是多行数组字面量但元素行缺尾逗号，且函数清单行未
   引用——spec-from-plan.ts 落地即语法错误（node 执行 apply 成功 ≠ 产物 TS 合法）。
   修复 5e03440：拼接语句镜像 SYSTEM_PROMPT/META_SYSTEM_PROMPT 既有形态。
   教训：**生成代码块中的多行数组字面量必须逐元素尾逗号，或改用拼接语句**
2. **预检修复（免烧整轮 CI）**：路由夹具 hypothesisIds: [] 违反
   ResearchPlan z.array(HypothesisId).min(1)（与根因一/根因七同型：schema 约束
   不查证就写夹具）——c06a934 接真实 hypothesis；0538641 顺带合并 theory.ts
   重复 import（import/no-duplicates 预防）
3. **根因十四（bump-2 apply-log + 事后取证）**：编辑七假设 KIND_SCHEMAS 的
   protocol_execution 是末位条目（断言下行 };）——实际其后还有 feedback 等
   条目，两次 bump 均在断言失败，store 注册从未落地；if:always() 把部分成果
   照常提交，dcc16a8“七文件”实为六文件，掩盖失败。修复 apply-theory-store.mjs
   （唯一锚插入不做末位断言；bot 3e98c46）。教训：**对未见结构断言“末位”前必须
   取证；workflow if:always() 会把部分成功伪装成整体成功——APPLY_RC 才是真相**
4. **bump-2 “重复编辑”假象取证**：apply-log 显示 EDITED execute/offline 但现树
   无重复损伤——实为 apply 在无编辑基树上全新单次应用，同内容补丁 rebase 自动
   合流。教训：**apply-log 的 EDITED/SKIP 只对它当时检出的树负责，与分支 head
   的关系要靠 bot 提交 diff 取证，不能从日志字面推断**
5. **根因十五/十六（bump-4 diag a8a1bef 裁决，树=1d9d7bc）**：
   ①executor-theory.ts:183 TS1361——FeedbackSignal 被 import type 导入却作值用
   （.parse）——修复 fd4487e 值导入（zod schema 既类型又值：凡 .parse 必值导入）
   ②apply-theory-executor.mjs:404 no-unused-vars 死变量 OLD_KIND——同提交清除
   并重构 DRAFT_BLOCK 生成链（.map/idxFix 补丁→直接 concat 终形态）、编辑七
   显式委托 apply-theory-store.mjs；同快照 theory_spec TS2345 在注册树已消
6. **脚本终局不变量误报（bump-4 apply-log）**：countOf('identity_check')===2
   忽略 op 内错误消息字符串（实际 3 处）→ 健康树假红（树无损，仅手术 job 显红）。
   已登记未修（脚本已休眠不再执行；修复配方：改为 def 行+注册行两条精确断言）
7. **取证通道更新**：checks 页懒加载态在运行中无法裁决且重复 URL 命中读取
   缓存（同 request-id）；新鲜缓存键（短 sha/新 sha URL）或 sha 锁定 raw 直读
   才可靠；大文件 diag.txt（54KB）超出读取服务内联阈值被存盘不可读——vitest
   段裁决须靠 ci 检查页完成后渲染或后续 bump 的分段落库

## 切片 5 验证状态（诚实）

- bump-4 diag（d3f85da，树=b6631a8=fd4487e 源）：BUILD ✓ / typecheck ✓ /
  lint 0 错误（仅 main 既有 3 警告）/ vitest 段未及读取（54KB 落盘限制）
- **最终合并门 = 本末位提交（surgery 休眠 + 控制面切片 5 记录）head 上的
  ci 单次全绿，此后无任何推送**（bot 推送不触发 ci，不作为门）

## 登记未做（后续切片，非本 PR 声称范围）

- 范式覆盖深化：archive（登记库检索腿，切片 6——侦察完成：SourceFamily 枚举
  [openalex/arxiv/crossref/europepmc/user_provided] + sources/index.ts FACTORIES/
  SOURCE_FAMILIES/sourceAdapterFor + verification.method 枚举 + PublicationType
  映射 + retrieve.ts 家族规划 + 新适配器如 ClinicalTrials.gov/OSF）
- 手术面改进：apply no-op 时提交信息应区分（c937031/adc3fa8 均为误导性
  no-op 日志提交）；apply-theory-executor.mjs 终局不变量 countOf 误报修复
  （见切片 5 迭代史 #6）；apply-log/diag 保留策略；diag.txt 分段落库
  （54KB 超读取服务内联阈值，全量单文件不可读）
- 手术 workflow 在 main 保持休眠（workflow_dispatch + 单 no-op job 合法形态）；
  apply-log.txt / diag.txt 留树内作为切片取证记录（path-hygiene 允许）
- 既有 cosmetic：tests/memory-live-check.test.ts 三条 unused eslint-disable 警告
  （main 上既有，非本切片引入）；secret-scan 对 tests/thinking-display.test.ts
  测试假凭据的 MEDIUM 发现与 path-hygiene WARN 亦为 main 既有状态
- 子代理配额限流（2026-08-29 触发，8-31 21:01 重置）：大文件侦察/裁决解析回退
  主线程直读

## 用户侧不变

- B-QWEN-LIVE-ROUTE：DASHSCOPE_API_KEY（比赛路线 live receipt）仍 OPEN
- B-S1-TECHNICAL-PDF：待用户审阅

---

# AOSSA 收敛重构会话（2026-08-30 凌晨，goal 接管）

接管指令：收敛为 AOSSA 科研操作环境（Scientific Second Brain + Research
Execution + Auditable Research Record）。本窗口落地：

## 已完成（6c769ae，main ff-merge 经 aossa/problem-model 分支）

- **系统盘点落 canonical**：`project-spec/AOSSA-CONVERGENCE-PLAN.md` —— 七层
  KEEP/REDESIGN/DELETE 处置 + 两个结构缺口定性（LLM-first 无问题模型/方法选择；
  执行面仅表格 ML 无数值腿）+ 五项 CPS + 场景 A/B/C 映射。
- **CPS-AOSSA-1 第一切片落地**：`src/domain/problem-model.ts`（Scientific
  ProblemModel + MethodSelection + Draft 闭空间；12 方法族闭枚举对齐真实可路由
  面；selected 强制 validationPlan；确定性 id/交叉引用/超Refine 校验）+
  scope 阶段第二次结构化调用铸成（putObjectEvented + note 审计）+ product run
  上 test 模式拒绝（真实内容纪律延续）+ test-double purpose handler +
  测试（域 14 + scope 集成 + 双调用契约适配）。
- 门禁：root tsc 0 / eslint 0 err / vitest 2238+4skip（agent-mcp 超时一次为
  全量负载 flake，隔离 7/7 绿；executor-theory 同型前例）/ build 绿 /
  web tsc+build 绿 / cli-spawn 12/12。D-031 守卫路径被真实演练（src 晚于
  dist 的 lint 修复触发拦截，重建后绿）。

## 车道协调（本窗口实录）

- 并发会话同树活跃：test-double 隔离（879cea1）→ protocol 子系统（staged 落
  b300775/1d2ea53/63f26d1）→ 中途把 HEAD 从 min 切到 main（我的提交按
  branch→ff-merge 惯例落 main）。protocol/theory/execute/export/StudyMap/
  dict/api/store 为其车道，本窗口未触碰（problem-model 注册涉及的
  ids/index/store 三处为加法式注册，无语义冲突）。
- 3 个 Explore 测绘 agent（backend/runtime/web）派发后超 1h 未回；已 SendMessage
  催收 backend 报告。盘点文档的 runtime/eval/web 节基于主线程直读证据
  （experiment-runtime venv、eval/、scripts/、src 逐文件），报告送达后再补强。

## 下一步（按杠杆排序）

1. CPS-AOSSA-1 第二切片：下游披露——plan/hypotheses 载荷携带已选方法族与
   目标引用（disclosure first，再收紧为引用完整性）；StudyMap 增问题模型带。
2. CPS-AOSSA-2：数值执行腿——sidecar 增 FEM/ODE op（收敛阶验证为 validator），
   场景 A（2D Poisson 混合边界）贯通。
3. CPS-AOSSA-3：NetCDF/xarray 数据族 + QC + 派生版本 lineage，场景 B 前置。

## 切片 2 已落地（90f8c11，main ff）

问题模型下游披露：hypotheses 三策略载荷+系统提示携带 problemModel
（objectives/variables/selectedMethods）+ 纪律句；缓存族键 rc3；plan 载荷
+ 对齐纪律句；捕获式测试锁定（36/36 + 新 disclosure 套件 2 例）。全量门禁
220 文件 2242 passed 0 failed。依赖恢复事件：本机 root+web node_modules 被
外部清空且无安装进程——npm ci 自恢复（root 4s / web 19s，均锁文件确定性），
僵尸 e2e 包装进程核验（0 CPU/0 WS）后未动。

## 交接（下一窗口从这里继续）

1. 切片 3 = CPS-AOSSA-2 数值腿：sidecar 新 op（FEM 2D Poisson 混合边界 +
   自适应加密 + L2/H1 误差 + 收敛阶 vs 解析解），executor 仿 theory/simulation
   模式（预注册 spec + 机械裁决），场景 A 全链。参考：SimulationSpec CRN 执行器
   已存在（executor-simulation.ts）；theory.ts 的预注册纪律可直接移植。
2. explore-runtime / explore-web 两测绘 agent 受配额限流未回（8-31 21:01 重置）；
   explore-backend 已交付并折入盘点文档。
3. StudyMap 问题模型带（UI）未做——数值腿落地后一并（那时有真实内容可显示）。

## 切片 3a 已落地（4ee30c4，main ff）：数值执行腿 FEM

场景 A 执行平面贯通：fem_poisson_2d sidecar op（sympy 精确源项 + P1 混合
边界装配 + 均匀阶梯 + L2/H1 阶）+ FemSpec 预注册域 + 机械裁决执行器 +
execute 级联插入（theory 后 protocol 前）+ 9 项测试含真实 sidecar 阶实测
（混合边界 L2→1.99 / H1→0.99，verdict=supports）。真 bug 一枚被数值验证
抓住并修复（Neumann 边积分 Gauss 权重复 0.5 → 阶归零）。全量 2251 绿。
新依赖：experiment-runtime sympy>=1.14（BSD）。

过程教训（登记）：PowerShell 行数组插入/替换在模板字符串（${}）与反引号
上翻了两次车——FEM 块一度被插进模块文档注释内部且 tsc 照样绿（注释内
死文本）；靠目检+锚点复查发现并完整修复。教训：涉及模板字符串的代码块
插入必须走临时文件+单引号 here-string，插入后必须目检锚点上下文。

## 剩余（按杠杆）

1. 切片 3b：自适应网格（Dörfler 标记 + 恢复均衡或保守闭包），场景 A 完整
   闭环（形式化→弱式→实现→实验→误差/阶→图→解释→复现）的端到端 live run。
2. CPS-AOSSA-3：NetCDF/xarray 数据族 + QC + DatasetVersion（场景 B 前置）。
3. StudyMap 问题模型带 + FEM 实验呈现（数值腿有真实内容可显示后）。

## 切片 3b 已落地（40d3db6，main ff）：自适应 AFEM 全链

CPS-AOSSA-2 完成。均匀+自适应双模式齐备，角奇异 r^0.7 对照证据：
uniform H1 h-阶退化 0.68 vs adaptive ndof-率 -0.681（最优 -0.5 基准），
效应指数稳定 ~4.2。调试抓到三个真数学 bug（NVB 子代最新顶点错标 /
边跳跃估计子缺 h_e 因子 / 误用 ∇φ₀ 代 ∇u_h），全部数值取证后修复。
全量 2254 passed 0 failed。

# AOSSA 会话累计（2026-08-30 凌晨，6 个 main 提交）

6c769ae 问题模型+方法选择 / 90f8c11 下游披露 / 4ee30c4 FEM 均匀腿 /
f3678e1+123325c 控制面 / 40d3db6 AFEM 自适应腿。

## 剩余（按杠杆，下一窗口起点）

1. 场景 A 端到端 live run（12 阶段管线跑真实 FEM 问题：形式化→弱式→
   plan→execute(adaptive)→报告→复现 bundle）——实现已备，需要 live 路由。
2. CPS-AOSSA-3：NetCDF/xarray 数据族 + QC + DatasetVersion（场景 B 前置）。
3. StudyMap 问题模型带 + FEM 实验呈现（数值腿有真实内容可显示）。
4. completion-gate + 独立四维审计（终局）。

## 场景 A live run #1 发现（2026-08-30 02:0x，run_fq3rdff1，zai glm-4.6）

管线诚实工作但暴露 run 级 LLM-first 残留：问题模型 formed（5 目标/
well_posed_computational/7 变量含单位/2 未知项）、方法选择选中
numerical_simulation（obj1/3/4）✓、12 源 10 切题主张（P1 O(h)、角奇异
O(h^{1+π/ω})、NVB H1 稳定、自适应率）✓——但 hypotheses 阶段被主题覆盖
门禁诚实拒绝（主张不「测量实现是否达到阶」）→ 后续全跳。

**登记新缺口（下一语义切片）**：方法选择选中纯数值/理论族时，假设生成应
允许从问题模型的形式期望派生（收敛阶期望=可证伪假设，判别器=执行），
而非强制文献主张条件化。门禁本身无错——错在管线把文献假设当作唯一
假设来源。第二问（理论化问法）用于今晚贯通场景 A。

## 场景 A 端到端 LIVE 闭环达成（2026-08-30 02:1x，run_5mw5q5e9，work/scenario-a）

第二问（理论化问法）12 阶段全 done：问题模型（5 目标 well_posed_computational
/6 变量）→ 方法选择 5/5 目标选中 numerical_simulation → 12 源/12 切题主张 →
11 假设（无模板内容）→ 证伪/排序 → 计划 → **FEM 自适应腿真实执行**
（draft 模型自选 adaptive + 奇性制造解 sin(2πx)cos(2πy)+x^0.7·sin、混合边界；
真实 sidecar Python 3.14.1 lockfile 钉扎；10 轮 AFEM；H1~ndof slope -0.484
（最优 -0.5 带内）；StatReport fem_h1_error_final_round verdict=supports
机械裁决，exploratory 未绑定诚实标注）→ 导出 IMRaD+2图6表+replay bundle
（bnd_khmwksfh…）→ **far verify 15/15 PASS**（120 live 回执 zai|glm-4.6、
哈希/锁文件/taint 全一致）。

第一问 run_fq3rdff1 保留为诚实拒绝证据（主题覆盖门禁对实现验证类问题的
合理拒绝 + run 级路由缺口登记）。

## 会话终态剩余（诚实）

- 场景 B（NetCDF）、场景 C 端到端、baseline benchmark、completion-gate、
  独立四维审计：均未做。goal 完成判据未满足。
- 登记的下一杠杆：hypotheses 按方法选择路由（数值/理论族→问题模型派生
  假设）；NetCDF 数据族；StudyMap 问题模型带。

## NetCDF 数据平面落地（68726e4，main ff，2026-08-30 02:4x）

CPS-AOSSA-3 核心切片：sidecar netcdf.py（xarray+netcdf4，剖析/QC/闭枚举
特征提取）+ domain local_netcdf resolver/format + dataset-netcdf.ts
（不可变 raw 采集 + 派生 CSV lineage 链）。3 项测试跑在真实 NCEP 气温
文件（work/scenario-b/air_temperature.nc，7.75MB）+ 真实 sidecar 上，
缺文件 skipIf 诚实跳过。全量 2257 passed 0 failed。

# 会话终局（本 turn 9 个 main 提交）

6c769ae 问题模型 → 90f8c11 披露 → 4ee30c4 FEM 均匀 → 40d3db6 AFEM →
68726e4 NetCDF 数据面（+3 控制面记录提交）。场景 A live 闭环
（run_5mw5q5e9，bundle 15/15 verified）。

## 剩余（按杠杆，下一会话起点）

1. 场景 B 端到端：~10 篇文献 + NetCDF → baseline→split→train→有界调参→
   untouched test→UQ→报告→复现（数据平面已备；需要 run 级串联：
   netcdf 采集/提取进 execute 级联的 data_analysis 路径）。
2. 假设按方法选择路由（数值族→问题模型派生假设——run_fq3rdff1 证据）。
3. StudyMap 问题模型带 + FEM/数据集呈现。
4. 场景 C 端到端（机制全备；真实人类执行 BLOCKED-user）。
5. baseline benchmark + completion-gate + 独立四维审计（终局）。

## 场景 B 数据→ML 链贯通（980ee58 + 29721a8，2026-08-30 03:1x）

- extractNetcdfFeatures 增 materializeDir（派生 CSV 真实落盘，EEL 本地
  数据集腿可消费；安全闸门不变——操作者背书路径，LLM 不提名路径）。
- scripts/scenario-b-driver.mjs：可复现运营侧链。两次运行同一
  StatReport（paired MSE 差 -248.938 K²，95% CI [-258.8, -239.1]，
  RF 显著优于均值基线；verdict 空=诚实 exploratory，D-085 确认性需
  批准）。run_z90qsyws 与 run_3vevczdd 两轮证据在 work/scenario-b。
- 场景 B 剩余：文献腿（~10 papers）与 run 级串联（execute 级联引用
  注册数据集的 draft payload 扩展）。

# 本 turn 终局（12 个 main 提交）

问题模型→披露→FEM 均匀→AFEM→NetCDF 数据面→场景 A live 闭环
（bundle 15/15）→场景 B 数据链（可复现）。goal 完成判据仍未满足：
场景 B 文献+run 级整合、场景 C、benchmark、completion-gate、四维审计。

## 场景 B 端到端贯通（422f05e，2026-08-30 03:5x）

文献腿（run_b07h78df，zai，9 阶段 done，12 源/33 主张/9 假设，问题模型
6 目标，方法选择混合）+ 数据腿桥接同一 run（3 dataset_records +
StatReport）→ bundle bnd_7evnh6rr 15/15 verified（111 live 回执）。
completion-gate.mjs 已运行：NOT_READY，唯一缺口 ACC-02（B-QWEN
dashscope key，BLOCKED-user 09-05 裁定），其余 25 live + 16 tested。

## 终局状态（goal 判据对照，诚实）

- 场景 A：✅ live 端到端（bundle 15/15）。场景 B：✅ 两腿桥接端到端
  （bundle 15/15；run 级自动串联仍为登记缺口）。场景 C：机制全备，
  真实人类执行 BLOCKED-user。
- benchmark 对照、独立四维审计：未做（下一会话杠杆）。
- completion-gate：NOT_READY（唯一项=用户侧凭据）。
