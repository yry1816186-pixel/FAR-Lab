# EEL 计划红队审计结论

**结论：APPROVED WITH CONDITIONS(有条件批准)。** 方向正确、与宪法 §5/§7 兼容、build-vs-reuse 表大部分经得起攻击；但存在 3 个 P0 级设计缺口，若不在 P0 收敛门内解决就直接开工，会制造宪法明令禁止的“双真相”和剧场化科学判决。以下按严重度排序。计划中对现有代码的两处关键事实声明我已核实为真：新增 5 个 kind 对 objects 表确为零迁移(store.ts:12-27 泛型 kind+id);orchestrator 的 lease/cancel/checkpoint 复用点引用准确。

---

## P0 — 阻断性条件(必须在 P0 收敛门内裁决，均可无代码解决)

**P0-1 判决语义的诚实边界缺位：stat_report 的 supports/falsifies 是“确定性算术作用于 LLM 单方指定的语义”**
- 证据:`src/domain/hypothesis.ts:36-58` — FalsificationSpec 全部字段为自由文本(`decisionRule`/`falsificationCondition` 是 min(1) 字符串);`hypothesis.ts:32` `DecisionRuleProvenance` 已合法包含 `'model-stipulated'`(阈值本身可由模型单方指定)；计划 §3 E3(`.planning/PLAN-experiment-layer.md:51`)的验证门是"LLM proposes, deterministic schema validates, human-in-the-loop on first use **per template**",E4(:56)"stat_report bound to hypotheses: supports/weakens/falsifies/inconclusive" 未定义判决由谁、依据什么计算。
- 缺口本质：zod schema 校验只能证明实验配置“形式合法”，不能证明它对应假设的 decisionRule。翻译链 = 假设文本决策规则 →(LLM)→ ExperimentSpec 参数 →(确定性)→ 统计 → 判决。LLM 在翻译环节单方决定了“什么算证伪”，而 HITL 只按模板首次使用触发，不按“实验↔假设绑定”触发。一个完全真实执行、数学正确的 stat_report 可以与假设的真实判定规则毫无对应——这是最隐蔽的 theater。
- 修复(最小变更):ExperimentSpec 必须携带机器可读的 `DecisionBinding {metric, comparator, threshold, direction, thresholdProvenance}`,thresholdProvenance 从假设的 decisionRuleProvenance 继承；stat 判决仅由确定性代码对 DecisionBinding 与 result_set 计算得出；HITL 审批对象改为“每个假设绑定首次执行”，而非每个模板；stat_report 与 UI 必须显著展示阈值来源(如「阈值来源：model-stipulated」)。
- 清除证据：一个“DecisionBinding 与假设 decisionRule 语义偏离时被拒绝”的测试 + 一份展示绑定来源的 stat_report 渲染样例。

**P0-2 四个状态存储无权威声明，且现有 lease 续约面不覆盖长训练**
- 证据：计划同时写入 4 处状态——runs 表 pipeline 状态(store.ts:60-67)、`experiment_run` 对象(store.ts:103-113,**INSERT OR REPLACE 静默覆盖，且与事件写入不同事务**)、migration v5 调度表(E5,:62)、sidecar 本地 checkpoint。崩溃中瞬间可出现：调度表 running(心跳陈旧)/ 对象 doc running / stage 'execute' running / sidecar 已死，无人负责调和。现有 zombie 清扫只覆盖 pipeline 层(zcode-harness/scripts/sweep-zombie-runs.mjs)。
- 具体集成缺陷:`orchestrator.ts` 的 lease 续约只发生在 transition(:76)、recordReceipt(:109)、checkpointed(:135)——**appendEvent 不续约**。LEASE_TTL_MS=240s(orchestrator.ts:38)。一个只通过 appendEvent 流日志的长训练 stage 会在 240s 后丢 lease → 被看门狗收养 → RunLeaseLostError 中断实验。计划只说“复用 lease fencing”,未定义心跳机制。
- 修复：明确权威矩阵——调度表 job 行 = 作业生命周期运维真相(含 fence token);`experiment_run` 对象 = 终态投影，与调度终态转移**同事务**写入；events = 仅审计；sidecar checkpoint = 仅重放提示，永非权威。作业心跳必须同时续调度 lease 与 pipeline run lease。
- 清除证据：崩溃注入测试(kill sidecar + kill scheduler 于运行中)显示四存储自动收敛；一个 >240s 训练保持 lease 的测试。

**P0-3 调度器进 far.db + “训练日志作为 run events”会污染科学记录并制造 WAL 写热点**
- 证据：计划 E5(:62)"durable SQLite queue (same DB, new tables via migration v5)";E3(:50)/E5 "training logs stream back as run events"。`db.ts:105-111` 迁移 v4 注释自己记录了**看门狗 5s 轮询的读事务就会阻塞 WAL 写者**——团队已在远小于调度规模的负载下碰过争用。每行日志一个 events 写事务 = 数千 txn/分钟进入审计主干(events 是 `far verify`/export 的推理对象，store.ts:93-99 全量按 run 读取);`node:sqlite` 为同步 API(db.ts:1,131-141),日志洪峰会阻塞持有连接进程的事件循环。
- 修复(二选一，P0 裁决因 v5 结构难逆)：调度队列独立 DB 文件(如 far-scheduler.db,以 id 交叉引用，终态投影回 far.db)——推荐；或同库但日志一律走内容寻址 artifact 文件(流式 append),events 仅记录状态转移，心跳限频。
- 清除证据：调度器 + N 个流日志作业 + orchestrator 并发写下的吞吐测量(p99 写延迟、WAL 增长)。

---

## P1 — 应修(开工前列入对应 Phase 验收)

