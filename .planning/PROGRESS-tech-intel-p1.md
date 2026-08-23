# PROGRESS — Technology Intelligence & Source Fusion Expedition (P1 wave session)

## 当前状态
[STATE: RESEARCH-COMPLETE + FUSION-SLICES-1&2-LANDED] 全部 15 个 RU 研究覆盖
完成，零 MISSING。本会话融合切片落地：
- 切片1（RU-10 A2.8/A4.5）：src/domain/minhash.ts（8/8）+
  src/pipeline/stages/hypothesis-dedup.ts preMergeNearDuplicates（词法层
  MinHash jaccard≥0.9 并查集预合并，接入 clusterCandidates，6/6）
- 切片2（RU-14 A8.4）：src/domain/revision-predicates.ts——
  decisionRulePreservation / falsifiabilityRetention / scopeDelta 纯函数，
  修订质量确定性评分向量（10/10），待 revise/feedback 车道接线消费
- 验证：tsc 0 / eslint 0；全量 1407+ passed；残余 fail 均为兄弟车道
  in-flight 的 Docker/SSH 环境测试（api.test verify 与 remote-executor
  单跑均绿、全量偶发=环境竞态，非本切片引入）
兄弟会话高速推进：RU-9 ctxeng GO3/GO4、taint bundle-verify、zh trigram 检索、
far backup/memory verb 均已 commit。未提交文件留给用户统一提交。

## P1 波次成果 (2026-08-24)
- RU5-QUANT.md / RU7-STORAGE.md / RU8-CAMPAIGN.md / RU9-CTXENG.md /
  RU10-CORPUS.md / RU11-HCI-RESEARCHER.md(提案,用户门控) / RU14-EVAL-EXEC.md
- 全部 SEARCH_SATURATED + 封闭裁决词 + 离线验证负载 + UNVERIFIED 清单
- 关键探针 FACT：node:sqlite 无 backup 方法(VACUUM INTO 验证)；
  fts5 trigram 中文短语 HIT/<3字 MISS；OpenAlex CJK 检索实测命中
- 前沿雷达：TencentDB Agent Memory LICENSE 直读=标准 MIT(疑问关闭)
- 故障排除：委派通道 deepseek 402 计费死亡→主 Agent 直研模式

## 环境事实
- 兄弟会话写集（禁碰，持续活跃）：src/app/*, src/persistence/*,
  src/experiment/*, src/providers/http.ts, src/shared/ports.ts,
  src/pipeline/stages/retrieve.ts（其 in-flight）
- 本会话写集：research/tech-intel/*.md + REGISTRY/TREE patch +
  src/domain/minhash.ts + src/pipeline/stages/hypothesis-dedup.ts +
  tests/{minhash,hypothesis-dedup}.test.ts + hypotheses.ts 一处 import/接线
- live LLM blocked 至 08-29；DeepSeek 禁用；同树提交只用显式文件列表

## 下一步
1. 融合切片候选（均纯新文件、避兄弟写集）：RU-14 revision predicates
   （VersionDiff 纯函数）→ RU-15 stratified-allocation sampler →
   RU-12 artifact-diff.ts（zod-walking 结构化 differ）
2. RU-11 提案仍等用户批准；§20 真实 workload 验证 BLOCKED-live 至 08-29

## 已排除方案
- 子 Agent 委派：deepseek-v4-flash HTTP 402（计费级，重试无意义）
- wal_checkpoint(TRUNCATE) 运行时探针：安全门关键词拦截，默认模式+文档背书
