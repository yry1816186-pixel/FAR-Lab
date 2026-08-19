/**
 * borrow_registry — CORE-BORROW-001 非平凡设计先检索、比较、试验。
 *
 * 宪法顺序 Problem→Search→Candidate Set→Compare→Spike→Evidence→Decision→
 * Implement 的登记面：
 *   - BORROW_INVENTORY：真实生产依赖（package.json dependencies 实测 2026-08-18）
 *     的借用记录——每条含 alternativesConsidered（≥2 个真实比较过的替代方案 +
 *     弃因）+ trialEvidence（指向仓库内真实存在的试用证据：测试文件/源码使用
 *     点/决策记录）+ decision；
 *   - checkBorrowDiscipline(inventory, repoRoot, prevDeps, currentDeps)：
 *     (1) 复用 src/security/dependency_risk.ts 的 checkDependencyAdditions 对齐
 *         新增依赖检出（同一语义：current − prev）；每个新增必须有借用记录
 *         （alternatives-considered 记录强制——宪法原文）；
 *     (2) trialEvidence 路径逐一真实存在（不存在 = 编造的试用证据，fail）；
 *     (3) alternativesConsidered < 2 = 没有真正的候选集比较，fail。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 登记表证明「替代方案被记录、试用证据路径存在」，不证明比较分析的
 *     判断质量（选错的决策也能有完整记录）；
 *   - trialEvidence 存在性 ≠ 试验充分性——测试文件存在不证明它覆盖了该
 *     依赖的关键风险面；
 *   - 弃因描述是登记时的快照，不追踪上游后续版本是否改变权衡。
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { checkDependencyAdditions } from '../security/dependency_risk.ts';

export interface AlternativeConsidered {
  readonly name: string;
  readonly whyRejected: string;
}

export interface BorrowRecord {
  /** npm 依赖名（与 package.json dependencies 键一致）。 */
  readonly technology: string;
  readonly usedFor: string;
  readonly alternativesConsidered: readonly AlternativeConsidered[];
  /** 试用证据：仓库内真实路径（测试/源码使用点/文档），kind:path 形态。 */
  readonly trialEvidence: readonly string[];
  readonly decision: 'adopted' | 'rejected';
  readonly decidedAt: string;
}

/**
 * 真实借用清单（生产 dependencies 实测 2026-08-18 @feat/t1-gov-core worktree）。
 * 每条的 trialEvidence 指向仓库内可验证的真实资产（checkBorrowDiscipline 会
 * 逐一验存在性——维护者改路径时门会 fail，逼着更新）。
 */