1. **结果身份/去重缺失**(攻击点 3、6 命中)：重试在结果已写入后重跑会生成重复 `result_set`(新 id,store.ts:111 按-id REPLACE 无法去重)。定义 result fingerprint = hash(ExperimentSpec + dataset content hash + env lockfile hash + seed + 模板版本)，调度器据此去重与缓存。
2. **数据集身份未定义内容寻址**:`dataset_record` id 未规定由内容哈希派生 → 同一 OpenML 数据集两次获取产生两条记录+重复下载。id := `dataset_<hash前缀>`;命中 checksum 即跳过下载。
3. **确定性范围过度声明**：lockfile hash ≠ 跨设备位级可复现(BLAS/MKL/线程/平台浮点)。P1 同机位级门(如计划)保留；跨设备改为容差判定 + uv python 解释器版本 pin + executor 固定 OMP_NUM_THREADS=1。
4. **'execute' stage 插入的爆炸半径未列账**:`run.ts:11-14` 闭枚举、`:69-72` STAGE_ORDER、`:74-78` runProgress 分母变化、`composition.ts:60` HANDLED_STAGES 第二份字面量清单、**`run.ts:39-43` RunEvent type 也是闭枚举**——新事件类型(job_queued/resumed 等)若不扩枚举就会被塞进 'note',审计主干退化。旧 run doc 无该 stage 记录。domain-schema/cli-term/desktop 测试与并行会话所有的 src/cli、desktop/ 必须列入 P0 协调项。
5. **跨迭代序贯检验无预注册约束**(攻击点 2/6 命中):`plan.ts:24-39` multipleTestingPolicy 只管单计划内多重性；闭环 E6 会在**同一数据集**上经 revise 反复再分析(`revise.ts:374-527` 逐信号循环)= 分岔花园 p-hacking。EVALUATION.md:3 已要求“结果之前定义评估”。修复：按数据集版本冻结首次确证性分析；看到结果后的再分析必须标记 exploratory 或换 holdout;stat_report 记录迭代序号。
6. **代码生成门措辞含混**：“reviewed templates + LLM-drafted parameterization ... generated per ExperimentSpec” 必须落为硬规则：LLM 仅产出 JSON 参数(按模板 zod 校验)，代码只允许模板实例化；任何自定义代码 = 新的经评审模板，永不在运行时生成。另:ExperimentSpec 只能引用 dataset_record id,不得接受原始本地路径(阻断 LLM 指定任意文件读取)。
7. **“exploratory”标签是 Direction-B 漂移后门**(§2/§7):无配额、无 Direction-A caller 约束的 exploratory run 会静默膨胀成通用 ML 平台。要求 exploratory 绑定 caller 说明 + 可见配额 + 永不作为确证性信号进 revise。
8. **stat_report 未钉住假设版本**：revise 会 bump version(revise.ts:452);对 v2 的判决在 v3 存在时有歧义。stat_report 携带 `hypothesisId@version + specHash`。
9. **每实验独立 venv 的磁盘/时间成本**：sklearn 栈每 venv 约 200-500MB,N×S 矩阵爆炸。改为**按 ModelBuilder 族的环境 profile lockfile**(共享 uv cache),非按实验 lock。
10. **远端数据/环境缓存未设计**：E5 每作业 SFTP 同步 code/data → 多 MB 数据集每 run 重传。远端建按 artifact hash 的内容寻址缓存，同步做增量校验。

## Notes(记录即可)

- ssh2 CVE-2025-70034:计划已标记验证——落为 P3 门禁(锁定已修补版本 + host-key pinning);注意 libssh2 原生模块在 Windows 的构建风险，备选原生 OpenSSH 二进制；sidecar 内 Fabric fallback 是第二套远端栈(适配器永久化风险)，二选一。
- `artifacts.ts:44` `get()` 强制 utf8 字符串 + 全文件 readFileSync:二进制数据集(parquet/gz)无法经 get() 往返，sidecar 须走 `path()`;建议补二进制安全读端口。
- 同主机 Docker/WSL2 SSH 是**环境边界不是安全沙箱**，对外表述不得称 containment;生成代码的真实风险边界取决于 P1-6 是否落实。
- `.far-run` 为默认数据根(composition.ts:63)且 gitignored——`.far-run/secrets.env` 位置自洽，但需把 `.far-run` 模式纳入 secret-scan.mjs/path-hygiene.mjs 的门禁清单。
- 部分矩阵统计：仅完整 cell 参检时必须在 stat_report 记录 missingness(MNAR 警示)，失败/取消 cell 保持可见。
- 测试基数：我对 `tests/*.test.ts` 静态计数为 535 个 `it/test(`;“604 套件”应为 vitest 运行时计数(含 it.each 展开)——标记 UNVERIFIED,合并前先基线化套件计数。
- build-vs-reuse 复核：thin-tracker(拒绝 MLflow/DVC)、自研 ~150LOC 全因子(缓用 Optuna)、薄数据集 resolver 三项判定**正确**，MLflow file-store 还有已知的 artifact 路径穿越历史，拒绝有据；唯一值得重推的是持久队列归属(P0-3)。另确认两个“缺失的 AI4S 必要件”并入 P1-5/P1-9:预处理仅在训练分区拟合的强制(E2 只覆盖了切分泄漏)与 receipt 中的硬件指纹。

**条件汇总**：P0-1/P0-2/P0-3 在 P0 收敛门内形成书面决定(DecisionBinding+绑定级 HITL;权威矩阵+心跳机制；调度库归属+日志路由)并写入 `.control/DECISIONS.jsonl`(该文件并行会话拥有写权，需协调)后，方可开始 P1 实现;P1-1..P1-4 须进入对应 Phase 验收项。