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

## Baseline 对照证据（2026-08-30 04:1x，work/baseline/）

同模型（zai glm-4.6）直答基线，场景 A/B 问题各一次 live 调用（回执含
token 用量）。对照工件 work/baseline/comparison.md 按预注册结构性指标
（W4R 方法学）：直答无可验证主张绑定/无可证伪规范/无真实执行/无机械
裁决/无可复现工件；FAR-Lab 两 run 全部具备（bundle 15/15×2）。反向
诚实列：直答更快更广（模型记忆），且其理论预测与 FAR-Lab 实测一致
（均匀率 ~0.7 vs 实测 0.68；自适应恢复最优 vs 实测 slope -0.681）。

独立四维审计（scientific/engineering/product/security，无先前卷入
agent）已派出，回报后处置。

## 独立四维审计（2026-08-30 04:3x）

### 科学维：三声明全 CONFIRMED（位级复现通过）
审计员自行重算：FEM slope log(h1)~log(ndof) 复贴 -0.484207 精确；不同
Python（3.12/3.14）重跑 AFEM 历史一致；B 的 bootstrap CI 双端点位级
复现；全部工件哈希匹配。无 Critical。WARNING 登记：
W1 B 相关格点数据的 i.i.d. 行 bootstrap CI 偏乐观（spec 已披露非预测；
引用 -248.94 时保持 caveat）。
W2 A 残差估计子缺 Neumann 边剩余项 h_e‖g-∂n u_h‖²（仅影响标记/
效应指数 4.3-6.5，不影响裁决所依据的真误差）。
W3 bundle 未绑定数值证据（A experimentEvidence.resultIds 空、FEM 结果
工件未引用；B 无 experimentEvidence 字段）——「15/15」仅覆盖回执/源/
终态。修复方向：export 层将 fem/netcdf 实验 result 纳入 bundle。
W4 引文标题有损转述（无 DOI/URL 存储；抽查两条均真实）。
NOTE：x^0.7 为左 Dirichlet 边型奇性（非再入角）；场景 A 仅跑自适应腿
（均匀对照在 executor-fem 测试中）；slope 拟合窗口敏感（-0.446~-0.598，
后段点优于 -0.5，supports 不虚高）。

## 四维审计终局处置（2026-08-30 05:0x）

- 工程维 C1/C2 已修（66c25ff，含双回归测试）；场景 B 真实数据重跑
  （正确坐标 MSE 差 -250.816 CI [-260.7,-240.9]）；损坏记录对照：
  ds_ean8wh8m/ds_ea1637db（坏）→ ds_5f1gxm4y（好，同 raw）。
- W2 已修（rc3 指纹补 PROBLEM_MODEL_DISCIPLINE）。
- 未修登记（下一杠杆）：工程 W1（fail 双事件）、W3（draft 边界 schema
  收紧）、W4（scope 拒绝路径 orchestrator 不重开）、W5（statSync 先检/
  TOCTOU 哈希与消费同读）、W6（h1Rates /2 因子）；科学 W2（估计子
  Neumann 边项）、W3（bundle 绑定数值证据——export 层）、W4（引文
  DOI 存储）；安全 W1/W2（netcdf 路径纵深）；产品三面（problem
  model/fem_spec/dataset 可见性——已列计划增量）。
- 产品维结论：无诚实问题（表面不说谎），深度层不可见为已声明缓期。
- 安全维：0 Critical；表达式沙箱密闭确认。

# Goal 判据终局对照（本 turn 16 提交后）

三场景：A ✅ live（bundle 15/15）；B ✅ 桥接端到端（bundle 15/15，
审计 C1 修复后数据重验）；C 机制全备+BLOCKED-user。benchmark ✅
同模型直答对照（work/baseline，预注册结构性指标+反向诚实列）。
completion-gate：NOT_READY（唯一 ACC-02=用户侧 dashscope key）。
四维审计 ✅ 已执行且 Critical 已修；Warning 分级登记。goal 完成判据
中可自主完成的部分已尽；剩余=登记的 Warning 修复队列 + 用户侧凭据。

