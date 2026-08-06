/**
 * IntegrityPage —— 证据链完整性信任根的交互式演示（Task #7 演示惊艳核心）。
 *
 * Authority: spec 09_repro_determinism.md §4（integrity root）+ 23_CI_AND_VALIDATION.md §5.2
 *            （tamper-evident trust root）+ 24_API_GATEWAY.md §5.3.
 *
 * 四大惊艳组件（全部基于后端已实现且测试全绿的 3 个 /integrity 端点 + 浏览器侧 Web Crypto）：
 *   1. HeroIntegrityRoot    — 整链折叠成单一 64-hex Merkle 根（GET /integrity/root）
 *   2. LiveReproofExplorer  — 选 seq → 拉包含证明 → 浏览器独立重算根比对（GET /integrity/proof/:seq）
 *      内嵌 Tamper Theatre — 翻转叶末位 hex → 重算根立即不符 → 篡改可观测（演示 tamper-evidence）
 *   3. CrossLangHashVerifier — 浏览器 Web Crypto 算 combine/root，与 Node+Python golden 字节比对
 *   4. ReproReceiptExporter — 渲染可下载的 Repro Receipt（GET /integrity/receipt·Blob 下载·复制）
 *   底部 HonestyStatement — 诚实声明已知边界 / 未完成项（Hero Honesty Wall）。
 *
 * 设计原则（诚实·非剧场）：
 *   - 所有 Merkle 重算在浏览器本地用 Web Crypto 完成，不向服务端发送证明数据。
 *   - golden 向量源自后端 GOLDEN_VECTORS 经 cross-lang 测试断言，非编造。
 *   - 诚实声明如实列出 verdict 重入未做 / canonical 数值域 N2b 鸿沟等真实 gap。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / innerHTML / 桩。useEffect 均带 cleanup。
 * 无障碍：可交互元素均有 aria-label；图标 aria-hidden。
 */

import { useEffect, useMemo, useState } from 'react';
import { useIntegrityRoot, useIntegrityProof, useReproReceipt } from '@/lib/api_client';
import {
  combineHashes,
  computeMerkleRoot,
  flipLastHexChar,
  verifyInclusionProof,
  type InclusionProof,
} from '@/lib/merkle';
import {
  GOLDEN_COMBINE_LEAF0_LEAF1,
  GOLDEN_LEAVES,
  GOLDEN_MERKLE_ROOT,
  GOLDEN_PROOF_LEAF0,
} from '@/lib/integrity-golden';
import type { IntegrityProofDto, IntegrityRootDto, ReproReceipt } from '@/lib/types';
import { useTimeout } from '@/lib/useTimeout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ShieldCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  FileKey2,
  Network,
  Languages,
  ScrollText,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const HEX64 = /^[0-9a-f]{64}$/;

// ---------- helpers ----------

function isValidHex64(value: string): boolean {
  return HEX64.test(value);
}

/**
 * 触发 JSON 文件下载（Blob + anchor.click·无服务端往返·无 innerHTML）。
 * revokeObjectURL 立即释放 Blob 引用，避免内存泄漏。
 */
function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** 复制文本到剪贴板；返回是否成功（jsdom 测试环境可能无 clipboard，故返回布尔）。 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------- 浏览器侧 Merkle 重算 hook ----------

type VerifyState =
  | { readonly status: 'idle' }
  | { readonly status: 'computing' }
  | { readonly status: 'verified'; readonly ok: boolean; readonly computedRoot: string }
  | { readonly status: 'error'; readonly message: string };

/**
 * 用浏览器 Web Crypto 独立重算包含证明根。
 *
 * leafOverride 非 null 时用其替代 proof.leaf（Tamper Theatre 注入篡改叶）。
 * 依赖 [proof, leafOverride]：proof 来自 TanStack Query 缓存（稳定引用），leafOverride 是 string|null。
 */
