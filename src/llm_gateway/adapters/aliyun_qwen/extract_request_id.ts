/**
 * DashScope request id 提取（N4 凭证链 · 02 §6.6.1）。
 *
 * [须day-1核验·E2·方法:配 key 用 curl -i 真实调用，消歧三候选字段名]
 * 状态词（02 §7.4）：NEEDS_REAL_TEST。字段名按 N4 设计锁定 x-request-id header
 * （fallback 顺序 _request_id / request_id / id），但三候选 curl -i 实测未记录。
 * 缺失时上游抛 RequestIdMissingError。详见 docs/DAY1_VERIFICATION.md §E2。
 */

export interface HeaderLike {
  get(name: string): string | null;
}

/** Interface defining response like. */
export interface ResponseLike {
  readonly headers: HeaderLike;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * extract request id.
 */
export function extractRequestId(response: ResponseLike): string | null {
  return nonEmptyString(response.headers.get('x-request-id'));
}

/**
 * get data request id.
 */
export function getDataRequestId(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }

  const record = data as Record<string, unknown>;
  return (
    nonEmptyString(record._request_id) ??
    nonEmptyString(record.request_id) ??
    nonEmptyString(record.id)
  );
}

/**
 * extract request id from response or data.
 */
export function extractRequestIdFromResponseOrData(
  response: ResponseLike,
  data: unknown,
): string | null {
  return extractRequestId(response) ?? getDataRequestId(data);
}