export const BORROW_INVENTORY: readonly BorrowRecord[] = [
  {
    technology: 'zod',
    usedFor: '运行时 schema SSOT（governance/planning/research 契约 + LLM 结构化输出校验）',
    alternativesConsidered: [
      { name: 'ajv (JSON Schema draft-07)', whyRejected: 'schema 即 plain JSON 无 TS 类型推导，丢编译期安全；错误信息弱' },
      { name: 'io-ts', whyRejected: '函数式编码器风格与 zod-to-json-schema 的 LLM 结构化输出直通需求不匹配' },
      { name: '手写守卫函数', whyRejected: '每个契约重复实现，漂移面大（违反 SSOT 单点纪律）' },
    ],
    trialEvidence: ['tests:tests/schema/schema_smoke.test.ts', 'src:src/governance/types.ts', 'src:src/planning'],
    decision: 'adopted',
    decidedAt: '2026-03-12',
  },
  {
    technology: 'fastify',
    usedFor: 'REST API server（far api：claim/evidence/verify 端点）',
    alternativesConsidered: [
      { name: 'express', whyRejected: '中间件生态老、内建 schema 校验弱（fastify 原生 JSON Schema + TS 类型集成更好）' },
      { name: 'hono', whyRejected: 'edge-first 定位与 better-sqlite3 同机单进程部署不匹配（收益为零）' },
      { name: 'node:http 手写路由', whyRejected: '路由/错误面手工维护，测试面反而更大' },
    ],
    trialEvidence: ['tests:tests/api', 'src:src/api'],
    decision: 'adopted',
    decidedAt: '2026-04-02',
  },
  {
    technology: 'better-sqlite3',
    usedFor: '证据台账/claim 图持久层（同步 API · 单写者假设下的嵌入式存储）',
    alternativesConsidered: [
      { name: 'pg (PostgreSQL)', whyRejected: '要求外部服务——离线/第三方验证场景（.far-proof 自包含）不可接受' },
      { name: 'prisma', whyRejected: 'codegen 工具链重；同步事务模型与确定性内核单写者假设不符' },
      { name: '纯 JSONL 文件', whyRejected: '事件台账已用 JSONL；claim 图需要索引查询（部分保留：campaign 层正是 JSONL）' },
    ],
    trialEvidence: ['tests:tests/db/open.test.ts', 'src:src/db'],
    decision: 'adopted',
    decidedAt: '2026-03-15',
  },
  {
    technology: 'openai',
    usedFor: 'OpenAI 兼容协议 SDK（DashScope/兼容网关适配层基座）',
    alternativesConsidered: [
      { name: '裸 fetch + 手写 SSE', whyRejected: '重放/重试/流式协议处理重复实现，错误面大（SDK 已在 tests/llm_gateway 有确定性回放测试覆盖）' },
      { name: '@anthropic-ai/sdk', whyRejected: '锁单一 provider——多网关兼容目标需要 OpenAI 协议作为公共形态' },
    ],
    trialEvidence: ['tests:tests/llm_gateway/openai_compatible_adapter.test.ts', 'src:src/llm_gateway/adapters'],
    decision: 'adopted',
    decidedAt: '2026-05-20',
  },
  {
    technology: 'ulid',
    usedFor: 'runId 生成（单调可排序 · 时间有序证据链）',
    alternativesConsidered: [
      { name: 'uuid v4', whyRejected: '纯随机无时序——台账排序与调试定位成本高' },
      { name: '自增整数', whyRejected: '跨进程/重启有碰撞协调成本' },
    ],
    trialEvidence: ['src:src/research/orchestrator.ts', 'tests:tests/research/baseline.test.ts'],
    decision: 'adopted',
    decidedAt: '2026-03-20',
  },
  {
    technology: 'fast-json-stable-stringify',
    usedFor: '规范 JSON 序列化（哈希链 contentHash 的确定性编码——键序无关）。2026-08-20 起被 canonicalize（RFC 8785）取代并从 dependencies 移除；记录保留作决策史',
    alternativesConsidered: [
      { name: 'JSON.stringify + 手工递归排序', whyRejected: '哈希 SSOT 不容实现漂移；库实现被 evidence_log 全链测试锁定' },
      { name: 'canonicalize', whyRejected: '当时（2026-03）评估：维护不活跃——2026-08-20 翻案，见 canonicalize 记录（RFC 8785 合规需求 + vendor 字节钉住压过维护活跃度顾虑）' },
    ],
    trialEvidence: ['src:src/evidence_log/hasher.ts', 'tests:tests/evidence_log'],
    decision: 'adopted',
    decidedAt: '2026-03-12',
  },
  {
    technology: 'canonicalize',
    usedFor: 'RFC 8785 JCS 规范 JSON 序列化——信任内核 canonicalHash SSOT（evidence_log/agent_loop/lifecycle 哈希链 + 浏览器侧独立验证镜像）。取代 fast-json-stable-stringify：第三方审计方可用任意 RFC 8785 实现（Python rfc8785 / Go jcs 等）独立重算 contentHash，不再绑定 JS niche 库的行为',
    alternativesConsidered: [
      { name: '维持 fast-json-stable-stringify', whyRejected: '非 RFC 8785 实现——「独立重算」承诺依赖单一 JS 库行为；跨语言 byte-equal 无法对齐标准（Py json.dumps 1e-07 vs TS 1e-7 已知分歧）' },
      { name: '自研 RFC 8785 序列化器', whyRejected: '数字最短表示/UTF-16 排序等边角极易做错；上游已有规范实现，自研=无租金复杂度' },
    ],
    trialEvidence: ['src:src/vendor/canonicalize.js', 'src:src/evidence_log/hasher.ts', 'tests:tests/golden_vectors'],
    decision: 'adopted',
    decidedAt: '2026-08-20',
  },
  {
    technology: 'zod-to-json-schema',
    usedFor: 'stage zod schema → LLM structured-output json_schema 的确定性转换',
    alternativesConsidered: [
      { name: '手写双 schema（zod + JSON Schema 并行维护）', whyRejected: '两份 SSOT 必然漂移——转换器单点替代人工同步' },
      { name: 'typeconv', whyRejected: 'TS-first 工具链，与运行时 zod 实例不同源' },
    ],
    trialEvidence: ['tests:tests/llm_gateway/t013_structured_output_wiring.test.ts'],
    decision: 'adopted',
    decidedAt: '2026-06-01',
  },
  {
    technology: 'typescript',
    usedFor: '类型系统即第一道契约（tsc --noEmit 门 + 严格零 any 纪律）',
    alternativesConsidered: [
      { name: '纯 JavaScript + JSDoc', whyRejected: '信任内核的确定性重构无编译期保障不可接受' },
      { name: 'flow/rescript', whyRejected: '生态与 node 24 原生 type-stripping 运行路径不匹配' },
    ],
    trialEvidence: ['cmd:pnpm run typecheck', 'src:src/cli/far.ts'],
    decision: 'adopted',
    decidedAt: '2026-03-01',
  },
  {
    technology: '@fastify/helmet',
    usedFor: 'API 安全响应头（far api 的基础防护）',
    alternativesConsidered: [
      { name: '手写 onResponse 头注入', whyRejected: '安全头清单是外部动态事实——手写即硬编码过期面（违反 GOV-EXTERNAL-001）' },
      { name: 'fastify-helmet 社区旧包', whyRejected: '已停止维护并让位于官方 @fastify scope——安全件不用弃管分支' },
    ],
    trialEvidence: ['src:src/api'],
    decision: 'adopted',
    decidedAt: '2026-06-15',
  },
  {
    technology: '@fastify/jwt',
    usedFor: 'API 鉴权（JWT 签发/校验——authz 中间件）',
    alternativesConsidered: [
      { name: 'jsonwebtoken', whyRejected: '与 fastify 请求生命周期集成需手工桥接；@fastify/jwt 原生装饰器与类型集成' },
      { name: '@fastify/session + cookie 会话', whyRejected: '有状态会话模型与无状态 API 客户端（.far-proof 验证器直连）不匹配' },
    ],
    trialEvidence: ['src:src/security/authz.ts', 'tests:tests/security'],
    decision: 'adopted',
    decidedAt: '2026-06-15',
  },
  {
    technology: '@fastify/rate-limit',
    usedFor: 'API 限流（公开端点滥用防护）',
    alternativesConsidered: [
      { name: '自建令牌桶', whyRejected: '重复实现已审计的公共件；限流策略错误是高代价面' },
      { name: '反向代理层限流（nginx/caddy）', whyRejected: '给离线第三方验证场景强加部署依赖——限流必须随进程自带' },
    ],
    trialEvidence: ['src:src/api'],
    decision: 'adopted',
    decidedAt: '2026-06-15',
  },
  {
    technology: '@fastify/cors',
    usedFor: 'CORS 策略（前端跨域访问 API）',
    alternativesConsidered: [
      { name: '手写 preflight/头处理', whyRejected: 'CORS 细节多且易错；标准件 + 显式 origin 白名单配置更可审计' },
      { name: '移植 express cors 中间件', whyRejected: 'express 中间件签名与 fastify 生命周期不兼容，桥接层反而引入新错误面' },
    ],
    trialEvidence: ['src:src/api'],
    decision: 'adopted',
    decidedAt: '2026-06-15',
  },
  {
    technology: '@fastify/swagger',
    usedFor: 'OpenAPI 规范生成（gen:openapi 单一来源，禁止手写漂移）',
    alternativesConsidered: [
      { name: '手写 openapi.yaml', whyRejected: '路由与规范双 SSOT 必然漂移；生成器 + openapi:check 门锁死一致性' },
      { name: 'tsoa 装饰器代码生成', whyRejected: '要求装饰器优先的路由声明风格 + 构建步骤，偏离仓库存量 plain route 注册' },
    ],
    trialEvidence: ['cmd:pnpm run gen:openapi', 'tests:tests/ci'],
    decision: 'adopted',
    decidedAt: '2026-07-01',
  },
];

