import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  Eye,
  Repeat,
  FlaskConical,
  Fingerprint,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  Hash,
  ScrollText,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { AssuranceDimensionCard } from '@/components/v2/AssuranceDimensionCard';
import {
  ReceiptUploader,
  type VerificationResult,
} from '@/components/v2/ReceiptUploader';

// ---------- Types ----------

interface DemoReceipt {
  receiptId: string;
  claimText: string;
  verdictLabel: string;
  isFixtureOnly: boolean;
  manifestMembers: { kind: string; digest: string; sizeBytes: number }[];
}

interface ReceiptListItem {
  receiptId: string;
  claimText: string;
  verdictLabel: string;
  createdAt: string;
}

interface ReceiptListResponse {
  receipts: ReceiptListItem[];
  total: number;
  limit: number;
  offset: number;
}

// ---------- Dimension meta (for demo section) ----------

const DIMENSION_META: Record<string, { icon: typeof ShieldCheck; label: string; color: string }> = {
  provenance: { icon: Fingerprint, label: 'Provenance', color: 'text-blue-400' },
  integrity: { icon: ShieldCheck, label: 'Integrity', color: 'text-green-400' },
  identity: { icon: Eye, label: 'Identity', color: 'text-purple-400' },
  processConformance: { icon: Repeat, label: 'Process Conformance', color: 'text-cyan-400' },
  executionReproduction: { icon: Hash, label: 'Execution Reproduction', color: 'text-orange-400' },
  scientificVerdict: { icon: FlaskConical, label: 'Scientific Verdict', color: 'text-yellow-400' },
};

