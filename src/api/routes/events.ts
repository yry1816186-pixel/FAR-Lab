/**
 * P0-4 运行时事件流 SSE 端点（2026-08-07 落地）。
 *
 * GET /api/v1/events/stream?runId=<runId>&replay=true
 *   - SSE（text/event-stream）：推送 AgentEventBus 实时事件（JSON 序列化）
 *   - runId 过滤：仅订阅该 run 的事件
 *   - replay=true：连接后先重放该 run（或无 runId 时全部）的历史快照，再实时推送
 *   - 心跳注释行（每 15s）保持连接存活（代理/负载均衡超时防御）
 *
 * 与 P0-3 AgentEventBus 正交：事件流是内存运行时推送（session JSONL 持久化不受影响）。
 * 订阅方必须处理连接关闭（reply.raw.close → 退订），防事件泄漏。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AgentEventBus, AgentLoopEvent } from '../../agent_loop/events.ts';

/** SSE 路由配置（显式传入·禁 process.env 直读·可测）。 */
export interface EventsStreamRouteOptions {
  readonly bus: AgentEventBus;
  /** 心跳间隔（ms·默认 15000）。 */
  readonly heartbeatMs?: number;
}

/** 查询参数（Fastify schema 强类型）。 */
interface StreamQuery {
  readonly runId?: string;
  readonly replay?: string;
}

const HEARTBEAT_COMMENT = ': heartbeat\n\n';

function sseSerialize(evt: AgentLoopEvent): string {
  // SSE 规范：data 行以 \n 结尾，payload 内换行须以 data: 前缀续行。
  const json = JSON.stringify(evt);
  return `event: ${evt.type}\ndata: ${json}\n\n`;
}

function isStreamQuery(q: unknown): q is StreamQuery {
  if (typeof q !== 'object' || q === null) {
    return false;
  }
  const rec = q as Record<string, unknown>;
  if (rec.runId !== undefined && typeof rec.runId !== 'string') {
    return false;
  }
  if (rec.replay !== undefined && typeof rec.replay !== 'string') {
    return false;
  }
  return true;
}

/** 发送 SSE 帧（防已关闭连接静默写失败）。 */
function sendFrame(reply: FastifyReply, frame: string): void {
  const raw = reply.raw;
  if (!raw.writableEnded && !raw.destroyed) {
    raw.write(frame);
  }
}

/**
 * 注册事件流 SSE 路由。
 *
 * 关闭语义：客户端断开（close）或服务端 close() 触发退订；路由返回后由
 * reply.hijack() 保持底层 socket 存活。调用方负责 bus 生命周期
 * （server 层创建/注入；进程退出由 server 优雅关闭统一处理）。
 */
export function registerEventsStreamRoute(
  app: FastifyInstance,
  opts: EventsStreamRouteOptions,
): void {
  const heartbeatMs = opts.heartbeatMs ?? 15_000;

  app.get<{ readonly Querystring: StreamQuery }>(
    '/events/stream',
    {
      schema: {
        hide: true,
        querystring: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            replay: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request: FastifyRequest<{ readonly Querystring: StreamQuery }>, reply: FastifyReply) => {
      const q = request.query;
      if (!isStreamQuery(q)) {
        await reply.code(400).send({ error: 'invalid query parameters' });
        return;
      }
      const runIdFilter = q.runId ?? null;
      const wantReplay = q.replay === 'true';

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      raw.write(': connected\n\n');

      // 重放历史（订阅前快照·避免与实时事件竞态重复）。
      if (wantReplay) {
        const snapshot =
          runIdFilter === null ? opts.bus.snapshot() : opts.bus.snapshotFor(runIdFilter);
        for (const evt of snapshot) {
          sendFrame(reply, sseSerialize(evt));
        }
      }

      const handler = (evt: AgentLoopEvent): void => {
        if (runIdFilter !== null && evt.runId !== runIdFilter) {
          return;
        }
        sendFrame(reply, sseSerialize(evt));
      };
      const unsubscribe = opts.bus.on(handler);

      // 心跳：注释行保持连接（无事件时每 heartbeatMs 一次）。
      const heartbeat = setInterval(() => {
        sendFrame(reply, HEARTBEAT_COMMENT);
      }, heartbeatMs);
      heartbeat.unref();

      const cleanup = (): void => {
        unsubscribe();
        clearInterval(heartbeat);
        if (!raw.writableEnded && !raw.destroyed) {
          raw.end();
        }
      };
      raw.on('close', cleanup);
      raw.on('error', cleanup);
    },
  );
}
