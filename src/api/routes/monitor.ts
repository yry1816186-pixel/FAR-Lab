// src/api/routes/monitor.ts
// /api/v1/monitor/* —— Monitor HTTP 端点（架构 §3.3：挂既有 Fastify 实例，不立新服务器）。
//
//   GET /monitor/latest   → { sample, alerts, thresholds }（最新快照 + 阈值告警）
//   GET /monitor/history?limit=N → { samples, count }（环形缓冲最近 N 条，时间升序）
//
// 空历史契约（census §4-4 红线落地）：缓冲为空时 latest 返 sample:null + note，
// 不报 500 不空屏——如实"尚无数据"。

import type { FastifyInstance } from 'fastify';
import { evaluateAlerts, DEFAULT_THRESHOLDS } from '../../monitor/alerts.ts';
import type { Sampler } from '../../monitor/sampler.ts';

export interface MonitorRouteOptions {
  readonly sampler: Sampler;
}

export async function registerMonitorRoutes(
  app: FastifyInstance,
  opts: MonitorRouteOptions,
): Promise<void> {
  const { sampler } = opts;

  app.get('/monitor/latest', async () => {
    const sample = sampler.latest();
    if (sample === null) {
      return {
        sample: null,
        alerts: [],
        note: 'No data available (sampler buffer empty)',
        samplerRunning: sampler.running,
      };
    }
    return {
      sample,
      alerts: evaluateAlerts(sample, DEFAULT_THRESHOLDS),
      thresholds: DEFAULT_THRESHOLDS,
      samplerRunning: sampler.running,
    };
  });

  app.get('/monitor/history', async (request) => {
    const q = request.query as { limit?: string };
    const parsed = q.limit === undefined ? 0 : Number.parseInt(q.limit, 10);
    const limit = Number.isNaN(parsed) ? 0 : parsed;
    const samples = sampler.history(limit);
    return {
      samples,
      count: samples.length,
      ...(samples.length === 0 ? { note: 'No data available (sampler buffer empty)' } : {}),
    };
  });

  // GET /monitor/stream —— SSE 实时推送（架构 §3.1 决策修正：单向推送用 SSE 而非
  // WebSocket——零新增依赖 @fastify/websocket，任意代理可穿，5s tick 即天然心跳）。
  // 契约：连接即发当前最新快照（无快照则发 note 事件），随后每 tick 推一帧
  // `data: {sample, alerts, thresholds}\n\n`；连接关闭即退订（不泄漏监听器）。
  app.get('/monitor/stream', (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const send = (payload: unknown): void => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const latest = sampler.latest();
    if (latest === null) {
      send({ note: 'No data available (sampler buffer empty)', samplerRunning: sampler.running });
    } else {
      send({ sample: latest, alerts: evaluateAlerts(latest, DEFAULT_THRESHOLDS), thresholds: DEFAULT_THRESHOLDS });
    }

    const unsubscribe = sampler.subscribe((sample) => {
      send({ sample, alerts: evaluateAlerts(sample, DEFAULT_THRESHOLDS), thresholds: DEFAULT_THRESHOLDS });
    });
    request.raw.on('close', () => {
      unsubscribe();
      reply.raw.end();
    });
  });
}