function useMerkleVerify(proof: InclusionProof | null, leafOverride: string | null): VerifyState {
  const [state, setState] = useState<VerifyState>({ status: 'idle' });

  useEffect(() => {
    if (proof === null) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    const effectiveLeaf = leafOverride ?? proof.leaf;
    setState({ status: 'computing' });
    verifyInclusionProof({ ...proof, leaf: effectiveLeaf })
      .then((result) => {
        if (!cancelled) {
          setState({
            status: 'verified',
            ok: result.ok,
            computedRoot: result.computedRoot,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [proof, leafOverride]);

  return state;
}

/**
 * 浏览器侧实时算 combine(left, right)（CrossLangHashVerifier 用）。
 * 输入非 64-hex 时不计算（避免无谓错误），combined 置 null。
 */
function useCombinedHash(left: string, right: string): {
  readonly combined: string | null;
  readonly error: string | null;
} {
  const [combined, setCombined] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isValidHex64(left) || !isValidHex64(right)) {
      setCombined(null);
      setError(null);
      return;
    }
    combineHashes(left, right)
      .then((h) => {
        if (!cancelled) {
          setCombined(h);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [left, right]);

  return { combined, error };
}

/**
 * 浏览器从 9 个 Python golden 叶独立重建整链 Merkle 根 + 验证 golden 包含证明。
 *
 * 这是 CrossLang 一致性的最强证据：浏览器用 Web Crypto 从原始叶集合完整重建整链根，
 * 与后端 Node + Python 字节相等断言的 GOLDEN_MERKLE_ROOT 比对，并独立验证一个 golden 证明。
 * 组件 mount 即算（无依赖·只算一次）。
 */
function useWholeChainRecompute(): {
  readonly root: string | null;
  readonly rootMatches: boolean | null;
  readonly proofOk: boolean | null;
  readonly error: string | null;
} {
  const [state, setState] = useState<{
    root: string | null;
    rootMatches: boolean | null;
    proofOk: boolean | null;
    error: string | null;
  }>({ root: null, rootMatches: null, proofOk: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const leaves = GOLDEN_LEAVES.map((leaf) => leaf.expectedHex);
    Promise.all([computeMerkleRoot(leaves), verifyInclusionProof(GOLDEN_PROOF_LEAF0)])
      .then(([root, verify]) => {
        if (!cancelled) {
          setState({
            root,
            rootMatches: root === GOLDEN_MERKLE_ROOT,
            proofOk: verify.ok,
            error: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            root: null,
            rootMatches: null,
            proofOk: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// ---------- 共享展示组件 ----------

/** 单行哈希展示：font-mono + break-all + 复制按钮。 */
function HashRow({
  label,
  value,
  testId,
  mono = true,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
  readonly mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const schedule = useTimeout();
  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      schedule(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="space-y-1" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          data-testid={`${testId}-copy`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <code
        className={cn(
          'block break-all rounded bg-muted px-3 py-2 text-xs',
          mono && 'font-mono',
        )}
      >
        {value}
      </code>
    </div>
  );
}

// ---------- 1. HeroIntegrityRoot ----------

function HeroIntegrityRoot() {
  const { data, isLoading, isError, error } = useIntegrityRoot();

  return (
    <Card data-testid="hero-root">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">Whole-chain integrity root</CardTitle>
        </div>
        <CardDescription>
          The entire evidence chain (all call_records) is folded into a single 64-hex Merkle root — a portable "whole-chain fingerprint".
          An external auditor holding this root can verify chain integrity without downloading every record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground" data-testid="hero-loading">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Computing the whole-chain Merkle root…
          </div>
        )}
        {isError && !isLoading && (
          <Alert variant="destructive" data-testid="hero-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to fetch integrity root</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}
        {data !== undefined && (
          <RootFacts data={data} />
        )}
      </CardContent>
    </Card>
  );
}

function RootFacts({ data }: { readonly data: IntegrityRootDto }) {
  return (
    <div className="space-y-4" data-testid="hero-facts">
      <HashRow label="Merkle Root (whole-chain trust root)" value={data.merkleRoot} testId="merkle-root" />
      <div className="grid grid-cols-3 gap-3">
        <FactCell label="Leaves (call_records)" value={String(data.leafCount)} testId="leaf-count" />
        <FactCell
          label="Chain head seq"
          value={data.chainHeadSeq === null ? '—' : String(data.chainHeadSeq)}
          testId="chain-head-seq"
        />
        <FactCell
          label="Chain head hash"
          value={data.chainHeadHash === null ? '—' : `${data.chainHeadHash.slice(0, 10)}…`}
          testId="chain-head-hash"
          full
        />
      </div>
    </div>
  );
}

function FactCell({
  label,
  value,
  testId,
  full = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
  readonly full?: boolean;
}) {
  return (
    <div className={cn('rounded border bg-muted/40 px-3 py-2', full && 'col-span-3')} data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <code className="font-mono text-sm font-semibold">{value}</code>
    </div>
  );
}

// ---------- 2. LiveReproofExplorer + Tamper Theatre ----------

function LiveReproofExplorer() {
  const [seqInput, setSeqInput] = useState('1');
  const [committedSeq, setCommittedSeq] = useState(1);

  const { data: proof, isLoading, isError, error } = useIntegrityProof(committedSeq);

  const handleCommit = () => {
    const parsed = Number.parseInt(seqInput, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      setCommittedSeq(parsed);
    }
  };

  return (
    <Card data-testid="live-reproof">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">Live reproof explorer</CardTitle>
        </div>
        <CardDescription>
          Pick an evidence entry (by seq) → fetch its Merkle inclusion proof →{' '}
          <strong className="text-foreground">recompute the root independently in the browser with Web Crypto</strong>
          and compare it against the expected root. An auditor can cryptographically verify "evidence X is really in the chain" without downloading every record.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="seq-input" className="text-xs font-medium text-muted-foreground">
              Evidence seq
            </label>
            <input
              id="seq-input"
              type="number"
              min={1}
              value={seqInput}
              onChange={(e) => setSeqInput(e.target.value)}
              className="h-10 w-32 rounded-md border bg-background px-3 font-mono text-sm"
              aria-label="Evidence seq input"
              data-testid="seq-input"
            />
          </div>
          <Button onClick={handleCommit} data-testid="seq-commit" aria-label="Fetch the inclusion proof for this seq">
            Fetch inclusion proof
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground" data-testid="proof-loading">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Fetching the inclusion proof for seq={committedSeq}…
          </div>
        )}
        {isError && !isLoading && (
          <Alert variant="destructive" data-testid="proof-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to fetch proof</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Unknown error (seq may exceed the chain length)'}
            </AlertDescription>
          </Alert>
        )}
        {proof !== undefined && <ProofVerification proofDto={proof} />}
      </CardContent>
    </Card>
  );
}

function ProofVerification({ proofDto }: { readonly proofDto: IntegrityProofDto }) {
  const [tampered, setTampered] = useState(false);

  const proof: InclusionProof = useMemo(
    () => ({
      leafIndex: proofDto.leafIndex,
      leaf: proofDto.leaf,
      siblings: proofDto.siblings,
      expectedRoot: proofDto.expectedRoot,
    }),
    [proofDto],
  );

  // 篡改时翻转叶末位 hex（保持 64-hex 合法·仅改一字节）→ 重算根应与期望根不符
  const tamperedLeaf = tampered ? flipLastHexChar(proofDto.leaf) : null;
  const verifyState = useMerkleVerify(proof, tamperedLeaf);

  // 重算根与整链 merkleRoot（proofDto.expectedRoot）比对，覆盖 Tamper 场景的 ok 语义：
  // 未篡改→ok=true；篡改→ok=false（演示 tamper-evidence：单字节改动即破坏整链根）
  const showTamperResult = tampered && verifyState.status === 'verified' && !verifyState.ok;

  return (
    <div className="space-y-4" data-testid="proof-detail">
      {/* 审计路径可视化 */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">
          Audit path (siblings · {proofDto.siblings.length} levels from leaf to root)
        </div>
        <ol className="space-y-1" data-testid="siblings-list">
          {proofDto.siblings.map((sibling, idx) => (
            <li key={`${idx}-${sibling}`} className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="shrink-0">
                L{idx}
              </Badge>
              <code className="break-all font-mono text-muted-foreground">{sibling}</code>
            </li>
          ))}
        </ol>
      </div>

      <HashRow
        label={`Leaf hash (seq=${proofDto.seq} · leafIndex=${proofDto.leafIndex})`}
        value={tampered && tamperedLeaf !== null ? tamperedLeaf : proofDto.leaf}
        testId="proof-leaf"
      />

      {/* 验证结果 */}
      <div
        className={cn(
          'rounded-md border p-4',
          verifyState.status === 'verified' && verifyState.ok && 'border-emerald-500 bg-emerald-500/5',
          verifyState.status === 'verified' && !verifyState.ok && 'border-destructive bg-destructive/5',
        )}
        data-testid="verify-result"
      >
        {verifyState.status === 'computing' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Browser recomputing root…
          </div>
        )}
        {verifyState.status === 'verified' && verifyState.ok && (
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="space-y-1">
              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                ✓ Inclusion proof verified
              </div>
              <div className="text-xs text-muted-foreground">
                Browser-recomputed root === expected root. Evidence seq={proofDto.seq} is indeed in this chain.
              </div>
            </div>
          </div>
        )}
        {verifyState.status === 'verified' && !verifyState.ok && (
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="space-y-1">
              <div className="font-semibold text-destructive">✗ Root mismatch</div>
              <div className="text-xs text-muted-foreground" data-testid="computed-root">
                Recomputed root:
                <code className="ml-1 break-all font-mono">{verifyState.computedRoot}</code>
              </div>
              {showTamperResult && (
                <Badge variant="destructive" data-testid="tamper-detected">
                  Tamper detected: the leaf's last hex char was changed by one byte; the whole-chain root fails immediately
                </Badge>
              )}
            </div>
          </div>
        )}
        {verifyState.status === 'error' && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">Recompute error: {verifyState.message}</span>
          </div>
        )}
      </div>

      {/* Tamper Theatre 控制 */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 p-3">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">
          Tamper theatre: simulates an attacker altering this evidence's hash (flips the last hex char).
        </span>
        {!tampered ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setTampered(true)}
            data-testid="tamper-btn"
            aria-label="Tamper this evidence's leaf hash"
          >
            Tamper this evidence
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTampered(false)}
            data-testid="restore-btn"
            aria-label="Restore the evidence's original hash"
          >
            Restore original
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- 3. CrossLangHashVerifier ----------

function CrossLangHashVerifier() {
  const [left, setLeft] = useState(GOLDEN_LEAVES[0]?.expectedHex ?? '');
  const [right, setRight] = useState(GOLDEN_LEAVES[1]?.expectedHex ?? '');
  const { combined, error } = useCombinedHash(left, right);

  // 浏览器算出的 combine 与 Node/Python golden 是否字节相等
  const isGoldenPair =
    left === (GOLDEN_LEAVES[0]?.expectedHex ?? '') &&
    right === (GOLDEN_LEAVES[1]?.expectedHex ?? '');
  const matchesGolden = isGoldenPair && combined === GOLDEN_COMBINE_LEAF0_LEAF1;

  const loadGolden = () => {
    setLeft(GOLDEN_LEAVES[0]?.expectedHex ?? '');
    setRight(GOLDEN_LEAVES[1]?.expectedHex ?? '');
  };

  return (
    <Card data-testid="cross-lang-verifier">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">Cross-language hash verifier</CardTitle>
        </div>
        <CardDescription>
          Enter two 64-hex nodes →{' '}
          <strong className="text-foreground">compute combine in real time with browser Web Crypto</strong>{' '}
          = sha256(left + right). Compared against the Node + Python golden, this proves all three produce byte-identical hashes —
          the visual evidence of FAR-Lab's cross-language determinism.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="left-input" className="text-xs font-medium text-muted-foreground">
              left (64-hex)
            </label>
            <input
              id="left-input"
              type="text"
              value={left}
              onChange={(e) => setLeft(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 font-mono text-xs"
              aria-label="left node hash input"
              data-testid="left-input"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="right-input" className="text-xs font-medium text-muted-foreground">
              right (64-hex)
            </label>
            <input
              id="right-input"
              type="text"
              value={right}
              onChange={(e) => setRight(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 font-mono text-xs"
              aria-label="right node hash input"
              data-testid="right-input"
            />
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={loadGolden} data-testid="load-golden">
          Load Python golden leaf pair
        </Button>

        {error !== null && (
          <Alert variant="destructive" data-testid="combine-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {combined !== null && (
          <div className="space-y-3" data-testid="combine-result">
            <HashRow
              label="Browser combine(left, right) = sha256(utf8(left + right))"
              value={combined}
              testId="combined-hash"
            />
            {isGoldenPair && (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-md border p-3',
                  matchesGolden ? 'border-emerald-500 bg-emerald-500/5' : 'border-destructive bg-destructive/5',
                )}
                data-testid="golden-compare"
              >
                {matchesGolden ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                )}
                <div className="text-sm">
                  {matchesGolden ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      ✓ Byte-equal to the Node + Python golden (cross-language consistency confirmed)
                    </span>
                  ) : (
                    <span className="font-semibold text-destructive">
                      ✗ Does not match the golden (browser / Node / Python disagree)
                    </span>
                  )}
                  <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    golden: {GOLDEN_COMBINE_LEAF0_LEAF1}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <WholeChainRecompute />
      </CardContent>
    </Card>
  );
}

/** 浏览器从 9 个 golden 叶独立重建整链根 + 验证 golden 包含证明（CrossLang 最强证据）。 */
function WholeChainRecompute() {
  const { root, rootMatches, proofOk, error } = useWholeChainRecompute();
  return (
    <div
      className="space-y-3 rounded-md border border-dashed bg-muted/20 p-4"
      data-testid="whole-chain-recompute"
    >
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold">
          Browser independently rebuilds the whole-chain root from 9 Python golden leaves
        </span>
      </div>
      {error !== null && (
        <div className="text-xs text-destructive" data-testid="recompute-error">
          Recompute error: {error}
        </div>
      )}
      {root !== null && (
        <>
          <HashRow
            label="Browser-recomputed whole-chain root (computeMerkleRoot)"
            value={root}
            testId="recomputed-root"
          />
          <div className="flex flex-wrap items-center gap-2">
            {rootMatches === true && (
              <Badge variant="success" data-testid="root-matches-golden">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Whole-chain root === Node/Python golden
              </Badge>
            )}
            {rootMatches === false && (
              <Badge variant="destructive" data-testid="root-mismatch">
                <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Whole-chain root does not match golden
              </Badge>
            )}
            {proofOk === true && (
              <Badge variant="success" data-testid="golden-proof-ok">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Golden inclusion proof verified
              </Badge>
            )}
            {proofOk === false && (
              <Badge variant="destructive" data-testid="golden-proof-fail">
                Golden proof verification failed
              </Badge>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 4. ReproReceiptExporter ----------

function ReproReceiptExporter() {
  const { data, isLoading, isError, error } = useReproReceipt();
  const [copied, setCopied] = useState(false);
  const schedule = useTimeout();

  const handleDownload = () => {
    if (data === undefined) return;
    downloadJson(`far-chain-repro-receipt.json`, data);
  };
  const handleCopy = async () => {
    if (data === undefined) return;
    const ok = await copyToClipboard(JSON.stringify(data, null, 2));
    if (ok) {
      setCopied(true);
      schedule(() => setCopied(false), 1500);
    }
  };

  return (
    <Card data-testid="receipt-exporter">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileKey2 className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-xl">Repro Receipt exporter</CardTitle>
        </div>
        <CardDescription>
          A portable snapshot of the whole-chain trust root (schemaVersion locks the contract evolution). Pin it into a paper appendix / CI artifact —
          a holder can recompute the root to verify "this run's evidence chain was not tampered with · and matches the one I hold".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground" data-testid="receipt-loading">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Generating Repro Receipt…
          </div>
        )}
        {isError && !isLoading && (
          <Alert variant="destructive" data-testid="receipt-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to generate Receipt</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Unknown error'}</AlertDescription>
          </Alert>
        )}
        {data !== undefined && (
          <div className="space-y-4" data-testid="receipt-detail">
            <ReceiptBody data={data} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownload} data-testid="receipt-download" aria-label="Download Repro Receipt JSON">
                <Download className="h-4 w-4" aria-hidden="true" />
                Download JSON
              </Button>
              <Button variant="outline" onClick={handleCopy} data-testid="receipt-copy" aria-label="Copy Receipt JSON">
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy JSON'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReceiptBody({ data }: { readonly data: ReproReceipt }) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">schemaVersion {String(data.schemaVersion)}</Badge>
        <Badge variant="outline">{data.leafCount} leaves</Badge>
      </div>
      <HashRow label="merkleRoot" value={data.merkleRoot} testId="receipt-merkle-root" />
      <div className="grid grid-cols-2 gap-3">
        <FactCell
          label="chainHeadSeq"
          value={data.chainHeadSeq === null ? '—' : String(data.chainHeadSeq)}
          testId="receipt-head-seq"
        />
        <FactCell
          label="gitCommitSha"
          value={data.gitCommitSha === null ? '—' : `${data.gitCommitSha.slice(0, 12)}…`}
          testId="receipt-git-sha"
        />
      </div>
      <FactCell label="generatedAt (server timestamp)" value={data.generatedAt} testId="receipt-generated-at" full />
    </div>
  );
}

// ---------- 底部诚实声明（Hero Honesty Wall） ----------

interface HonestyStatement {
  readonly title: string;
  readonly detail: string;
}

const HONESTY_STATEMENTS: readonly HonestyStatement[] = [
  {
    title: 'Verdict prompt-level soft injection implemented; kernel-level hard trigger still V2',
    detail:
      'IC-15 T1\' (2026-07-27): stage6_feedback buildFeedbackMessages now accepts an optional priorVerdictKind and injects it as soft advice via sanitizeExternalContent. The deterministic verdict kernel is NOT moved into the FSM loop — that remains a V2 roadmap item (fsm_runner.ts:10-14). REFUTED does NOT auto-trigger hypothesis regeneration (p-hacking prevention). Use the Versions page (/versions) for side-by-side verdict comparison.',
  },
  {
    title: 'Merkle leaves cover only call_records',
    detail:
      'The integrity root is folded from call_records.current_hash; the evidence_log verdict anchor rows are not counted as Merkle leaves (verdicts are derived computations that reuse the existing chain without extending it).',
  },
  {
    title: 'Known gaps remain in the cross-language numeric domain',
    detail:
      'This page\'s CrossLang demo covers SHA-256 byte-equality of Merkle combine; however, the N2b exponent zero-padding difference in the canonical-hash numeric domain (TS "1e-7" vs Py "1e-07") remains a known cross-language gap and is a target of the V3 RFC 8785 JCS migration.',
  },
  {
    title: 'All recomputation is local to the browser',
    detail:
      'All Merkle recomputation for Live Reproof / CrossLang is done locally in the browser via Web Crypto (crypto.subtle.digest); no proof data is sent to the server. The Repro Receipt generatedAt is a server timestamp; cross-timezone auditing relies on merkleRoot + gitCommitSha.',
  },
];

function HonestyWall() {
  return (
    <Card data-testid="honesty-wall">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <CardTitle className="text-xl">Honesty statement · known boundaries</CardTitle>
        </div>
        <CardDescription>
          All cryptographic primitives on this page are real and usable, but the following boundaries are noted honestly — no exaggeration, no concealment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {HONESTY_STATEMENTS.map((stmt) => (
            <li key={stmt.title} className="flex items-start gap-3 rounded-md border bg-muted/20 p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold">{stmt.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{stmt.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------- 页面主体 ----------

export default function IntegrityPage() {
  return (
    <div className="space-y-6" data-testid="integrity-page">
      <header>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-3xl font-bold tracking-tight">Integrity trust root</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          Integrity · a cryptographic demo of evidence-chain tamper-detection — Merkle root · live reproof · tamper theatre · cross-language hashing · Repro Receipt
        </p>
      </header>

      <HeroIntegrityRoot />
      <LiveReproofExplorer />
      <CrossLangHashVerifier />
      <ReproReceiptExporter />
      <HonestyWall />
    </div>
  );
}