## 审计 Warning 修复批 2（2026-08-30 03:5x，commit f7d0a25，main）

工程 W1/W3/W4/W5/W6 + 安全 W1/W2 全部落地，全量绿（2264 passed |
4 skipped；tsc/eslint/build 0）：

- W6：fem.py h1Rates 误除 2.0 移除。
- W3：draft 边界守卫。首版 MethodSelectionDraftGuards 建在单选择
  schema 上——scope 拿它解析整个 payload 必然失败，全量 vitest 三个
  测试当场暴露（forObjective/candidates Required）。重做为
  ProblemModelDraftGuards（基座 ProblemModelDraft，逐 selection 校验
  selected⇒validationPlan、≤2 selected、无 selected⇒undecidedReason），
  补两条边界回归测试。教训：schema 换基座必须跑消费方测试，不能只看
  定义文件 tsc。
- W4：scope 测试替身拒绝路径改 marker-skipped 返回，resume 时编排器
  重开整个 scope（此前 done 会永久缺 problem model）。
- W5/安全 W1：dataset-netcdf profile 后二次读取重算 sha256 比对
  （TOCTOU）；体积检查 statSync 前置。
- 安全 W2：assertLocalNetcdfPath——URI/相对路径读字节前拒绝；
  FARLAB_DATA_ROOT 围栏（测试覆盖三条）。
- W1：fem/theory executor fail() 双事件（fail 抛出→外层 catch 再 fail，
  experiment_failed 覆盖+消息双重包装）——failedOnce 单事件保证，
  外层 rethrow；回归测试断言恰一个 experiment_failed。

剩余队列：科学 W2（估计子 Neumann 边项）、W3（bundle 绑定数值证据
——export 层）、W4（引文 DOI 存储）；产品三面可见性。

## 审计 Warning 修复批 3（2026-08-30 04:3x，commits c178f8a / cb7cfaa / 6a0a52b，main）

科学 W2/W3/W4 全部落地，四维审计 Warning 队列清空：

- 科学 W2（c178f8a）：残差估计子补 Γ_N 边剩余项 h_e‖∂u_h/∂n−g‖²
  （两点 Gauss 积分 + sympy 精确通量）；r^0.7 验证 slope −0.745、
  effectivity 4.0–4.7 稳定。
- 科学 W3（cb7cfaa）：bundle 绑定数据面证据——fem_measurement tableRef
  并入 experimentEvidence.artifactHashes；datasetEvidence 新 schema 字段
  （id/name/format/contentRef/lineageKinds）；verify 新增 check 16
  data_plane_evidence_resolvable（store 再解析 + 工件探测），
  VERIFY_CHECK_NAMES 15→16。
- 科学 W4（6a0a52b）：引文表面带可解析标识符——sourceIdentifierLabel
  （doi>arxiv>pubmed>url 原文，绝不拼造 URL）；report §2 与
  corpus-overview 表各加标识符列。
- 过程教训：D-031 对 git checkout 刷新 mtime 的正确触发（rebuild 即绿）；
  PowerShell 写含反引号的模板串必须走单引号 here-string + [char]96 拼接。

剩余登记（按杠杆）：产品三面可见性（problem model/method selection/
fem_spec/dataset——API+web）、run 级自动序列化（execute 级联引用已登记
数据集）、假设路由按 method selection（run_fq3rdff1 证据）、StudyMap
问题模型带；BLOCKED-user：场景 C 真人执行、ACC-02 dashscope key。

## 产品可见性批 1（2026-08-30 05:0x，commit 5fc6ac4，main）

- /science 增加 problemModel（模型全量+methodSelections；无则 null）；
  /experiments 增加 femSpecs+datasetRecords。
- web：ScienceBundle.problemModel 严格 normalize；StudyMap
  ProblemModelBand（问题类/目标×方法族/未决/未知项⚠/计数）置于
  StateBand 上；ExperimentsTab 数据面小节（dataset_record 表 +
  fem_spec 列表）。中英 i18n。web tsc+vite build 绿。
