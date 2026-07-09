import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { createQwenVlAdapter } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_adapter.ts';

const SAMPLE_BASE64_1x1_RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

interface CapturedHttpRequest {
  readonly method: string | undefined;
  readonly path: string | undefined;
  readonly authorization: string | undefined;
  readonly modelId: string | null;
  readonly hasImagePart: boolean;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function modelIdFromPayload(payload: unknown): string | null {
  const record = objectRecord(payload);
  if (record === null) return null;
  return typeof record.model === 'string' ? record.model : null;
}

function payloadHasImagePart(payload: unknown): boolean {
  const record = objectRecord(payload);
  if (record === null || !Array.isArray(record.messages)) return false;
  for (const message of record.messages) {
    const messageRecord = objectRecord(message);
    if (messageRecord === null || !Array.isArray(messageRecord.content)) continue;
    for (const part of messageRecord.content) {
      const partRecord = objectRecord(part);
      if (partRecord !== null && partRecord.type === 'image_url') {
        return true;
      }
    }
  }
  return false;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'x-request-id': `local-${status}`,
  });
  res.end(JSON.stringify(body));
}

function completionBody(modelId: string, content: string): Record<string, unknown> {
  return {
    id: `chatcmpl-${modelId}`,
    request_id: `req-${modelId}`,
    object: 'chat.completion',
    created: 0,
    model: modelId,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content,
          refusal: null,
        },
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    },
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err !== undefined) reject(err);
      else resolve();
    });
  });
}

async function startOpenAiCompatibleServer(): Promise<{
  readonly baseURL: string;
  readonly requests: CapturedHttpRequest[];
  readonly close: () => Promise<void>;
}> {
  const requests: CapturedHttpRequest[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      sendJson(res, 404, { error: { message: 'not found' } });
      return;
    }

    const raw = await readBody(req);
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: { message: 'invalid json' } });
      return;
    }

    const modelId = modelIdFromPayload(payload);
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      modelId,
      hasImagePart: payloadHasImagePart(payload),
    });

    if (modelId === 'qwen-vl-max') {
      sendJson(res, 429, {
        error: {
          message: 'quota exhausted by local proof server',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        },
      });
      return;
    }
    if (modelId === 'qwen-vl-plus') {
      sendJson(res, 200, completionBody(modelId, '{"claim":"backup vision ok"}'));
      return;
    }
    sendJson(res, 400, { error: { message: `unexpected model ${modelId ?? '<missing>'}` } });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address === 'string' || address === null) {
    await closeServer(server);
    throw new Error('test server did not bind to a TCP port');
  }
  const port = (address as AddressInfo).port;
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => closeServer(server),
  };
}

test('real_429穿透_fallback_chain', async () => {
  const http = await startOpenAiCompatibleServer();
  const adapter = createQwenVlAdapter({
    apiKey: 'test-key',
    modelId: 'qwen-vl-max',
    baseURL: http.baseURL,
    timeoutMs: 5_000,
  });

  try {
    const result = await adapter.interpret({
      imageBase64: SAMPLE_BASE64_1x1_RED_PNG,
      mimeType: 'image/png',
      prompt: '结构化描述这张图',
    });

    const attemptedModels = http.requests.map((request) => request.modelId);
    assert.equal(attemptedModels[0], 'qwen-vl-max');
    assert.equal(attemptedModels.at(-1), 'qwen-vl-plus');
    assert.ok(
      http.requests.some((request) => request.modelId === 'qwen-vl-max'),
      'primary model must be attempted through HTTP before fallback',
    );
    assert.equal(
      http.requests.filter((request) => request.modelId === 'qwen-vl-plus').length,
      1,
      'backup model should be reached once after primary 429s',
    );
    assert.ok(
      http.requests.every((request) => request.method === 'POST' && request.path === '/v1/chat/completions'),
      'adapter must use OpenAI-compatible chat completions HTTP endpoint',
    );
    assert.ok(
      http.requests.every((request) => request.authorization === 'Bearer test-key'),
      'SDK path must attach the configured bearer key',
    );
    assert.ok(
      http.requests.every((request) => request.hasImagePart),
      'vision request must carry an image_url content part through HTTP',
    );

    assert.equal(result.credential.modelId, 'qwen-vl-plus');
    assert.equal(
      result.credential.providerRequestId,
      'local-200',
      'OpenAI SDK surfaces x-request-id as _request_id; VL adapter must preserve that real SDK request id',
    );
    assert.equal(result.credential.adapterMeta?.qwenVlModel, 'qwen-vl-plus');
    assert.equal(result.interpretation, '{"claim":"backup vision ok"}');
  } finally {
    await http.close();
  }
});
