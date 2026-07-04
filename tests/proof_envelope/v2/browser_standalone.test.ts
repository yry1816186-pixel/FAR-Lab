/**
 * standalone verify.html regression.
 *
 * Loads the exact inline script shipped in frontend/public/verify.html and runs it
 * with Node WebCrypto. This proves the offline browser artifact, not a parallel
 * helper, recomputes ProofEnvelope V2 proofHash byte-equal to the TS source.
 */

import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

import { sealProofEnvelopeV2 } from '../../../src/proof_envelope/v2/index.ts';
import type { ProofEnvelopeV2 } from '../../../src/proof_envelope/v2/types.ts';
import { makeValidEnvelopeV2Core } from './fixtures.ts';

interface BrowserVerifyResult {
  readonly status: 'PASS' | 'FAIL';
  readonly proofHash: string | null;
  readonly recomputedProofHash: string | null;
  readonly tamperStatus: 'clean' | 'tampered';
  readonly recomputation: { readonly browser: 'pass' | 'fail' };
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly verifiedLevels: readonly string[];
}

interface FarVerifyStandalone {
  readonly canonicalJson: (value: unknown, path?: string) => string;
  readonly computeFecHash: (fec: unknown) => Promise<string>;
  readonly computeProofHashV2: (envelope: ProofEnvelopeV2) => Promise<string>;
  readonly normalizeWhitespace: (text: string) => string;
  readonly verifyProofEnvelopeV2: (envelope: unknown) => Promise<BrowserVerifyResult>;
}

interface StandaloneSandbox {
  FARVerify?: FarVerifyStandalone;
  readonly crypto: typeof webcrypto;
  readonly TextEncoder: typeof TextEncoder;
  readonly console: Console;
  readonly document: {
    readonly addEventListener: (eventName: string, handler: () => void) => void;
  };
}

const VERIFY_HTML = resolve(process.cwd(), 'frontend', 'public', 'verify.html');

function loadStandaloneVerifier(): { readonly html: string; readonly verifier: FarVerifyStandalone } {
  const html = readFileSync(VERIFY_HTML, 'utf8');
  const script = html.match(/<script id="far-verify-standalone">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'verify.html must contain #far-verify-standalone inline script');

  const sandbox: StandaloneSandbox = {
    crypto: webcrypto,
    TextEncoder,
    console,
    document: {
      addEventListener: () => undefined,
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: VERIFY_HTML });
  assert.ok(sandbox.FARVerify, 'standalone script must expose global FARVerify');
  return { html, verifier: sandbox.FARVerify };
}

test('verify.html is standalone: no external JS/CSS/import/fetch dependency', () => {
  const { html } = loadStandaloneVerifier();
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /\bimport\s*\(/);
});

test('verify.html browser proofHash matches TS ProofEnvelope V2 fixture byte-for-byte', async () => {
  const { verifier } = loadStandaloneVerifier();
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());

  const browserHash = await verifier.computeProofHashV2(envelope);
  assert.equal(browserHash, envelope.proofHash);

  const result = await verifier.verifyProofEnvelopeV2(envelope);
  assert.equal(result.status, 'PASS');
  assert.equal(result.tamperStatus, 'clean');
  assert.equal(result.recomputation.browser, 'pass');
  assert.deepEqual(Array.from(result.verifiedLevels), ['proofEnvelope', 'browserProofHash']);
  assert.ok(
    result.warnings.some((warning) => /does not verify original raw evidence/.test(warning)),
    `browser honesty boundary missing: ${result.warnings.join(' | ')}`,
  );
});

test('verify.html detects ProofEnvelope V2 verdict-critical tamper', async () => {
  const { verifier } = loadStandaloneVerifier();
  const { envelope } = sealProofEnvelopeV2(makeValidEnvelopeV2Core());
  const firstStat = envelope.statisticalResults[0];
  assert.ok(firstStat, 'fixture statisticalResults must be non-empty');
  const tampered: ProofEnvelopeV2 = {
    ...envelope,
    statisticalResults: [{ ...firstStat, pValue: 0.999 }],
  };

  const result = await verifier.verifyProofEnvelopeV2(tampered);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.tamperStatus, 'tampered');
  assert.equal(result.recomputation.browser, 'fail');
  assert.ok(
    result.errors.some((error) => error.includes('PROOF_HASH_MISMATCH')),
    `tamper result must include PROOF_HASH_MISMATCH: ${result.errors.join(' | ')}`,
  );
});

test('verify.html canonicalJson rejects non-finite numbers', () => {
  const { verifier } = loadStandaloneVerifier();
  assert.throws(() => verifier.canonicalJson({ metric: Number.NaN }, 'fixture'), /NaN and Infinity/);
  assert.throws(() => verifier.canonicalJson({ metric: Number.POSITIVE_INFINITY }, 'fixture'), /NaN and Infinity/);
});