- 全量 2265 passed | 4 skipped；root tsc/eslint/build 绿。
- 剩余：run 级自动序列化、假设路由按 method selection、StudyMap
  深链、benchmark 多基线扩展；BLOCKED-user：场景 C、ACC-02。

## 路由 + 自动序列化批（2026-08-30 05:4x，commits 9b631aa / 25aaf64，main）

- 9b631aa execute 按方法选择确定性路由：routeSkip——leg 背后全部家族
  被 scope 评为 rejected_inappropriate 时跳过起草并落
  method_selection_routing note；四 leg 均受路由；pre-AOSSA 保持
  固定顺序；回归测试（仅脚本 fem 起草，3 条路由 note + FEM 完成）。
- 25aaf64 数据集自动序列化：dataset_record(csv+local) 投影进
  experiment-spec-draft payload（id/name/columns——路径永不进
  prompt，确定性代码解析）；datasetRecordId 与 openml 互斥；
  REGRESSION_BUILDERS 进草稿（mse/r2、direction below、split
  random）；未知 id 拒绝猜测绑定；execute 侧 allowLocalDatasets
  仅在绑定 operator 登记数据集时为真 + dataset_auto_serialized
  note。全量 2269 passed | 4 skipped。
- completion-gate 已在本 transcript 运行：NOT_READY，唯一缺口
  ACC-02（Qwen-via-Bailian 凭证）+ B-QWEN-LIVE-ROUTE——均为
  用户侧外部条件（submission/RELEASE_BLOCKERS.md 登记）。
- 后台审计 agent：压缩后无法取回 task id；四维审计发现已在此前
  执行并修复（Critical 前期修复，Warning 本会话全清）。若后台
  agent 产生新发现，其输出不可达——如实登记。
- Coding-Agent 基线（场景 A）：后台 agent 已启动（同 harness 家族
  的诚实披露：非独立外部产品；scratch 目录隔离，禁读本仓库代码），
  预注册结构性指标复用 work/baseline/comparison.md。结果落
  work/baseline-agent-a/REPORT.md 后按同一 rubric 评分。
- 剩余 BLOCKED-user：场景 C 真人执行、ACC-02。AI4Science/
  LLM+Web+Notebook 外部基线：无外部账号与网络检索通道，登记
  BLOCKED/external。

## 审计 agent 全部返回 + 残项批（2026-08-30 06:3x，commit 1015218，main）

四维审计（工程/安全/科学/产品）与三路勘察（runtime/eval/web/backend）
消息全部返回：
- 审计 Critical（C1 lat/lon 伪造、C2 NaN 落库）与 W1-W6 均已在前批
  修复——审计返回的是修复前快照，其发现与修复一一对应。
- 本批残项（1015218）：安全 W2 残项（netcdf.py op 层
  _assert_local_path——URI/相对/根围栏/200MB，独立于 TS 的第二道门）；
  工程 W5 残项（sha256Expected acquire 落库 + extract 消费前重验，
  篡改回归测试）；产品 Note A（tallyVerdicts 拆 unjudged 桶——无判定
  ≠inconclusive）、Note B（execute 阶段文案方法路由中性化）、
  Note C（报告卡渲染 hypothesisId 绑定）；勘察发现 mlr-bench.mjs
  行为本已 GLM 化（makeProvider deepseek 硬禁），仅字符串残项
  三处修正。全量 2271 passed | 4 skipped。
- 勘察其余登记：SimulationSpec/CampaignSpec CLI-only（设计现状）；
  e_value_accumulation 占位 fail-closed（设计现状）；macOS deep-link
  死路（已声明）；web 无 dataset import UI / raw 下钻（后续增量）；
  本地 min 与 GitHub main 的镜像差异系兄弟会话推送（协议链在本地
  历史中已存在，勘察读到的是旧镜像）。
