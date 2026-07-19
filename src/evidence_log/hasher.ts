import { createHash } from 'node:crypto';
import stableStringify from 'fast-json-stable-stringify';
import type { CanonicalInput, VerifiedCanonicalInput } from './types.ts';

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

export function canonicalHashVerified(input: VerifiedCanonicalInput): string {
  assertNoNonFiniteNumber(input, 'CanonicalInput');
  const canonical = stableStringify(input);
  if (canonical === undefined) {
    throw new Error('canonicalHash: stable stringify returned undefined');
  }
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function hashCanonicalJson(value: Record<string, unknown>): string {
  const canonical = canonicalJson(value, 'hashCanonicalJson');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function canonicalJson(value: unknown, context = 'canonicalJson'): string {
  assertNoNonFiniteNumber(value, context);
  const canonical = stableStringify(value);
  if (canonical === undefined) {
    throw new Error(`${context}: stable stringify returned undefined`);
  }
  return canonical;
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
