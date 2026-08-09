import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileJson, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVerifyEnvelope } from '@/lib/api_client';
import { useT } from '@/lib/i18n';
import type { V2VerificationResult } from '@/lib/types';

// ---------- Types ----------

/**
 * 向后兼容别名:V2ReceiptPage 仍 `import { type VerificationResult }`。
 * SSOT 是 types.ts 的 V2VerificationResult。
 */
export type VerificationResult = V2VerificationResult;

interface ReceiptUploaderProps {
  readonly onVerified: (result: V2VerificationResult) => void;
}

// ---------- Component ----------

export function ReceiptUploader({ onVerified }: ReceiptUploaderProps) {
  const t = useT();
  const [jsonText, setJsonText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 卸载守卫:mutation promise resolve 时若已卸载,跳过 onVerified(setState-on-unmounted)。
  // fetchJson 内置 60s 超时,无需额外 AbortController;卸载守卫防延迟回调污染已卸载组件。
  const mountedRef = useRef(true);
  const verifyEnvelope = useVerifyEnvelope();

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    },
    [],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file === undefined) return;
      setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        setJsonText(text);
      };
      reader.onerror = () => {
        setError(t('receiptUploader.errorReadFile'));
      };
      reader.readAsText(file);
    },
    [t],
  );

  const handleVerify = useCallback(async () => {
    const trimmed = jsonText.trim();
    if (trimmed.length === 0) {
      setError(t('receiptUploader.errorEmpty'));
      return;
    }

    // Validate JSON syntax before sending
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setError(t('receiptUploader.errorInvalidJson'));
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      setError(t('receiptUploader.errorNotObject'));
      return;
    }

    setError(null);
    try {
      // 走统一 fetchJson(60s 超时 + ApiError 解析)+ parseV2Response 边界解码
      // (R-06 · counter-case 2/3):{ ok: true, data: T } 信封校验 + zod 运行时 parse。
      // zod parse 已保证 data.verification 存在且结构正确;下方防御性检查为 defense-in-depth。
      const data = await verifyEnvelope.mutateAsync(trimmed);
      // defense-in-depth:zod parse 理论上已拦截,但保留防御以应对极端契约漂移。
      if (data.verification === undefined) {
        throw new Error('Verification response missing `verification` field');
      }
      if (mountedRef.current) {
        onVerified(data.verification);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : t('receiptUploader.errorRequestFailed'));
      }
    }
  }, [jsonText, onVerified, verifyEnvelope, t]);

  const loading = verifyEnvelope.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="w-5 h-5" />
          {t('receiptUploader.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File picker */}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileJson className="w-4 h-4" />
            {t('receiptUploader.chooseFile')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('receiptUploader.orPaste')}
          </span>
        </div>

        {/* Textarea */}
        <textarea
          className="w-full rounded-md border bg-muted/50 p-3 text-sm font-mono resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder={t('receiptUploader.placeholder')}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={6}
        />

        {/* Error display */}
        {error !== null && (
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Verify button */}
        <Button onClick={handleVerify} disabled={loading || jsonText.trim().length === 0}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('receiptUploader.verifying')}
            </>
          ) : (
            t('receiptUploader.verify')
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default ReceiptUploader;