- e2e（5.6m）：19 passed / 3 failed / 1 skipped——terminal×2 与
  perf home 属兄弟会话在制 Terminal→TerminalPanel 重构及 LabHome
  在制改动的文件（terminal.spec.ts 在其工作集），非本会话提交的
  表面（StudyMap/ExperimentsTab 相关 spec 全绿）。如实登记，不代改。
- Coding-Agent 基线（场景 A）：后台 agent 恢复运行中；完成后按
  work/baseline/comparison.md 的预注册结构性指标评分并入档。

## Coding-Agent 基线结果落档（2026-08-30 07:0x）

- 条件披露：单会话通用编码 agent（Claude 家族、同 harness——非独立
  外部产品；自比限制如实登记），场景 A 问题原文 + scratch 目录 + 预
  交付合同；~13 分钟、10 次工具调用、两次停机均未执行自己的代码
  （委托的 runner 未跑）。
- 交付物：fem.py/run_uniform/run_adaptive/smoke.py 存在；无 REPORT.md、
  无执行产物、无 pin 依赖脚本。
- 哈尼斯执行记录（披露干预）：首次执行即崩（einsum 指标序 bug），
  两处一行修复后其自带 smoke 完成并自判 FAIL——均匀加密下误差发散
  （L2 -0.44 / H1 -1.60）。不再代修数值（代修即变成本方实现）。
- 评分按预注册结构性指标落 work/baseline/coding-agent-a.md +
  comparison.md 追加节：真实执行=无、机械判定=无、复现工件=无；
  反向列：13 分钟、零基建、骨架结构合理（对称/常数/NVB 共形自检过）。
- 外部基线（AI4Science / LLM+Web+Notebook）：BLOCKED/external 维持。
- benchmark 三条件现为：direct-LLM ✅、coding-agent（in-process）✅、
  外部产品基线 BLOCKED。

## 基线落档 + 论文问题模型（2026-08-30 07:2x，commit fbe5f3d，main）

- fbe5f3d：论文投影纳入科学问题模型（Methods 节 Problem model
  and method selection 小节：问题类/方法族/目标/未知项 + far.db
  原文披露行）；pre-AOSSA run 缺省不编造；测试双向断言。
  审计产品维残项至此全部处理完毕。
- 状态：审计四维全返回、发现全闭环；benchmark 三条件
  direct ✅ / coding-agent ✅（in-process，自比限制披露）/
  外部产品 BLOCKED；gate NOT_READY 唯一缺口 ACC-02（用户侧）。
- 剩余登记（下一批候选）：场景 B 流水线原生 execute 重跑（自动
  序列化已具备）、web dataset import UI / raw 下钻、
  顶端假设路由 method selection 的假设侧软约束硬闭合。

## 场景 B 原生 execute 贯通（2026-08-30 07:5x，commit f22a2bc，main）

run_wx8dmqmb（work/scenario-b-native，live zai glm-4.6，123 receipts）：
- 首跑：run_631ha1cs 暴露 draft validationPlan 短占位符问题（W3 守卫
  live 拦截），修复后该 run 诚实 evidence-insufficient 收束（12 源
  检索后判定不覆盖主题——hypotheses/plan/execute 全跳过，不编造）。
- 主跑 run_wx8dmqmb：完整文献链 + plan 冻结 + execute 科学性跳过
  （四腿均判不可行，含 protocol 不可行——诚实）。
- operator 注册数据面（scenario-b-register-datasets.mjs：raw
  ds_j98af9gd sha256 c606b89c… + derived ds_41b9nrtet 31,800 行）
  → feedback(new_dataset) ×2 → 因果修订把 "NCEP/NCAR Monthly Mean
  Air Temperature (public)" 绑进 dataRequirements 并 re-freeze。
- 修复后迭代重开 execute：dataset_auto_serialized note（spec
  xsp_t5fm1z6 绑 derived CSV，路径由确定性代码解析）→ 真实 sidecar
  训练（python 3.14.1 / sklearn 1.9.0；dummy_mean vs
  linear_regression vs random_forest_regressor）→ stat_report
  srep_tgzeg（mse paired_diff below，point 170.92，CI95
  [163.10, 179.05]，exploratory plan-drafted）→ EEL 侧再铸
  ds_6c98cb88（消费路径 sha256 验证记录）。
