/**
 * shared/crypto/canonical —— 浏览器侧 RFC 8785 JSON Canonicalization Scheme (JCS) + SHA-256。
 *
 * Authority: 镜像后端 src/evidence_log/hasher.ts 的 canonicalHash / hashCanonicalJson。
 * Provenance: vendor 自 npm `canonicalize@4.0.0` (Apache-2.0, erdtman/canonicalize)，
 *            适配浏览器 Web Crypto subtle.digest('SHA-256')。
 *
 * 跨语言字节相等契约（与后端 hasher.ts + Python canonical_json.py 同等强度）：
 *   canonicalize(obj) 产出 RFC 8785 规范 JSON 字符串 → UTF-8 编码 → SHA-256 → 64 小写 hex。
 *   浏览器 Web Crypto / Node createHash / Python hashlib 对同一 canonical JSON 产出字节相同的摘要。
 *
 * 价值：外部审计方在浏览器中独立验证 ProofEnvelope 的 contentHash——不依赖服务端。
 *       与 merkle.ts 的包含证明验证配合，实现「内容哈希 + 链内包含」双重独立验证。
 *
 * 限制（诚实边界）：浏览器端 canonicalize 不验证科学正确性，仅验证数据完整性。
 *   NaN / Infinity / lone surrogate 会抛错（RFC 8785 不允许）。
 */

/** RFC 8785 JCS canonicalize（vendor from canonicalize@4.0.0, Apache-2.0）. */
function canonicalize(value: unknown, seen: Set<unknown> = new Set()): string {
  if (typeof value === 'number' && Number.isNaN(value)) {
    throw new Error('NaN is not allowed in canonical JSON');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Infinity is not allowed in canonical JSON');
  }
  if (typeof value === 'string' && hasLoneSurrogate(value)) {
    throw new Error('Lone surrogate is not allowed in canonical JSON');
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    if (seen.has(value)) {
      throw new Error('Circular reference detected');
    }
    seen.add(value);
    const result = canonicalize((value as { toJSON: () => unknown }).toJSON(), seen);
    seen.delete(value);
    return result;
  }
  if (seen.has(value)) {
    throw new Error('Circular reference detected');
  }
  seen.add(value);

  let result: string;
  if (Array.isArray(value)) {
    const values = value.map((cv) => {
      const v = cv === undefined || typeof cv === 'symbol' ? null : cv;
      return canonicalize(v, seen);
    });
    result = `[${values.join(',')}]`;
  } else {
    const parts: string[] = [];
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined || typeof v === 'symbol') {
        continue;
      }
      parts.push(`${canonicalize(key, seen)}:${canonicalize(v, seen)}`);
    }
    result = `{${parts.join(',')}}`;
  }

  seen.delete(value);
  return result;
}

function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i === value.length - 1) return true;
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/** 浏览器侧 SHA-256 → 64 小写 hex（Web Crypto subtle.digest）。 */
async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const digestBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digestBuffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte === undefined) throw new Error(`sha256Hex: byte undefined at index ${i}`);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
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

/** 浏览器侧 canonical JSON 字符串（RFC 8785 JCS）。 */
export function canonicalJson(value: unknown): string {
  assertNoNonFiniteNumber(value, 'canonicalJson');
  return canonicalize(value);
}

/** 浏览器侧 canonical hash：RFC 8785 JCS → SHA-256 → 64 小写 hex。 */
export async function canonicalHash(value: unknown): Promise<string> {
  const json = canonicalJson(value);
  return sha256Hex(json);
}
