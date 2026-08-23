# PROGRESS — Technology Intelligence & Source Fusion Expedition (/goal)

## 当前状态
[STATE: FUSION-WAVE-1-COMPLETE] P0 三 RU 全部 INTEGRATED 进 production path;
P1/P2 队列(RU-4..15)与 RU-3 剩余梯队(T3/T4/T6/T7/T8)记录在 registry。
Suite 1305 pass / 3 skip @ c065838。

## 本波落地(2026-08-24,全部命令级验证)
1. **T0 修正**:F-1 loopback guard 原已存在(api.ts:1949)——补 6 用例回归锁
2. **T1 认知层防御**(6264148/e54f0d3):evidence 通道分离(untrustedSourceContent)
   + AgentTool.trust 标记 + MCP 桥接 external + transcript untrusted:true +
   invokeStructured 统一咽喉附加 UNTRUSTED_DATA_RULE(单一 owner
   src/shared/untrusted.ts)+ 确定性注入语料门(5 形状种子,live 门 BLOCKED-live)
3. **RU-2 lineage 存储**(bf5b9fa):migration v5(lineage_edges+event_tags)+
   queryEvents(ANY-of/keyset/limit)+ ?tag= API + 确定性回填 + SAVEPOINT
   嵌套事务根治(db.ts 潜伏缺陷);domain/lineage.ts = 词汇单一 owner
4. **RU-1 memory 衬底**(91016d3):migration v6(memory_items/edges/fts;
   zod lifecycle + SQL CHECK 双层治理,SQLite CHECK-NULL 陷阱被测试抓出)+
   投毒门(own_verified 溯源可解析才过,否则诚实降级)+ ACT-R 确定性排序 +
   append-only supersession + consolidateRun(零 LLM、幂等)+
   orchestrator 终态钩子 + GET /api/v1/memory
5. **T2 taint 统一**(91016d3 内):ContentTaint 单一 owner=domain/memory.ts;
   claim 结构性 derived_untrusted
6. **消费者 #1**(1bea4ee):memoryNegativeConditioning → generate_hypotheses
   priorResearchMemory(标签随行;ids 进指纹防 stale cache);OR 检索语义
7. **T5 审计链**(c065838):migration v7 prev_hash 链 + 引擎级 append-only
   触发器 + 写一次回填 + verifyEventChain(定位首个破坏 seq)+ 用户删除
   特权路径(drop/recreate 触发器 + deleted_runs tombstone,保住 run 删除功能)
8. **LIVE 验证**(37b0ce8,env 门控):真实 far.db 迁移到 v6;7442 events →
   14455 tags、3020 lineage 边回填;真实 vitamin D run 整合 + 检索命中

## Lane 事件记录
- c0beb6b 误卷入兄弟 staged 文件(exploration-runner 等)→ 当分钟 soft-reset
  修复为 pathspec 提交 6264148,兄弟 index 原样保留(未重写历史,自己未推送提交)
- 兄弟 lane:EEL exploration.py/exploration-runner.ts in-flight(tsc 2 错为他们的
  半成品,最终全绿时已修);docker 测试容器名竞争为瞬态,复跑绿

## 下一步(按 registry 优先级)
1. RU-3 剩余:T3 工具边界策略检查 → T4 exfil 绊线 → T6 审批反操纵 → T7 能力令牌
2. RU-2 剩余:branch writer(run fork)+ PROV-O 序列化器 + 兄弟投影 rebase 协调
3. RU-1 剩余:semantic/profile 写入者;fastembed A/B(eval 门控)
4. P1 研究波次:RU-6 SCISOFT(lead 最厚)→ RU-7 STORAGE → RU-8 CAMPAIGN → …
5. HCI RU-11 实施前需用户批准(用户规则)

## 环境事实(不变)
- 禁 live-LLM 实测(验证离线/确定性;live 标 BLOCKED-live;zai 限流至 08-29)
- 禁 DeepSeek;兄弟会话同树(只用显式文件列表 pathspec 提交)