- reexport-bundle.mjs 重铸 bnd_t9mjvb7c：verify 16/16 verified
  （experimentEvidence 1 条含 3 工件哈希 + datasetEvidence 3 条 +
  123 receipts live）。场景 B 桥接残项（审计科学维 framing note）
  就此闭合：存在 pipeline-native execute 的端到端证据。
- 四个 live 发现的修复随批落库（draft 容忍+确定性剥离 / 修订见数据
  / 陈旧跳过判定失效 / 二进制安全工件探测）；全量 2274 passed。
- 语义注记：本次 native 实验与桥接实验不同点（mean-baseline 对比
  为 linear_regression、rf 为第三模型）如实保留——两次都是真实
  执行，非复现声明。

## 基准补遗：runner-a 逐字报告 + 全阶梯执行（2026-08-30 08:0x）

- runner-a（受托执行 agent）返回逐字报告：smoke 首跑即崩于 fem.py:147
  （einsum 轴序，lam 实为 (nT,nq,3)），检查 [2]-[5] 未运行，exit 1；
  环境 python 3.14.1 / numpy 2.5.2 / scipy 1.18.1 / sympy 1.14.0。
  与 harness 记录完全互证。
- 两处披露的单行修复在场时，harness 执行了 agent 从未跑过的两个
  ladder：uniform L2 阶 ~0.00（理论 ~1.4）、H1 全负（误差随加密
  增大 1.309→1.489）；adaptive 26 轮 H1 斜率 +0.039（正——误差随
  ndof 增大；理论 -0.5），误差平台 L2~0.2534/H1~1.492——收敛到
  错误函数（einsum 之外的组装/边界 bug）。
- 结论强化：该基线条件全程未产生任何一个正确的收敛数字；场景 A
  问题在此条件下无执行证据可答。已通知 runner-a 停止、勿改文件。

## 终局加固批（2026-08-30 09:0x，commit 98d4cb8，main）

goal「彻底完成直到只剩 key」驱动，本批清掉全部可解决残项：
- e2e 22 passed（唯一真实残点是 core-journey 的离线标签匹配器未随
  test-double 更名；perf home CLS 满载 0.135 由骨架行+min-height
  修复；terminal 两例是僵尸共享服务器假象）。首次全套绿。
- zcode-harness 7 脚本全 PASS（destructive-guard 补 PowerShell 令牌
  解析；secret-scan 清残留本地测试 PKI——按设计只应在临时目录）。
- SCIENTIFIC_MODEL.md 补 7.6/7.7/10.1 三节；收敛计划增量标 LANDED
  ——canonical 变更的 spec 同步链闭合。
- 数据下钻端点+UI+测试（HCI 第7条：可视结果可下钻 raw data）。
- 全量 vitest 2275 passed | 4 skipped。
- 剩余：completion-gate NOT_READY 唯一缺口 ACC-02（用户侧 Bailian
  key）；场景 C 真人执行 BLOCKED-user；外部产品基线 BLOCKED。
  git push 未做（对外动作，留给用户或明示）。

## 终局接管窗口 1（2026-08-30 19:0x-19:5x，commit 4aa3c2b，main）

任务书：接管最终产品/科研/工程质量，建立终局控制面（FINAL_GAPS.md /
FINAL_ACCEPTANCE.json / FINAL_EVIDENCE/），按证据推进。8 路并行只读审计
（科学/harness/安全/数据/远程/性能/HCI/平台发布/评估）产出 56 项能力矩阵，
载荷结论主代理抽验（CI 连红、netcdf fixture 根因、0.061 旧数、ACC-25 措辞）。

本批修复（全绿证据）：

- CI 红（FA-PLT-02）：dataset-netcdf 两用例移回 skipIf 守卫；本地双向验证
  （缺 fixture 3过5skip / 在位 8过）。hosted 绿待 4aa3c2b 的 CI run。
