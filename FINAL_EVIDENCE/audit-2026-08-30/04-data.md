# 数据/计算底座审计（2026-08-30，只读）

> 来源：终局接管第一轮并行审计（Explore 子代理，64 次工具调用）。
> 纠正两个前提：migrations 实际到 **v9**；far.db 物理表 13 张 + memory_fts 虚拟表 + lazy FTS 两张 + 独立库两张（far-scheduler.db jobs、source-cache.db source_response_cache）。live 工作区 .far-run/artifacts 现存 685 个 blob。

```
CAP-01 | durable DB | PASS | db.ts:254-319 (timeout=10s busy, WAL, synchronous=NORMAL 默认/FULL 可选, foreign_keys=ON, BEGIN IMMEDIATE+SAVEPOINT 嵌套)；CHECK 仅 memory_items+jobs；39 种 object kind 读时 zod fail-closed | SQL CHECK 覆盖面只一张表；jobs/cache 表在迁移链之外(第二 schema owner) | lazy DDL 漂移无迁移保障 | CHECK 扩展到 objects 关键 enum；lazy DDL 收编 v10+ | tests/reliability-db-guards.test.ts | db.ts:23-252, store.ts:32-76
CAP-02 | migration 体系 | PASS | db.ts:321-345：user_version 前向链、降级 fail-visible 拒开、事务内重读防并发迁移；migrations-upgrade.test.ts 验证原位升级+幂等 | 无 down-migration（forward-only 契约，注释明示） | schema 回退场景无路径 | 每条迁移补 down-note 文档 | migrations-upgrade.test.ts | db.ts:321-345
CAP-03 | transaction + events 追加链 | PASS | appendEvent 单事务内 event+tags+prev_hash+meta；per-run prev_hash=SHA256(prev‖payload‖payloadJson)；v7 不可变触发器拦 UPDATE/DELETE；两连接交错写链可验；伪造行被链 mismatch 抓出 | deleteRunCascade 特权删除路径无外部审计锚；无外部 anchor，整库重链式改写不可检测（诚实标注） | tamper-evidence 上限是"改历史必留痕"非"改不了" | external anchor（导出时链头哈希写入 bundle） | audit-chain.test.ts:24-60 | store.ts:292-353
CAP-04 | backup/restore/corruption recovery | PARTIAL | backupTo=VACUUM INTO(拒绝覆盖)；far backup CLI；测试验证快照 integrity_check+链可验+WAL 拷贝陷阱规避 | 无 far restore 动词、无自动化恢复演练测试；far-scheduler.db 与 source-cache.db 不在备份内（文档明示需手工 cp）；无定时备份 | 恢复是文档不是代码 | restore 一键化+三库一致性备份集+损坏注入 drill | docs/backup-restore.md 步骤逐条自动化 | storage-hardening.test.ts:22-130
CAP-05 | content-addressed artifacts | PASS | artifacts.ts:20-90：sha256/2-hex 分片、原子落地(tmp+rename)、碰撞拒绝、ENOENT 区分、hash 格式门；gc 引用集容忍双拼写 | 常规读路径不重验内容哈希（仅 verify probeArtifact 重验，注释自认）；gc 引用集靠正则扫 JSON（启发式） | 截断 blob 非 verify 路径读到则静默（窗口极小） | put 记 size + get 可选复验；引用改结构化字段 | reliability-artifact-atomicity.test.ts | artifacts.ts:34-90
CAP-06 | dataset versioning + TOCTOU fence | PASS | dataset-netcdf.ts:84-107 双读栅栏+sha256Expected 再验；immutable raw+lineage 链；确定性 split(uint32 纯整数)；OpenML 幂等；dataset_audit op 检出泄漏/重复；篡改拒读测试 | leakage 结论是降级披露不是阻断（有论证）；CSV 仅提供 sha256Expected 时校验 | 预注册判定遇泄漏依赖披露纪律 | trainTestLeakRows>0 时 verdict 强制降 exploratory | dataset-netcdf.test.ts:44-139 | dataset-netcdf.ts:74-144
CAP-07 | streaming/chunking/大文件 | FAIL | 无流式实现。CSV MAX_BYTES=100MB 全量入内存、NetCDF 200MB readFileSync、artifacts put/get 全 Buffer、sources http res.text() 无体积帽、corpus_items 全文内联 SQLite | 一切数据面操作以"整个文件一个 Buffer"为前提；上限是护栏不是能力 | 大数据集直接不可用或 OOM | 流式哈希+流式 put+CSV 行迭代器+NetCDF 变量子集读 | 500MB NetCDF + 1GB CSV 端到端 benchmark | datasets.ts:16,54
CAP-08 | 静态加密 | FAIL | 无。全仓 grep 无 sqlcipher/AES/at-rest；SECURITY.md 无条目；明文落盘 | 完全缺失（local-first 单用户可辩护，但无决策记录） | 笔记本丢失=科研数据+memory 全泄露 | 定位决策：显式非目标 or SQLCipher+AES-GCM | grep -ri encrypt 为空即证 | SECURITY.md:20-35
CAP-09 | cache 层与 projection 一致性 | PARTIAL | FTS 镜像 delete+reinsert 全 kind 重索引；response-cache TTL+replay miss 即拒；stateAtSeq 如实披露；step_fingerprints 防陈旧回放 | 每次 put 镜像 kind 触发 O(该 kind 全部行) 重索引（规模天花板）；镜像 best-effort | 对象过千后写放大；drift 期间搜索漏召回 | 镜像改增量 upsert | cache-layout.test.ts | store.ts:109-169
CAP-10 | lineage | PASS | v5 lineage_edges+event_tags；live writer 在 putObject 咽喉点（IMMEDIATELY — no backfill needed）；forkRun 写 forked_from；backfill 幂等；词表单 owner | dataset 派生链走 DatasetRecord.lineage 数组（第二血统表示），交叉一致性无校验 | 两套 lineage 表示语义重叠 | 统一或加一致性 check | lineage-storage.test.ts:23-117 | store.ts:979-1079
CAP-11 | executor family 完整度 | PARTIAL | 已有：tabular ML、统计(abs/paired/bootstrap/conformal)、theory identity 数值抽查、FEM uniform+AFEM（fem.py 质量高：残差估计器含 Neumann 边界项、Doerfler、NVB 保形）、Monte-Carlo CRN、meta-analysis 频派(DL/HK/Q)、SSH remote | 缺：ODE——problem-model.ts:207 注释声称 'numerical_simulation -> (FEM/ODE)' 但 OPS 注册表无任何 ODE 算子【证伪成立】；Bayesian 无痕迹；optimization 自述需 sidecar 但无 op；多 GPU/HPC 无 | 注释与能力不符误导路由 | 注释改如实清单 or 补 ode_integrate op（scipy solve_ivp+收敛阶验证） | executor-fem.test.ts:286,309,371 | fem.py:393-649, problem-model.ts:204-221
CAP-12 | PostgreSQL/object-storage 后端 | BLOCKED_EXTERNAL | 无实现痕迹；ARCHITECTURE.md §117 显式非决策 | 未做过 ADR——'可选后端'是缺位而非计划 | 无（刻意单机 local-first） | 若多用户成需求先写 ADR | grep -rin postgres 空 | ARCHITECTURE.md:45-52,117
CAP-13 | far verify 16 checks 强度 | PASS | 固定 16 check 同序；bundle 不可读 fail-closed；工件真重哈希；receipt zod+路由一致性；lock 哈希重算 | check 13/14/15/16 对 legacy bundle 空转通过（注释明示）；check 11 零 claim 也通过；recompute 级别只出指引不真重算 | 空转通过可能让旧 bundle 全绿被误读 | legacy check 附降级标记；recompute 接真重放 | verify.test.ts:149-265 九个失败路径 | verify.ts:19-36
```

