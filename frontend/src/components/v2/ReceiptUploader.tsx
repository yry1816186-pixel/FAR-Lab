import { useState, useRef, useCallback } from 'react';
import { Upload, FileJson, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ---------- Types ----------

export interface AssuranceDimensionResult {
  dimension: string;
  outcome: 'PASS' | 'FAIL' | 'WARN' | 'SKIP' | 'NOT_APPLICABLE';
  reasonCodes: string[];
  detail: string;
}

export interface VerificationResult {
  resultVersion: number;
  resultId: string;
  receiptId: string;
  verificationPolicyId: string;
  evaluatedAt: string;
  dimensions: Record<string, AssuranceDimensionResult>;
  receiptStanding: string;
  preservationStatus: string;
  reviewSummary: string;
}

interface ReceiptUploaderProps {
  onVerified: (result: VerificationResult) => void;
}

// ---------- Component ----------

export function ReceiptUploader({ onVerified }: ReceiptUploaderProps) {
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE_URL =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

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
        setError('Failed to read file');
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleVerify = useCallback(async () => {
    const trimmed = jsonText.trim();
    if (trimmed.length === 0) {
      setError('Paste or upload an envelope JSON first.');
      return;
    }

    // Validate JSON syntax before sending
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setError('Invalid JSON — please check syntax.');
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      setError('JSON must be an object (envelope).');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/receipts/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: trimmed,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`API returned ${response.status}: ${body}`);
      }
      const result = (await response.json()) as VerificationResult;
      onVerified(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification request failed');
    } finally {
      setLoading(false);
    }
  }, [jsonText, onVerified, API_BASE_URL]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Envelope
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
            Choose .json file
          </Button>
          <span className="text-xs text-muted-foreground">
            or paste JSON below
          </span>
        </div>

        {/* Textarea */}
        <textarea
          className="w-full rounded-md border bg-muted/50 p-3 text-sm font-mono resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder='Paste envelope JSON here…'
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
              Verifying…
            </>
          ) : (
            'Verify Envelope'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default ReceiptUploader;