const OUTCOME_META: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  PASS: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', label: 'PASS' },
  FAIL: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'FAIL' },
  WARN: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', label: 'WARN' },
  SKIP: { icon: MinusCircle, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/30', label: 'SKIP' },
  NOT_APPLICABLE: { icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-500/5 border-gray-500/20', label: 'N/A' },
};

// ---------- Query helpers ----------

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

const RECEIPT_LIST_KEY = ['v2', 'receipts', 'list'] as const;

async function fetchReceiptList(limit: number, offset: number): Promise<ReceiptListResponse> {
  const url = `${API_BASE_URL}/api/v2/receipts?limit=${limit}&offset=${offset}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }
  return (await response.json()) as ReceiptListResponse;
}

// ---------- Page ----------

const PAGE_SIZE = 20;

export function V2ReceiptPage() {
  const queryClient = useQueryClient();

  // --- Demo section state ---
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DemoReceipt | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  // --- Upload result state ---
  const [uploadResult, setUploadResult] = useState<VerificationResult | null>(null);

  // --- Receipt list pagination state ---
  const [listPage, setListPage] = useState(0);

  const fetchDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/receipts/demo`);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const data = (await response.json()) as { receipt: DemoReceipt; verification: VerificationResult };
      setReceipt(data.receipt);
      setVerification(data.verification);
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : 'Failed to fetch V2 receipt demo');
    } finally {
      setDemoLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDemo();
  }, [fetchDemo]);

  // --- Receipt list query ---
  const listOffset = listPage * PAGE_SIZE;
  const listQuery = useQuery<ReceiptListResponse, Error>({
    queryKey: [...RECEIPT_LIST_KEY, listOffset],
    queryFn: () => fetchReceiptList(PAGE_SIZE, listOffset),
  });

  // --- Verify mutation (used by ReceiptUploader) ---
  const verifyMutation = useMutation<VerificationResult, Error, void>({
    mutationFn: async () => {
      // This is handled by ReceiptUploader's internal fetch; mutation is unused here
      throw new Error('Use ReceiptUploader directly');
    },
  });

  // --- Upload verified callback ---
  const handleVerified = useCallback(
    (result: VerificationResult) => {
      setUploadResult(result);
      // Invalidate receipt list so it reflects the new receipt
      void queryClient.invalidateQueries({ queryKey: RECEIPT_LIST_KEY });
    },
    [queryClient],
  );

  // --- Full page loading (demo only) ---
  if (demoLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // --- Demo error (non-blocking: show error but still render upload/list) ---
  const demoSection = demoError !== null ? (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-400">
          <ShieldAlert className="w-5 h-5" />
          V2 Receipt Demo Unavailable
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{demoError}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Start the API server with <code className="px-1 py-0.5 bg-muted rounded">pnpm api</code> then refresh.
        </p>
      </CardContent>
    </Card>
  ) : (
    <>
      {/* Receipt Info */}
      {receipt !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Receipt (Demo)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Receipt ID</span>
                <p className="font-mono">{receipt.receiptId}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Verdict</span>
                <p>
                  <Badge variant="outline">{receipt.verdictLabel}</Badge>
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Claim</span>
                <p className="text-sm">{receipt.claimText}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Manifest Members</span>
                <p className="font-mono text-sm">{receipt.manifestMembers.length}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Standing</span>
                <p>
                  <Badge variant={receipt.isFixtureOnly ? 'secondary' : 'default'}>
                    {receipt.isFixtureOnly ? 'Fixture Only' : 'Real Data'}
                  </Badge>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Six Dimensions (demo) */}
      {verification !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Six Assurance Dimensions (Demo)
            </CardTitle>
            <CardDescription>
              Each dimension is evaluated independently. Evaluated at{' '}
              <span className="font-mono text-xs">{verification.evaluatedAt}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {['provenance', 'integrity', 'identity', 'processConformance', 'executionReproduction', 'scientificVerdict'].map((dimKey) => {
              const dim = verification.dimensions[dimKey];
              if (dim === undefined) return null;
              const meta = DIMENSION_META[dimKey];
              const outcomeMeta = OUTCOME_META[dim.outcome] ?? OUTCOME_META.SKIP;
              const Icon = meta?.icon ?? ShieldCheck;
              const OutcomeIcon = outcomeMeta.icon;

              return (
                <div
                  key={dimKey}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 transition-colors',
                    outcomeMeta.bg,
                  )}
                >
                  <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', meta?.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{meta?.label ?? dimKey}</span>
                      <Badge variant="outline" className={cn('text-xs gap-1', outcomeMeta.color)}>
                        <OutcomeIcon className="w-3 h-3" />
                        {outcomeMeta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{dim.detail}</p>
                    {dim.reasonCodes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {dim.reasonCodes.map((code) => (
                          <Badge key={code} variant="destructive" className="text-xs font-mono">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );

  // --- Upload verification result ---
  const uploadResultSection = uploadResult !== null && (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          Verification Result
        </CardTitle>
        <CardDescription>
          Receipt {uploadResult.receiptId} — evaluated at{' '}
          <span className="font-mono text-xs">{uploadResult.evaluatedAt}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Result ID</span>
            <p className="font-mono text-xs break-all">{uploadResult.resultId}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Receipt Standing</span>
            <Badge variant="outline">{uploadResult.receiptStanding}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Review Summary</span>
            <Badge variant="outline">{uploadResult.reviewSummary}</Badge>
          </div>
          <div>
            <span className="text-muted-foreground">Policy</span>
            <p className="font-mono text-xs break-all">{uploadResult.verificationPolicyId}</p>
          </div>
        </div>
      </CardContent>
      <CardContent className="space-y-3">
        {Object.entries(uploadResult.dimensions).map(([dimKey, dim]) => (
          <AssuranceDimensionCard
            key={dimKey}
            dimension={dim.dimension}
            outcome={dim.outcome}
            detail={dim.detail}
            reasonCodes={dim.reasonCodes}
          />
        ))}
      </CardContent>
    </Card>
  );

  // --- Receipt list ---
  const totalPages = listQuery.data !== undefined
    ? Math.max(1, Math.ceil(listQuery.data.total / PAGE_SIZE))
    : 1;

  const receiptListSection = (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Stored Receipts</CardTitle>
        <CardDescription>
          Paginated list of verified receipts.
          {listQuery.data !== undefined && (
            <span className="ml-2 text-xs">
              ({listQuery.data.total} total)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {listQuery.isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {listQuery.isError && (
          <div className="flex items-center gap-2 text-sm text-red-400 py-4">
            <AlertTriangle className="w-4 h-4" />
            <span>Failed to load receipt list: {listQuery.error.message}</span>
          </div>
        )}

        {listQuery.isSuccess && (
          <>
            {listQuery.data.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No receipts stored yet. Upload an envelope above to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt ID</TableHead>
                    <TableHead>Claim</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.receipts.map((item) => (
                    <TableRow key={item.receiptId}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {item.receiptId}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {item.claimText}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.verdictLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {item.createdAt}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={listPage <= 0}
                onClick={() => setListPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {listPage + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={listPage >= totalPages - 1}
                onClick={() => setListPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  // --- Verify mutation unused (kept for pattern; actual verify is in ReceiptUploader) ---
  void verifyMutation;

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ScrollText className="w-8 h-8 text-primary" />
          V2 Receipt Verification
        </h1>
        <p className="text-muted-foreground">
          Six independent assurance dimensions — never collapses to a single &quot;verified&quot; badge.
        </p>
      </div>

      {/* Demo Section */}
      {demoSection}

      {/* Upload Section */}
      <ReceiptUploader onVerified={handleVerified} />

      {/* Upload Verification Result */}
      {uploadResultSection}

      {/* Receipt List */}
      {receiptListSection}

      {/* Honesty Boundary */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-yellow-400">Honesty Boundary</p>
              <p className="text-xs text-muted-foreground">
                This verification confirms protocol and integrity conformance only.
                It does <strong>NOT</strong> certify scientific truth, author innocence, or fraud absence.
                The scientificVerdict dimension reflects protocol consistency, not independent scientific validation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Summary (demo only) */}
      {verification !== null && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Review Summary: <Badge variant="outline">{verification.reviewSummary}</Badge></span>
          <span>Policy: <span className="font-mono text-xs">{verification.verificationPolicyId}</span></span>
        </div>
      )}
    </div>
  );
}

export default V2ReceiptPage;
