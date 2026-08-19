/**
 * features/evidence/BrowserReproof —— 浏览器侧独立重算面板（Live Reproof + Tamper Theatre）。
 *
 * v2 重写一度丢失的能力（v1 IntegrityPage · 805592e 树），R2 批次恢复：
 *   - ProofRecompute：对 ProofLookup 拿到的包含证明做**浏览器本地** Web Crypto 重算，
 *     与服务端 expectedRoot 比对——证据是否在链内不再依赖「相信服务器的展示」。
 *   - Tamper Theatre：翻转叶末位 hex 再重算 → 重算根立即不符 → tamper-evidence 可观测。
 *   - GoldenVerifier：从 9 个跨语言 golden 叶（后端 Node + Python 字节相等锚）在浏览器
 *     重建整树 + 验证 golden 包含证明——三实现字节相等的可视化证据。
 *
 * 诚实边界：重算证明的是「该叶 + 该审计路径折叠为该根」。它**不**证明叶内容的科学正确性，
 * 也不证明链外无删改（需配合整链 verifyChainHead / DR 演练）。
 */

import { useState, type ReactNode } from 'react';

import type { IntegrityProofDto } from '@/entities/dtos.ts';
import { canonicalHash } from '@/shared/crypto/canonical.ts';
import {
  combineHashes,
  computeMerkleRoot,
  flipLastHexChar,
  verifyInclusionProof,
} from '@/shared/crypto/merkle.ts';
import {
  GOLDEN_COMBINE_LEAF0_LEAF1,
  GOLDEN_JCS_SELF_TEST,
  GOLDEN_LEAVES,
  GOLDEN_MERKLE_ROOT,
  GOLDEN_PROOF_LEAF0,
} from '@/shared/crypto/integrity_golden.ts';
import { useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';

type RecomputeState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly ok: boolean; readonly computedRoot: string; readonly tampered: boolean }
  | { readonly kind: 'error'; readonly message: string };

