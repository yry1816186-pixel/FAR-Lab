/**
 * integrity 路由——证据链完整性信任根（09§4 / 23§5.2）。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/09_可复现性规范_REPRO_DETERMINISM.md §4（integrity root）+
 *            23_CI_AND_VALIDATION.md §5.2（tamper-evident trust root）+
 *            24_API网关与接口规范_API_GATEWAY.md §5.3.
 *
 * 三个端点（互补·非重复 verifyChainHead 的逐条校验）：
 *   - GET /integrity/root    → 整链折叠成单一 64-hex Merkle 根（可移植整链指纹）
 *   - GET /integrity/proof/:seq → 单条证据（按 seq）的 Merkle 包含证明（audit path）
 *   - GET /integrity/receipt → Repro Receipt（integrityRoot + chainHead + gitCommitSha）
 *
 * 价值（与 evidence/chain 的 verifyChainHead 互补）：
 *   - verifyChainHead 证「链未断·逐条 hash 一致」（顺序依赖·需全量 call_records）。
 *   - merkle_root 提供「整链指纹」+「单条包含证明」——外部审计方无需下载全部记录即可
 *     密码学验证「证据 X（seq=N）确实在 run R 的链内」。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。错误码用 type guard 收窄。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';

import {
  computeChainInclusionProof,
  computeChainMerkleRoot,
  type MerkleInclusionProof,
} from '../../evidence_log/merkle_root.ts';
import { getChainHead } from '../../evidence_log/repository.ts';
import { badRequest, notFound } from '../errors/error_handler.ts';

/**
 * integrity 路由配置。
 */
export interface IntegrityRouteConfig {
  readonly db: Database;
}

/**
 * /integrity/root 响应 DTO：整链 Merkle 根 + 链头定位。
 *
 * chainHeadHash 即 reproHash（链头 current_hash）——run 的主信任锚。
 */
export interface IntegrityRootDto {
  readonly merkleRoot: string;
  readonly leafCount: number;
  readonly chainHeadSeq: number | null;
  readonly chainHeadHash: string | null;
}

/**
 * /integrity/proof/:seq 响应 DTO：单条证据的 Merkle 包含证明。
 *
 * 审计方持有此证明 + run 的 merkleRoot 即可独立验证（无需下载全部 call_records）。
 */
export interface IntegrityProofDto {
  readonly seq: number;
  readonly leafIndex: number;
  readonly leaf: string;
  readonly siblings: readonly string[];
  readonly expectedRoot: string;
  readonly leafCount: number;
}

/**
 * Repro Receipt：可移植的整链信任根快照（schemaVersion 锁定契约演进）。
 *
 * 用途：钉入研究产物 / CI artifact / 论文附录——任一方持有 receipt + 可重算的 Merkle 根
 * 即可验证「该 run 的证据链未被篡改·且与我手中的一致」。
 */
export interface ReproReceipt {
  readonly schemaVersion: 1;
  readonly merkleRoot: string;
  readonly leafCount: number;
  readonly chainHeadSeq: number | null;
  readonly chainHeadHash: string | null;
  readonly gitCommitSha: string | null;
  readonly generatedAt: string;
}

/**
 * 构建 Repro Receipt（可测·now 注入避免时间不确定性）。
 *
 * merkleRoot 由 computeChainMerkleRoot 算（call_records.current_hash 折叠）。
 * gitCommitSha 取链头 call_record.git_commit_sha（同 run 同 commit·不依赖 server config）。
 */
export function buildReproReceipt(
  db: Database,
  opts: { readonly now?: () => string } = {},
): ReproReceipt {
  const { root, leafCount } = computeChainMerkleRoot(db);
  const head = getChainHead(db);

  let gitCommitSha: string | null = null;
  if (head !== undefined) {
    const row = db
      .prepare('SELECT git_commit_sha FROM call_records WHERE seq = ?')
      .get(head.seq) as { git_commit_sha?: string } | undefined;
    gitCommitSha = row?.git_commit_sha ?? null;
  }

  return {
    schemaVersion: 1,
    merkleRoot: root,
    leafCount,
    chainHeadSeq: head?.seq ?? null,
    chainHeadHash: head?.currentHash ?? null,
    gitCommitSha,
    generatedAt: (opts.now ?? defaultNow)(),
  };
}

function defaultNow(): string {
  return new Date().toISOString();
}

/**
 * type guard：从 unknown 错误对象安全提取 code（禁 as any）。
 */
function errorCodeOf(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'code' in value) {
    return (value as { code: unknown }).code;
  }
  return undefined;
}

/**
 * 注册 integrity 路由。
 */
export async function registerIntegrityRoutes(
  app: FastifyInstance,
  config: IntegrityRouteConfig,
): Promise<void> {
  // GET /integrity/root → 整链 Merkle 根 + 链头定位
  app.get('/integrity/root', async (_request, reply) => {
    const { root, leafCount } = computeChainMerkleRoot(config.db);
    const head = getChainHead(config.db);

    const body: IntegrityRootDto = {
      merkleRoot: root,
      leafCount,
      chainHeadSeq: head?.seq ?? null,
      chainHeadHash: head?.currentHash ?? null,
    };

    void reply.code(200).send(body);
  });

  // GET /integrity/proof/:seq → 单条证据的 Merkle 包含证明
  app.get('/integrity/proof/:seq', async (request, reply) => {
    const { seq: seqRaw } = request.params as { seq: string };
    const seq = Number.parseInt(seqRaw, 10);
    if (!Number.isInteger(seq) || seq < 1) {
      throw badRequest('seq must be a positive integer', { seq: seqRaw });
    }

    let computed: { readonly proof: MerkleInclusionProof; readonly leafIndex: number };
    try {
      computed = computeChainInclusionProof(config.db, seq);
    } catch (err) {
      if (errorCodeOf(err) === 'MERKLE_SEQ_NOT_FOUND') {
        throw notFound('call_record (seq)', String(seq));
      }
      throw err;
    }

    const { proof, leafIndex } = computed;
    const body: IntegrityProofDto = {
      seq,
      leafIndex,
      leaf: proof.leaf,
      siblings: proof.siblings,
      expectedRoot: proof.expectedRoot,
      leafCount: proof.leafCount,
    };

    void reply.code(200).send(body);
  });

  // GET /integrity/receipt → Repro Receipt（可移植整链信任根）
  app.get('/integrity/receipt', async (_request, reply) => {
    const receipt = buildReproReceipt(config.db);
    void reply.code(200).send(receipt);
  });
}
