import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { createQwenVlClient } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/qwen_vl_client.ts';
import { QWEN_VL_DEFAULT_MODEL } from '../../src/llm_gateway/adapters/aliyun_qwen_vl/types.ts';

const SAMPLE_BASE64_1X1_RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

interface CapturedRequest {
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

function hasImagePart(payload: Record<string, unknown>): boolean {
  if (!Array.isArray(payload.messages)) return false;
  for (const message of payload.messages) {
    const messageRecord = objectRecord(message);
    if (messageRecord === null || !Array.isArray(messageRecord.content)) continue;
    for (const part of messageRecord.content) {
      const partRecord = objectRecord(part);
      if (partRecord?.type === 'image_url') {
        return true;
      }
    }
  }
  return false;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'x-request-id': `client-local-${status}`,
  });
  res.end(JSON.stringify(body));
}

function completionBody(modelId: string): Record<string, unknown> {
  return {
    id: `chatcmpl-${modelId}`,
    request_id: `body-${modelId}`,
    object: 'chat.completion',
    created: 0,
    model: modelId,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: '{"claim":"client vision ok"}',
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

async function startOpenAiCompatibleVisionServer(): Promise<{
  readonly baseURL: string;
  readonly requests: CapturedRequest[];
  readonly close: () => Promise<void>;
}> {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      sendJson(res, 404, { error: { message: 'not found' } });
      return;
    }
    const payload = objectRecord(JSON.parse(await readBody(req)));
    const modelId = typeof payload?.model === 'string' ? payload.model : null;
    requests.push({
      authorization: req.headers.authorization,
      modelId,
      hasImagePart: payload === null ? false : hasImagePart(payload),
    });
    if (modelId !== QWEN_VL_DEFAULT_MODEL) {
      sendJson(res, 400, { error: { message: `unexpected model ${modelId ?? '<missing>'}` } });
      return;
    }
    sendJson(res, 200, completionBody(modelId));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address === 'string' || address === null) {
    await closeServer(server);
    throw new Error('test server did not bind to a TCP port');
  }
  return {
    baseURL: `http://127.0.0.1:${(address as AddressInfo).port}/v1`,
    requests,
    close: () => closeServer(server),
  };
}

test('qwen_vl_client: real SDK HTTP preserves header request id and image part', async () => {
  const http = await startOpenAiCompatibleVisionServer();
  const client = createQwenVlClient({
    apiKey: 'client-local-key',
    baseURL: http.baseURL,
    timeoutMs: 5_000,
  });

  try {
    const result = await client.sendMultimodalRequest(
      {
        imageBase64: SAMPLE_BASE64_1X1_RED_PNG,
        mimeType: 'image/png',
        prompt: '结构化描述这张图',
      },
      7,
    );

    assert.equal(http.requests.length, 1);
    assert.equal(http.requests[0]?.authorization, 'Bearer client-local-key');
    assert.equal(http.requests[0]?.modelId, QWEN_VL_DEFAULT_MODEL);
    assert.equal(http.requests[0]?.hasImagePart, true);
    assert.equal(result.callRecordSeq, 7);
    assert.equal(result.credential.providerRequestId, 'client-local-200');
    assert.equal(result.credential.capability, 'vision');
    assert.equal(result.interpretation, '{"claim":"client vision ok"}');
  } finally {
    await http.close();
  }
});
