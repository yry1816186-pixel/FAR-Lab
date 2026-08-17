/**
 * integrity 路由——证据链完整性信任根（09§4 / 23§5.2）。
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
import {
  IntegrityProofRouteSchema,
  IntegrityRootRouteSchema,
  ReproReceiptRouteSchema,
  type IntegrityProofDto,
  type IntegrityRootDto,
  type ReproReceipt,
} from './integrity_schemas.ts';

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
  app.get('/integrity/root', { schema: IntegrityRootRouteSchema }, async (_request, reply) => {
    const { root, leafCount } = computeChainMerkleRoot(config.db);
    const head = getChainHead(config.db);

    let body: IntegrityRootDto;
    if (leafCount === 0) {
      if (head !== undefined) throw new Error('integrity root is empty but chain head exists');
      body = {
        merkleRoot: root,
        leafCount: 0,
        chainHeadSeq: null,
        chainHeadHash: null,
      };
    } else {
      if (head === undefined) throw new Error('integrity root is non-empty but chain head is missing');
      body = {
        merkleRoot: root,
        leafCount,
        chainHeadSeq: head.seq,
        chainHeadHash: head.currentHash,
      };
    }

    void reply.code(200).send(body);
  });

  // GET /integrity/proof/:seq → 单条证据的 Merkle 包含证明
  app.get('/integrity/proof/:seq', { schema: IntegrityProofRouteSchema }, async (request, reply) => {
    const { seq: seqRaw } = request.params as { seq: string };
    const seq = Number(seqRaw);
    if (!/^[1-9][0-9]*$/.test(seqRaw) || !Number.isSafeInteger(seq)) {
      throw badRequest('seq must be a canonical positive safe integer', { seq: seqRaw });
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
      siblings: [...proof.siblings],
      expectedRoot: proof.expectedRoot,
      leafCount: proof.leafCount,
    };

    void reply.code(200).send(body);
  });

  // GET /integrity/receipt → Repro Receipt（可移植整链信任根）
  app.get('/integrity/receipt', { schema: ReproReceiptRouteSchema }, async (_request, reply) => {
    const receipt = buildReproReceipt(config.db);
    void reply.code(200).send(receipt);
  });
}
