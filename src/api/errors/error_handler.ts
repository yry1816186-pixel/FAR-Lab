/**
 * error_handler —— 统一错误响应处理（RFC 7807 Problem Details 子集）。
 *
 * 设计原则：
 *   - 所有错误响应包含 source_anchor（fileId / stageId / callRecordId 三元定位·24 红线）。
 *   - 错误体结构：{ error_code, message, source_anchor, detail? }
 *   - HTTP 状态码与 error_code 映射明确（禁裸 500 {error: "..."}）。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 *
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiErrorResponse } from '../types.ts';

/**
 * API 错误类——携带 source_anchor 的结构化错误。
 *
 * 用于路由内部主动抛错（如资源不存在 / 参数无效 / 内部状态异常）。
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly sourceAnchor: {
    readonly fileId: string | null;
    readonly stageId: string | null;
    readonly callRecordId: string | null;
  };
  readonly detail?: unknown;

  constructor(args: {
    readonly statusCode: number;
    readonly errorCode: string;
    readonly message: string;
    readonly sourceAnchor?: {
      readonly fileId?: string | null;
      readonly stageId?: string | null;
      readonly callRecordId?: string | null;
    };
    readonly detail?: unknown;
    readonly cause?: unknown;
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = 'ApiError';
    this.statusCode = args.statusCode;
    this.errorCode = args.errorCode;
    this.sourceAnchor = {
      fileId: args.sourceAnchor?.fileId ?? null,
      stageId: args.sourceAnchor?.stageId ?? null,
      callRecordId: args.sourceAnchor?.callRecordId ?? null,
    };
    if (args.detail !== undefined) {
      this.detail = args.detail;
    }
  }
}

/**
 * 构造 404 错误（资源不存在）。
 */
export function notFound(resource: string, id: string): ApiError {
  return new ApiError({
    statusCode: 404,
    errorCode: 'NOT_FOUND',
    message: `${resource} not found: ${id}`,
  });
}

/**
 * 构造 400 错误（参数无效）。
 */
export function badRequest(message: string, detail?: unknown): ApiError {
  return new ApiError({
    statusCode: 400,
    errorCode: 'BAD_REQUEST',
    message,
    detail,
  });
}

/**
 * 构造 500 错误（内部错误）。
 */
export function internalError(message: string, cause?: unknown): ApiError {
  return new ApiError({
    statusCode: 500,
    errorCode: 'INTERNAL_ERROR',
    message,
    cause,
  });
}

/**
 * 构造 503 错误（服务不可用·依赖未就绪·如 benchmark 报告未生成）。
 *
 * 语义：请求本身合法，但服务端依赖（预生成 artifact）尚未就绪——
 * 客户端可提示用户运行生成命令后重试。与 500（内部错误）区分。
 */
export function serviceUnavailable(message: string, detail?: unknown): ApiError {
  return new ApiError({
    statusCode: 503,
    errorCode: 'SERVICE_UNAVAILABLE',
    message,
    detail,
  });
}

/**
 * Fastify setErrorHandler 回调——统一错误响应格式。
 *
 * 处理三类错误：
 *   1. ApiError：使用其携带的 statusCode + errorCode + sourceAnchor。
 *   2. ZodError（zod 校验失败）：转 400 BAD_REQUEST + zod issues detail。
 *   3. 其他 Error：转 500 INTERNAL_ERROR（不泄露内部堆栈·message 截断）。
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  void request;

  if (error instanceof ApiError) {
    const body: ApiErrorResponse = {
      error_code: error.errorCode,
      message: error.message,
      source_anchor: error.sourceAnchor,
      ...(error.detail === undefined ? {} : { detail: error.detail }),
    };
    reply.code(error.statusCode).type('application/problem+json').send(body);
    return;
  }

  if (error.name === 'ZodError') {
    const body: ApiErrorResponse = {
      error_code: 'VALIDATION_FAILED',
      message: 'request schema validation failed',
      source_anchor: {
        fileId: null,
        stageId: null,
        callRecordId: null,
      },
      detail: (error as { issues?: unknown }).issues ?? null,
    };
    reply.code(400).type('application/problem+json').send(body);
    return;
  }

  // Fastify/ajv schema 验证失败（route schema 的 body/querystring/params 不符）。
  // error.validation 为 ajv ValidationResult[]（keyword/path/message）。
  // 转 400 VALIDATION_FAILED + validation issues detail（RFC 7807）——
  // 不落到 500 INTERNAL_ERROR（避免把客户端输入错误误报为服务端故障）。
  if (error.validation !== undefined && error.validation.length > 0) {
    const body: ApiErrorResponse = {
      error_code: 'VALIDATION_FAILED',
      message: 'request schema validation failed',
      source_anchor: {
        fileId: null,
        stageId: null,
        callRecordId: null,
      },
      detail: error.validation,
    };
    reply.code(400).type('application/problem+json').send(body);
    return;
  }

  if (error.statusCode === 429) {
    const body: ApiErrorResponse = {
      error_code: 'RATE_LIMITED',
      message: 'rate limit exceeded',
      source_anchor: {
        fileId: null,
        stageId: null,
        callRecordId: null,
      },
    };
    reply.code(429).type('application/problem+json').send(body);
    return;
  }

  const body: ApiErrorResponse = {
    error_code: 'INTERNAL_ERROR',
    message: 'internal server error',
    source_anchor: {
      fileId: null,
      stageId: null,
      callRecordId: null,
    },
  };
  reply.code(500).type('application/problem+json').send(body);
}