## Top 3 最高杠杆改进

1. **数据面流式化（CAP-07）**：artifacts.put/get 与数据集读取改流式（createReadStream + 流式 sha256 + 分块写），CSV 行迭代器。从"演示规模"到"科研规模"的结构性门槛。改动集中在 artifacts.ts / datasets.ts / dataset-netcdf.ts。
2. **恢复闭环 + 多库备份集（CAP-04）**：far restore 动词 + 三库一致性备份 + 损坏注入 drill。备份已强，恢复仍是文档。
3. **执行族补齐或诚实化（CAP-11）+ verify 空转收紧（CAP-13）**：先改 problem-model.ts:207 的 ODE 虚假声明；再补 ode_integrate sidecar op（复用 FEM verdict 机械判定模式）；verify 的 4 个 legacy 空转 check 加显式降级标记。

## 证伪清单

- 审计未运行任何测试（只读约束）；"tested"结论来自测试文件源码。跑 `npx vitest run tests/storage-hardening.test.ts tests/audit-chain.test.ts tests/dataset-netcdf.test.ts` 可证伪 CAP-03/04/06。
- ODE 缺失判断基于 __main__.py 的 OPS 注册与全仓 `def op_` 枚举。
- 685 blob 计数来自本机 .far-run，不代表其他部署。
