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
5. 手术 workflow 分支作用域重启用→本切片末位重新休眠（仅 workflow_dispatch）

## 验证状态（诚实）

- 切片 1：全量绿（见上）+ 311f4a7 ci verify succeeded
- 切片 2：最终裁决以 head ci 全绿为准（含 web-e2e/release-pack）
- 迭代历史：中途 lint 解析错误（手术脚本语法、band 错位）已修；
  两次 diagnose 提交与我推送竞态失败（cosmetic，不影响代码）

## 登记未做（后续切片，非本 PR 声称范围）

- CLI：`far protocol show/record`（HTTP 已可用；CLI 命令面待加，模式已侦察：
  experiment.ts 的 CliResult/openWorld/UsageError 结构）
- 导出链：协议+台账入 bundle（verify 项）与论文 limitations 投影
- 范式覆盖深化：theory（CAS 集成）、archive（登记库检索接口）
- 手术 workflow 在 main 保持休眠（本切片末位已重新休眠）

## 用户侧不变

- B-QWEN-LIVE-ROUTE：DASHSCOPE_API_KEY（比赛路线 live receipt）仍 OPEN
- B-S1-TECHNICAL-PDF：待用户审阅
