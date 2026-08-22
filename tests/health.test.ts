import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { canonicalJson, canonicalSha256 } from '../src/shared/crypto.js';
import { isCancellationError } from '../src/pipeline/stages/guard.js';

/**
 * Toolchain + core-invariant baseline. The original single hash-regex test had zero
 * discriminating power (WP2 test audit: "proves Node.js works, nothing about FAR-Lab").
 * These still run in milliseconds but redden if the load-bearing primitives regress:
 * zod schema parsing, canonical hashing determinism (provenance currency), and the
 * cancellation predicate used by every degradation guard.
 */
describe('toolchain health', () => {
  it('runs vitest with ESM + node crypto (toolchain baseline)', () => {
    const h = createHash('sha256').update('far-lab').digest('hex');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('domain schemas parse a canonical object (zod baseline not broken)', () => {
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 't', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: { assumptions: [] },
      createdAt: new Date().toISOString(),
    });
    expect(q.id).toMatch(/^q_[0-9a-z]{20,32}$/);
  });

  it('canonical hashing is deterministic and key-order invariant (provenance currency)', () => {
    const a = { run: 1, artifacts: [{ z: 1, a: 2 }] };
    const b = { artifacts: [{ a: 2, z: 1 }], run: 1 };
    expect(canonicalSha256(a)).toBe(canonicalSha256(b));
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('cancellation predicate still recognizes stage-suffixed cancellations', () => {
    expect(isCancellationError(new Error('cancelled by user during rank'))).toBe(true);
    expect(isCancellationError(new Error('ModelErrored'))).toBe(false);
  });
});