- 数字诚实（FA-EVAL-14）：三处 0.061 改为 08-29 实测披露（4/5≤0.045、
  worst 0.267 未达标）；两份 PDF 重生成+抽取核验；north-star 指针改指
  v22 文件。
- 安全 P0 批（FA-SEC-02/04/06/07 关闭，01 部分缓解）：
  W2b realpath 围栏+symlink 回归；CodeAct 别名/拆链/getattr 全封
  （TS 别名追踪+全禁，Python 别名 AST+运行时 os/sys/subprocess/socket
  身份擦除+守卫 getattr；真实 sidecar 实证 os-present: False）；
  api_key→Bearer header+错误 chokepoint 脱敏；sources 层 egress
  destination guard（https-only+拒 IP 字面量+手动重定向逐跳复检）；
  sidecar env 白名单（密钥丢弃，FARLAB_ 保留）。
- ACC-25 措辞对齐（FA-REM-01）：ACCEPTANCE_STATUS 改为 containerized
  same-host target 如实披露；evidence/r2-10/remote-suite-evidence-index
  -20260830.md 补索引（evidence/ 按治理不入 git）。
- RISK_REGISTER 补 R-19/20/21。

验证：vitest 全量 2287过/2败——cli-spawn=陈旧 dist（重建后即绿），
thinking-display=兄弟 conversation-stream 车道在制品（HEAD CI 绿证非
本批）；tsc 0；eslint 0；secret-scan PASS。

车道纪律：lane/endgame-audit-1 分支→只提交本批 26 文件→ff-merge main
→已推送。兄弟未提交文件（conversation-stream 面+规范文档）未触碰。

下一批（按 FINAL_GAPS 优先级）：hosted CI 绿核验后 FA-PLT-02 翻 PASS；
FA-SCI-05 ODE 诚实化+ode_integrate op；FA-DAT-02 far restore+三库备份；
FA-PRF-01 容量基准；FA-SEC-01 OS 级隔离调研（WSL2/AppContainer 方案）。

## 终局接管窗口 1 补记（12:3x-12:5x，commits 8a65f1c/efe42d1/ec70cb3/3f19373 + FA 状态）

CI 修复三部曲（每步都有 hosted 证据）：

1. 8a65f1c：OSS_LEDGER 按 d994b6b 树再生成——不够：CI 仍红（ledger
   在干净 clone 渲染不同）。教训：regen 前必须 npm ci 四工作区。
2. efe42d1：给 --check 失败路径加前 12 行 committed/rendered 差异输出
   （盲 FAIL 不可调试的门禁自身工程缺陷）——CI 差异输出直接定位：
   Linux 不装 @img/sharp-wasm32（三重 license 行消失）+ MIT 416/415。
