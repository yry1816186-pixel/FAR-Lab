# 动手练习（Exercises）

> 学习路线 [00_START_HERE](../00_START_HERE.md) 的配套练习目录。
> 每个练习独立可做，标 ⭐ 的是进阶题。做完对照自测清单（各章末尾）。

## 01 · 问题域

- E1.1 读 `src/demo_seeds/p1_room_temp_superconductor.ts` 前 60 行，写出
  FEC 的 metric / threshold / comparator。
- E1.2 跑 `node src/cli/far.ts demo`，找出 UNTESTED claim 的 reasonCode。
- E1.3 ⭐ 用 `src/statistics/multiple_testing.ts` 对 Bem 9 个 p 值
  跑 Bonferroni 与 BH-FDR，比较拒绝集合。

## 02 · 系统走查

- E2.1 跑 `far doctor`，解释每个检查项对应什么依赖。
- E2.2 跑 `far demo`，把三段输出的 decisive rule 记成表。
- E2.3 跑 `far export far-proof --demo-chain --force && far verify .far-proof`。
- E2.4 ⭐ 对比 `far demo tess-offline` 与 `far demo` 的 verdict 差异并解释。

## 03 · 信任内核

- E3.1 读 `src/falsifiability/verdict_kernel_v2.ts` L286-570，对照规则表。
- E3.2 跑 `far verify-golden --all`，标注每条对应哪个规则。
- E3.3 ⭐ 写 10 行脚本调 `decideFiveValueVerdict`，传 `fec=null` 观察 R1。

## 04 · 统计引擎

- E4.1 手工复算 z 检验 p 值（对照 demo ③ 输出）。
- E4.2 用 `adjustPValues` 跑三种校正，比较拒绝集合。
- E4.3 读 `t_distribution.test.ts`，找与已知表值对照的断言。
- E4.4 ⭐ 复算 Bem Exp1：53.1%，N=100，H0=50%，看 p≈0.014（单尾）再 Bonferroni。

## 05 · 反剧场检测

- E5.1 读 `optional_stopping.ts`，画出 freeze→recompute→compare 结构。
- E5.2 跑 `pnpm run test:anti_theater` 的攻击语料测试。
- E5.3 跑 `far audit-seed-cherry`，找 HIDDEN_FAILED_RUN。
- E5.4 ⭐ 思考：攻击者偷换 metric 后重算所有哈希，V1 为什么防不住？（README Known limits #9）

## 06 · 证据链

- E6.1 用 `hashCanonicalJson` 验证键序无关性。
- E6.2 读 `src/evidence_log/verifier.ts` 的 verifyChainHead。
- E6.3 跑 `merkle_cross_lang.test.ts` 观察跨语言一致。
- E6.4 ⭐ 篡改 `.far-proof` 一个字节再 verify，观察 exit 7。

## 07 · 证明包

- E7.1 完整跑 7.4 四步篡改实验。
- E7.2 手工 `sha256sum` 比对 integrity.json 条目。
- E7.3 读 proof_envelopes.jsonl 找 verdict 与 proofHash。
- E7.4 ⭐ verify 一个不存在的目录，观察 fail-closed。

## 08 · CLI 与 API

- E8.1 `far doctor` + `far status --db <db>`。
- E8.2 `far verify-golden --all`。
- E8.3 起 `far api`，curl /health /verdict /integrity/root。
- E8.4 ⭐ 写 5 行 shell 脚本检查 `far verify` 退出码。

## 09 · 前端

- E9.1 本地起全栈（far api + frontend dev），走通 Overview→Court。
- E9.2 关掉后端，观察前端优雅降级。
- E9.3 ⭐ 在浏览器控制台用 lib/merkle.ts 的 API 算一个 Merkle 根。

## 10 · Benchmark

- E10.1 跑 `far bench run` 观察聚合输出。
- E10.2 解剖 A4（行星轨道衰减）为什么 INCONCLUSIVE。
- E10.3 ⭐ 解剖 M2（SGLT2）为什么 CONFIRMED，对比统计输入差异。

## 11 · 生产化

- E11.1 `docker compose up far-demo`（如有 Docker）。
- E11.2 读 SECURITY.md §44-73 列出 3 条密钥硬规则。
- E11.3 跑 `node scripts/check-supply-chain.mjs`。
- E11.4 ⭐ 读 ci.yml 画 CI 步骤依赖图。

## 12 · 扩展（毕业挑战）

- E12.1 实现 `AT-DATA-LEAK` 检测器（先 RED 测试 → GREEN 实现 → 注册 → 全量验证）。
- E12.2 ⭐ 新增一个 demo seed（真实问题 + 六阶段 + registry 注册）。
- E12.3 ⭐ 新增一个 CLI 子命令（parse_options + 退出码契约 + 文档）。