/** 对一条包含证明做浏览器本地重算比对（可选篡改演示）。 */
export function ProofRecompute({ proof }: { readonly proof: IntegrityProofDto }): ReactNode {
  const t = useT();
  const [state, setState] = useState<RecomputeState>({ kind: 'idle' });

  const run = (tampered: boolean): void => {
    setState({ kind: 'running' });
    const leaf = tampered ? flipLastHexChar(proof.leaf) : proof.leaf;
    verifyInclusionProof({
      leafIndex: proof.leafIndex,
      leaf,
      siblings: proof.siblings,
      expectedRoot: proof.expectedRoot,
    })
      .then((r) => setState({ kind: 'done', ok: r.ok, computedRoot: r.computedRoot, tampered }))
      .catch((e: unknown) =>
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
  };

  return (
    <div className="mt-3 rounded border border-border bg-surface2/40 p-3" data-testid="proof-recompute">
      <p className="mb-2 text-xs text-ink3">{t('evidence.reproof.lede')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => run(false)}
          disabled={state.kind === 'running'}
          data-testid="recompute-run"
        >
          {t('evidence.reproof.run')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(true)}
          disabled={state.kind === 'running'}
          data-testid="recompute-tamper"
        >
          {t('evidence.reproof.tamper')}
        </Button>
      </div>
      {state.kind === 'done' ? (
        <div className="mt-3 space-y-2" data-testid="recompute-result">
          <div className="flex items-center gap-2">
            {state.ok ? (
              <Badge tone="ok">{t('evidence.reproof.match')}</Badge>
            ) : (
              <Badge tone="danger">{t('evidence.reproof.mismatch')}</Badge>
            )}
            <span className="text-xs text-ink3">
              {state.tampered ? t('evidence.reproof.tamperedNote') : t('evidence.reproof.honestNote')}
            </span>
          </div>
          <div className="grid gap-1 text-xs sm:grid-cols-[auto_1fr]">
            <span className="text-ink3">{t('evidence.reproof.computedRoot')}</span>
            <HashValue value={state.computedRoot} truncate={false} />
            <span className="text-ink3">{t('evidence.proof.expectedRoot')}</span>
            <HashValue value={proof.expectedRoot} truncate={false} />
          </div>
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <p role="alert" className="mt-3 text-sm text-danger" data-testid="recompute-error">
          {t('evidence.reproof.error')}: {state.message}
        </p>
      ) : null}
    </div>
  );
}

type GoldenState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | {
      readonly kind: 'done';
      readonly combineOk: boolean;
      readonly rootOk: boolean;
      readonly computedRoot: string;
      readonly proofOk: boolean;
    }
  | { readonly kind: 'error'; readonly message: string };

/** 跨语言 golden 验证：浏览器重算 combine/root/包含证明，与 Node+Python 锚逐字节比对。 */
export function GoldenVerifier(): ReactNode {
  const t = useT();
  const [state, setState] = useState<GoldenState>({ kind: 'idle' });

  const run = (): void => {
    setState({ kind: 'running' });
    void (async () => {
      const combine = await combineHashes(GOLDEN_LEAVES[0]?.expectedHex ?? '', GOLDEN_LEAVES[1]?.expectedHex ?? '');
      const root = await computeMerkleRoot(GOLDEN_LEAVES.map((l) => l.expectedHex));
      const proof = await verifyInclusionProof(GOLDEN_PROOF_LEAF0);
      return {
        combineOk: combine === GOLDEN_COMBINE_LEAF0_LEAF1,
        rootOk: root === GOLDEN_MERKLE_ROOT,
        computedRoot: root,
        proofOk: proof.ok && proof.computedRoot === GOLDEN_MERKLE_ROOT,
      };
    })()
      .then((r) => setState({ kind: 'done', ...r }))
      .catch((e: unknown) =>
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
  };

  return (
    <div className="mt-3 rounded border border-border bg-surface2/40 p-3" data-testid="golden-verifier">
      <p className="mb-2 text-xs text-ink3">{t('evidence.golden.lede')}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={run}
        disabled={state.kind === 'running'}
        data-testid="golden-run"
      >
        {t('evidence.golden.run')}
      </Button>
      {state.kind === 'done' ? (
        <ol className="mt-3 space-y-1.5 text-xs" data-testid="golden-result">
          <li className="flex items-center gap-2">
            <Badge tone={state.combineOk ? 'ok' : 'danger'}>
              {state.combineOk ? 'PASS' : 'FAIL'}
            </Badge>
            <span className="text-ink2">{t('evidence.golden.combine')}</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge tone={state.rootOk ? 'ok' : 'danger'}>
              {state.rootOk ? 'PASS' : 'FAIL'}
            </Badge>
            <span className="text-ink2">{t('evidence.golden.root', { count: GOLDEN_LEAVES.length })}</span>
          </li>
          <li className="flex items-center gap-2">
            <Badge tone={state.proofOk ? 'ok' : 'danger'}>
              {state.proofOk ? 'PASS' : 'FAIL'}
            </Badge>
            <span className="text-ink2">{t('evidence.golden.proof')}</span>
          </li>
          <li className="pt-1">
            <span className="mr-2 text-ink3">{t('evidence.reproof.computedRoot')}</span>
            <HashValue value={state.computedRoot} truncate={false} />
          </li>
        </ol>
      ) : null}
      {state.kind === 'error' ? (
        <p role="alert" className="mt-3 text-sm text-danger" data-testid="golden-error">
          {t('evidence.reproof.error')}: {state.message}
        </p>
      ) : null}
    </div>
  );
}

type CanonicalState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'done'; readonly ok: boolean; readonly computed: string }
  | { readonly kind: 'error'; readonly message: string };

/** contentHash 浏览器重算：粘贴 JSON + 期望 64-hex，本地 RFC 8785 规范化 + SHA-256 比对。
 * 外部审计方无需服务端即可验证 ProofEnvelope contentHash（与 Merkle 包含证明构成双重独立验证）。 */
export function CanonicalHashVerifier(): ReactNode {
  const t = useT();
  const [payload, setPayload] = useState(JSON.stringify(GOLDEN_JCS_SELF_TEST.obj, null, 2));
  const [expected, setExpected] = useState<string>(GOLDEN_JCS_SELF_TEST.expectedHex);
  const [state, setState] = useState<CanonicalState>({ kind: 'idle' });

  const run = (selfTest: boolean): void => {
    setState({ kind: 'running' });
    const text = selfTest ? JSON.stringify(GOLDEN_JCS_SELF_TEST.obj) : payload;
    const target = selfTest ? GOLDEN_JCS_SELF_TEST.expectedHex : expected.trim().toLowerCase();
    void (async () => {
      const parsed: unknown = JSON.parse(text);
      const computed = await canonicalHash(parsed);
      return { ok: computed === target, computed };
    })()
      .then((r) => setState({ kind: 'done', ...r }))
      .catch((e: unknown) =>
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
  };

  return (
    <div className="mt-3 rounded border border-border bg-surface2/40 p-3" data-testid="canonical-verifier">
      <p className="mb-2 text-xs text-ink3">{t('evidence.canonical.lede')}</p>
      <textarea
        className="mb-2 w-full rounded border border-border bg-surface px-2 py-1.5 font-mono text-xs text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        rows={6}
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
        aria-label={t('evidence.canonical.payloadLabel')}
        data-testid="canonical-payload"
      />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          className="w-full max-w-md rounded border border-border bg-surface px-2 py-1.5 font-mono text-xs text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none sm:w-auto sm:flex-1"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          aria-label={t('evidence.canonical.expectedLabel')}
          data-testid="canonical-expected"
        />
        <Button size="sm" onClick={() => run(false)} disabled={state.kind === 'running'} data-testid="canonical-run">
          {t('evidence.canonical.run')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => run(true)}
          disabled={state.kind === 'running'}
          data-testid="canonical-selftest"
        >
          {t('evidence.canonical.selfTest')}
        </Button>
      </div>
      {state.kind === 'done' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="canonical-result">
          {state.ok ? (
            <Badge tone="ok">{t('evidence.reproof.match')}</Badge>
          ) : (
            <Badge tone="danger">{t('evidence.reproof.mismatch')}</Badge>
          )}
          <HashValue value={state.computed} truncate={false} />
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <p role="alert" className="mt-2 text-sm text-danger" data-testid="canonical-error">
          {t('evidence.reproof.error')}: {state.message}
        </p>
      ) : null}
    </div>
  );
}
