import { createHash } from 'node:crypto';
import canonicalize from '../vendor/canonicalize.js';
import type { CanonicalInput, VerifiedCanonicalInput } from './types.ts';

/**
 * canonical hash.
 */
export function canonicalHash(input: CanonicalInput): string {
  if (input.prevHash === undefined || input.prevHash === '') {
    throw new Error('canonicalHash: prevHash is required');
  }

  return canonicalHashVerified({
    stageId: input.stageId,
    cred: input.cred,
    payloadKind: input.payloadKind,
    prevHash: input.prevHash,
  });
}

/**
 * canonical hash verified.
 * Uses RFC 8785 JSON Canonicalization Scheme (JCS) via `canonicalize`.
 * Replaces the former `fast-json-stable-stringify` which only sorted keys
 * but did not perform RFC 8785-compliant number serialization.
 */
export function canonicalHashVerified(input: VerifiedCanonicalInput): string {
  assertNoNonFiniteNumber(input, 'CanonicalInput');
  const canonical = canonicalize(input);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * hash canonical json (RFC 8785 JCS).
 */
export function hashCanonicalJson(value: unknown): string {
  const canonical = canonicalJson(value, 'hashCanonicalJson');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * canonical json (RFC 8785 JCS).
 */
export function canonicalJson(value: unknown, context = 'canonicalJson'): string {
  assertNoNonFiniteNumber(value, context);
  return canonicalize(value);
}

/**
 * 确定性字符串比较器（UTF-16 code-unit order，即 Array#sort 默认序）。
 *
 * 用于 hash 输入的排序时，必须用本函数而非 String#localeCompare —— localeCompare 的结果依赖
 * 运行时 locale 与 ICU 数据版本，非 ASCII 字符在不同机器/Node 构建间排序可能不同 → 相同内容产生
 * 不同 hash（深度对抗轮发现）。本函数返回 code-unit 序（确定性·跨平台一致·与 Python 默认 bytes 序对齐）。
 *
 * 返回值语义同 Array#sort 比较器（负/零/正）。
 */
export function compareStringsDeterministic(a: string, b: string): number {
  // code-unit 比较：直接用 < / > （JS 规范 < 对字符串按 UTF-16 码元逐位比较·确定性·与 locale 无关）。
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function assertNoNonFiniteNumber(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path}: NaN and Infinity are not allowed in canonical JSON`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoNonFiniteNumber(item, `${path}[${index}]`);
    }
    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      assertNoNonFiniteNumber(item, `${path}.${key}`);
    }
  }
}
