/**
 * lifecycle 路由——生命周期事件只读查询（阶段 7 P2 · BA3-3 修正通知机制）。
 *
 * 背景（findings BA3-3）：撤回/纠正/supersession 生命周期事件已完整落库（0021
 * lifecycle_events · append-only 哈希链·IC-05），但**无 API 暴露**——相关方无法
 * 查询「我的 claim 是否被修正/撤回」。本路由提供只读查询入口：
 *
 *   GET /api/v1/lifecycle/events?targetKind=claim&targetId=xxx
 *     → { ok, data: { targetKind, targetId, events: [...] } }
 *
 * 通知语义（BA3-3「修正后如何通知相关方」的诚实落地——当前阶段无邮件/webhook 渠道）：
 *   1. **可查询**：任何相关方持 targetId 即可查全部生命周期事件（含 corrected/retracted/
 *      superseded 终态 + actor + reason + 事件哈希链 prev/current）——修正不静默。
 *   2. **可导出**：.far-proof bundle 已含 lifecycle.jsonl（A3 分量）——离线核验同源。
 *   3. **主动通知（V2）**：邮件/webhook 推送登记为 V2 项（需订阅模型·不在本阶段）。
 *
 * 只读·无鉴权（事件是公开科学记录——修正可见性是反误导的诚信要求；与 claim 内容
 * 公开性一致）。模型中立（24§0.1 红线）。零容忍合规：无 any / @ts-ignore / 空 catch。
 */

import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import { listLifecycleEvents } from '../../evidence_log/lifecycle.ts';
import type { LifecycleTargetKind } from '../../evidence_log/lifecycle.ts';

const TARGET_KINDS: readonly string[] = ['claim', 'verdict_node', 'proof_envelope', 'evidence'];

/**
 * 注册生命周期事件查询路由（GET /lifecycle/events）。
 */
export async function registerLifecycleRoutes(
  app: FastifyInstance,
  config: { readonly db: Database },
): Promise<void> {
  app.get('/lifecycle/events', async (request, reply) => {
    const query = request.query as { readonly targetKind?: string; readonly targetId?: string };
    const targetKind = query.targetKind;
    const targetId = query.targetId;

    // 参数校验：缺参/非法 kind → 400（fastify query 无 schema——手动 fail-closed）。
    if (targetKind === undefined || targetId === undefined || targetId.length === 0) {
      return reply.code(400).type('application/problem+json').send({
        error_code: 'VALIDATION_FAILED',
        message: 'targetKind and targetId query params are required',
        source_anchor: { fileId: null, stageId: null, callRecordId: null },
      });
    }
    if (!TARGET_KINDS.includes(targetKind)) {
      return reply.code(400).type('application/problem+json').send({
        error_code: 'VALIDATION_FAILED',
        message: `targetKind must be one of: ${TARGET_KINDS.join(', ')}`,
        source_anchor: { fileId: null, stageId: null, callRecordId: null },
      });
    }

    const events = listLifecycleEvents(config.db, targetKind as LifecycleTargetKind, targetId);

    return reply.code(200).send({
      ok: true,
      data: {
        targetKind,
        targetId,
        events: events.map((e) => ({
          eventId: e.eventId,
          targetKind: e.targetKind,
          targetId: e.targetId,
          fromState: e.fromState,
          toState: e.toState,
          actor: e.actor,
          reason: e.reason,
          auditRef: e.auditRef,
          prevHash: e.prevHash,
          currentHash: e.currentHash,
          createdAt: e.createdAt,
        })),
      },
    });
  });
}