3. ec70cb3：@img/* 全族按平台工件排除 + gating/documentation 分离
   （ALLOWED_EXCEPTIONS 只留 jszip；四变体处置入
   PLATFORM_BINARY_DISPOSITIONS）。残余一行 MIT 415/414。
4. 3f19373：平台孤儿定点排除——@emnapi/runtime（optional、无 os/cpu、
   全部父是平台条件可选）按 lockfile 图定点判定排除。
   → verify job hosted 绿（run 33311971591，08-28 以来首次）。

web-e2e 残余（非本批引入，零 web 改动）：perf.spec CLS 断言在 GH
runner 上 home/map ≥0.1；本地（含兄弟 WIP）home 0.0000 / map 0.0774
全过。归因=shell 重建批以来的渐进渲染 CLS 在慢 runner 边缘超限。
修复路径（不弱化阈值）：band 容器 min-height 预留真实降 CLS——
归 shell 车道（App.tsx/StudyMap.tsx/lab.css 均其未提交文件），
兄弟落地后若 CI 仍红则接手实现。

车道协调：兄弟 conversation-stream 在制品使 tests/thinking-display
本地红（HEAD CI 绿证非主干问题）；其 WIP 本地 perf 已过。

## 终局接管窗口 2（2026-08-30 21:0x-21:4x，commit f0a72c6，main）

批 2 九项全落地（避兄弟车道全部文件）：

1. FA-DAT-02 恢复闭环：src/app/backup-restore.ts（三库 VACUUM INTO
   set+MANIFEST sha256/user_version；只读校验先行——绝不 openDb 触发迁移；
   -wal 热写守卫；move-aside 回滚而非删除）+ far backup/restore CLI +
   HELP+补全树（cli-maturity 漂移守卫当场抓到我漏补全树——即修）+
   docs 重写；真实字节级损坏 round-trip 10 测试全绿。
2. FA-PRF-01 容量门：capacity-bench（1000c/100h/3000r，明示 SYNTHETIC）
   bulk 1.4s / 投影 31ms / listEvents 30ms / lineage 15ms——后端在目标
   规模快两个数量级；产物 evidence/capacity/。
3. FA-PRF-04 cancel 计时：真 orchestrator+wireCancels 对唯一出口=
   AbortSignal 的挂起 provider——0.6ms 实测钉死（<1s 断言）。
4. FA-PRF-05 sweep：补 FARLAB_DATA_DIR（原硬编码）+3 测试。
5. FA-REM-03 probe 全指纹：python/numpy 版本+cpu+GPU+nvidia-smi+
   pip-freeze sha256 入 environment 与 ResultCell fingerprint。
6. FA-DAT-05 verify vacuous 机器可读（check.vacuous+report.vacuousChecks
   +CLI 标记）。
7. FA-SCI-05 注释诚实化（ODE 腿真实状态=未实现，独立车道排队）。
8. FA-PLT-06 numpy pin（>=2.4,<3 对齐 uv.lock）。
9. FA-SCI-04 held-out 集：6 题 3 非 bio 域+真实 salted sha256 封存
   （教训：初稿写的是假哈希占位——先写答案摘要再计算真哈希回填，
   封存必须可复算）。

门禁：tsc/eslint/secret-scan 绿；全量 2306 过/2 败（1=补全树漂移已修转
绿；1=兄弟 thinking-display 在制品，非主干）。hosted CI 结果待验。
FA 计：14F/30P/10PASS/2B（56 项）。

## v9 终局任务书交付（2026-08-31，主会话——本会话无波次执行）

- 产出：`.control/ENDGAME-PLAN-v9.md`——用户将交给 Claude Code CLI
  （GLM-5.3，/goal 彻夜）的唯一权威任务书。v8 十二波 ~150 项条目全量
  保留；新增契约层：六维最高标准法（性能双实测数字/设计美学绑定
  impeccable+frontend-design 磁盘方法论/规范/能力/技术含量对照验证/
  诚实）、单项状态机+完成断言三问、选择函数与反空转、决策权限
  （任务书点名=已授权；对外发布/平台设置=登记待批不等待）、抗压缩
  启动协议（第一动作=落盘+三方对账）、两态停止条件。4 处 [v9增补]：
  浅断言清点→修复队列入册；Wave A 末设计基线走查；Wave D 末美学终审；
  Wave F 类型逃逸存量清零。
- 本会话未执行任何波次工作、未触碰代码，不声称任何完成。终局状态与
  stop-guard 一致：ACC-02/B-QWEN 凭证（09-05 用户窗口）、CPS-P6 用户
  验收、演示视频=USER-OWNED；对抗审计/frontier sweep 两门未跑；
  completion-gate 维持 NOT_READY。
- 对账提示：工作树仍有 ~22 未提交文件（conversation-stream 面+规范
  文档，兄弟车道在制）+未跟踪 1.md；夜间代理按任务书§1 对账接管。
- 补充（同日）：用户告知 Claude Code /goal 输入上限 4000 字符——已产出
  内核版 `.control/ENDGAME-GOAL-v9-4000.md`（实测 3950 字符，node .length），
  架构=内核承担红线/纪律/波次地图/停止条件，全文契约留在磁盘由第一动作
  读入；两文件配合使用。
