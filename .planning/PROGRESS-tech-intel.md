# PROGRESS — Technology Intelligence & Source Fusion Expedition (/goal)

## 当前状态
[STATE: FUSION-WAVE-2-COMPLETE] wave1(P0 三 RU)+ wave2(T4/T6/branch writer/
PROV-O/RU-6 三 GO)全部落地。Suite 1332 pass / 3 skip @ 715d32c。
RU-3 防御体系七层中六层 INTEGRATED(T7 诚实 DEFER);RU-2 双导出+分支写入齐;
RU-6 SCISOFT 3/4 GO 落地(GO3 排 EEL 协调)。

## 本波(2)落地(2026-08-24,全部命令级验证)
1. **T4 exfil 绊线**(011477a):exfil-guard 模块(env 秘密收集/session canary/
   出站扫描/命名化违规/脱敏)+ 两挂点(invokeStructured 出站体扫 + kernel
   工具实参绝对检查,先于权限)+ **自测抓出 transcript 泄漏洞**(被拒实参仍
   入档→随下轮出站)→ denied-args 统一脱敏
2. **branch writer**(c7cfc91):forkRun(问题按 id 引用不复制+forked_from 边+
   step cache 种子=Execution-Lineage 依赖域 replay+审计 note)+ POST fork API
3. **PROV-O**(c7cfc91+6734064):toProvJsonLd(同一 lineage_edges 单源双导出;
   wasInformedBy/wasGeneratedBy/used + CiTO IRI 注入,原始 relation type 从
   对象补全)
4. **T6 审批反操纵**(24332c4):riskLevel(kind 映射)+argSummary(确定性渲染)
   服务端计算不可伪造;模型 title 标注;web 卡 risk 徽章+服务端摘要优先
5. **T7 裁决 DEFER**:令牌需外部验证方(SSH/MCP 服务端认证);无人验证的
   令牌=安全表演——触发器:外部面采纳令牌认证
6. **RU-6 SCISOFT**(ad574d3 SEARCH_SATURATED):GO1 撤稿信任门 8b1a85b
   (Crossref update-to 派生+claims 显式降权注记);GO2 CiTO 映射 6734064
   (保守:仅主源验证过的 3 个精确 IRI,其余 cito:cites+far 注记,测试锁
   全面对性+不伪造);GO4 GRIM+E-value 715d32c(clean-room TS,发表级
   canonical 用例 3.22/n=3 判负);GO3 PRISMA 计数排队(EEL export 面)

## 剩余队列(按 registry)
1. RU-6 GO3 PRISMA(需 EEL lane 协调:计数必须来自管线阶段状态)
2. ~~RU-1 writers~~ 67857cc;RU-7 四项全 INTEGRATED(86f12b2+7dd6ed6 outbox);RU-5 QUANT GO1 conformal+GO2 range guard 477ea63(包与兄弟并行包已对账合并)
3. RU-2 residual:兄弟 lineage.ts 投影 rebase(其 lane);delegation 边接线
4. P1 研究波:RU-5 QUANT / RU-7 STORAGE / RU-8 CAMPAIGN / RU-9 CTXENG /
   RU-10 CORPUS / RU-12..15
5. 终局盲点复审(goal §22 第 11 条)
6. live workload 验证 = BLOCKED-live(用户禁测令;zai 08-29 恢复)

## 环境事实(不变)
- 禁 live-LLM 实测;禁 DeepSeek;兄弟会话同树(pathspec 提交+提交前查暂存面)

## 历史波次(详见 registry log 与 git log)
- wave 1(本日早):T0 修正/T1 定界/RU-2 存储 v5/RU-1 记忆 v6+消费者/T2 taint
  统一/T5 审计链 v7/T3 工具边界;真实 far.db live 验证(14455 tags/3020 边)。
  Lane 事故 1 起(c0beb6b 误卷兄弟暂存,当分钟修复)。
