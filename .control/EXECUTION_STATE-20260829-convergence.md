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
   休眠：无 push 触发、手动派发亦零作用，main Actions 历史不再被污染
6. **侦察/取证教训**：68KB main.ts 直读不可行 → 派生代理字节级锚点侦察（含 agent
   块 4 空格缩进陷阱）后一次命中；子代理若无本地 Read 会自作主张改走网络并可能
   误取旧快照误导裁决（曾误读 main 上切片 2 旧 diag）——委派须显式指定 Read 工具
   与本地路径。#27 diagnose 与 #26 字节同快照（无 diff 不提交）曾致“无提交”误判——
   同内容无 diff 是正常静默，非丢失

## 切片 3 验证状态（诚实）

- bump-2 诊断（423af9d）：唯一失败 protocol-cli usage 用例，根因六定位
- bump-3 诊断（3549990）：全绿（217 文件/2209+7 跳过/0 失败；无任何 _FAILED）
- **最终合并门 = 本末位提交（surgery 合法休眠 + 控制面补记）head 上的 ci 全绿，
  此后无任何推送**（bot 推送不触发 ci，不作为门）

## 登记未做（后续切片，非本 PR 声称范围）

- 导出链：协议+台账入 bundle（verify 项）与论文 limitations 投影
- 范式覆盖深化：theory（CAS 集成）、archive（登记库检索接口）
- 手术 workflow 在 main 保持休眠（workflow_dispatch + 单 no-op job 合法形态——
  零 job 版会被 GitHub 判为无效 workflow，每次携带 push 登记幽灵 Failure run）；
  apply-log.txt / diag.txt 留树内作为切片取证记录（path-hygiene 允许）
- 既有 cosmetic：tests/memory-live-check.test.ts 三条 unused eslint-disable 警告
  （main 上既有，非本切片引入）；secret-scan 对 tests/thinking-display.test.ts
  测试假凭据的 MEDIUM 发现与 path-hygiene WARN 亦为 main 既有状态

## 用户侧不变

- B-QWEN-LIVE-ROUTE：DASHSCOPE_API_KEY（比赛路线 live receipt）仍 OPEN
- B-S1-TECHNICAL-PDF：待用户审阅