export interface BorrowCheck {
  readonly ok: boolean;
  /** 新增依赖（对齐 checkDependencyAdditions 的检出）。 */
  readonly additions: readonly { name: string; requiredJustification: string }[];
  /** 无借用记录的生产依赖。 */
  readonly unrecorded: readonly string[];
  /** 试用证据路径不存在的记录（technology + 失效路径）。 */
  readonly brokenEvidence: readonly { technology: string; path: string }[];
  /** 候选集比较不足（<2 替代方案）的记录。 */
  readonly thinComparisons: readonly string[];
}

/** 解析 trialEvidence 的 kind:path → 仓库相对路径（cmd: 证据跳过存在性——命令运行时验证）。 */
function evidenceToPath(ref: string): string | null {
  const idx = ref.indexOf(':');
  if (idx === -1) return null;
  const kind = ref.slice(0, idx);
  const path = ref.slice(idx + 1);
  if (kind === 'cmd') return null;
  if (kind !== 'tests' && kind !== 'src') return null;
  return path;
}

/**
 * 借用纪律门（CORE-BORROW-001）：
 *   - currentDeps 中每个生产依赖必须有 adopted 借用记录；
 *   - 新增（current − prev，复用 checkDependencyAdditions）额外要求书面理由
 *     面向调用方暴露（requiredJustification 由其生成）；
 *   - 每条记录 ≥2 alternativesConsidered 且 trialEvidence 路径真实存在。
 * prevDeps 缺省 = 当前清单本身（全量盘点模式：只查记录完备性不查新增）。
 */
export function checkBorrowDiscipline(
  inventory: readonly BorrowRecord[],
  repoRoot: string,
  currentDeps: readonly string[],
  prevDeps?: readonly string[],
): BorrowCheck {
  const additions = checkDependencyAdditions(prevDeps ?? currentDeps, currentDeps);
  const byTech = new Map(inventory.map((r) => [r.technology, r]));
  const unrecorded = currentDeps.filter((name) => !byTech.has(name)).sort();
  const brokenEvidence: { technology: string; path: string }[] = [];
  const thinComparisons: string[] = [];
  for (const record of inventory) {
    if (record.alternativesConsidered.length < 2) thinComparisons.push(record.technology);
    for (const ref of record.trialEvidence) {
      const rel = evidenceToPath(ref);
      if (rel === null) {
        if (!ref.startsWith('cmd:')) brokenEvidence.push({ technology: record.technology, path: ref });
        continue;
      }
      if (!existsSync(join(repoRoot, rel))) brokenEvidence.push({ technology: record.technology, path: rel });
    }
  }
  return {
    ok: unrecorded.length === 0 && brokenEvidence.length === 0 && thinComparisons.length === 0,
    additions,
    unrecorded,
    brokenEvidence,
    thinComparisons,
  };
}
