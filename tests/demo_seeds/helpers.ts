/**
 * demo_seeds 共享 helper —— database 初始化 + gateway 构造 + fixture 工厂。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/41_可证伪证据链_FEC.md §1 + 17_FINAL_AUDIT.md §7 (demo seed 要求).
 *
 * 每个 demo seed 跑完整 6-stage agent loop（offline_replay adapter·不依赖真实 API），
 * 产出：raw input 文本、SourceCard、VerdictNode、reproHash、GraphSubtree、evidence_log 记录。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import Database from 'better-sqlite3';

import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type {
  LlmResponse,
  ProviderProfile,
} from '../../src/llm_gateway/types.ts';
import { runMigrations } from '../../src/db/index.ts';

// ---------- DB setup ----------

export function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

// ---------- fixture LlmResponse ----------

export function fixtureResponse(content: string): LlmResponse {
  return {
    credential: {
      providerProfile: 'offline_replay',
      providerRequestId: null,
      modelId: 'test-fixture-model',
      modelVersion: null,
      capability: 'structured',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    },
    content,
    raw: { replayed: true, messageCount: 2 },
  };
}

// ---------- sequential gateway ----------

/**
 * 创建按调用顺序返回不同 fixture 的 fake gateway。
 *
 * runAgentLoop 顺序调用 stage1→stage2→stage3→stage4→stage5→stage6，
 * 每次 callLlm 按计数器索引返回对应阶段的 fixture LlmResponse。
 */
export function createSequentialGateway(contents: readonly string[]): LlmGateway {
  let callIndex = 0;
  return {
    register: () => {},
    callLlm: async (_profile: ProviderProfile): Promise<LlmResponse> => {
      const content = contents[callIndex];
      if (content === undefined) {
        throw new Error(
          `createSequentialGateway: callLlm invoked ${
            callIndex + 1
          } times but only ${contents.length} fixtures provided`,
        );
      }
      callIndex += 1;
      return fixtureResponse(content);
    },
    registeredProfiles: () => [],
  };
}
