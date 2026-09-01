import { expect, test } from '@playwright/test';

function textPdf(text: string): Buffer {
  const content = `BT\n/F1 14 Tf\n1 0 0 1 72 720 Tm\n(${text}) Tj\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'ascii');
}

test('optional dictation: missing local model is visible before ASR runtime loads', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (req) => { requests.push(new URL(req.url()).pathname); });
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported(): boolean { return true; }
      readonly mimeType = 'audio/webm;codecs=opus';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}
      start(): void {}
      stop(): void {
        this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    class FakeAudioContext {
      async decodeAudioData(_data: ArrayBuffer): Promise<{
        numberOfChannels: number;
        sampleRate: number;
        getChannelData: (_channel: number) => Float32Array;
      }> {
        return {
          numberOfChannels: 1,
          sampleRate: 16_000,
          getChannelData: () => new Float32Array([0, 0, 0, 0]),
        };
      }
      async close(): Promise<void> {}
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
    });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
  });

  await page.goto('/#lab/new');
  const dictate = page.getByRole('button', { name: '语音输入' });
  await dictate.click();
  await expect(page.getByRole('button', { name: '结束录音并转写' })).toBeVisible();
  await page.getByRole('button', { name: '结束录音并转写' }).click();
  await expect(page.locator('.nr-note')).toContainText('未找到本地语音模型', { timeout: 30_000 });

  expect(requests.some((pathname) => /\/assets\/asr-worker-.*\.js$/.test(pathname))).toBe(true);
  expect(requests).toContain('/models/whisper-base/config.json');
  expect(requests.filter((pathname) => /transformers\.web|\/models\/ort\/|\.wasm$/.test(pathname))).toEqual([]);
});

test('new-research input survives the initial empty-workspace transition', async ({ page }) => {
  let releaseRuns!: () => void;
  const runsGate = new Promise<void>((resolve) => { releaseRuns = resolve; });
  let holdFirstRunsRequest = true;
  await page.route('**/api/v1/runs', async (route) => {
    if (!holdFirstRunsRequest) { await route.continue(); return; }
    holdFirstRunsRequest = false;
    await runsGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: [] }),
    });
  });

  const question = page.getByRole('textbox', { name: '研究问题' });
  try {
    await page.goto('/#lab/new');
    await question.fill('Retain this question across first-use discovery');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'retained-seed.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Evidence selected before the initial runs request completed.'),
    });
  } finally {
    // Always unblock the intercepted request so a diagnostic failure cannot
    // strand the page fixture or the following suite teardown.
    releaseRuns();
  }

  // The empty response switches runsLoading -> fresh and used to remount the
  // whole composer, silently discarding both values.
  await expect(page.getByRole('heading', { name: '从一个问题开始' })).toBeVisible();
  await expect(question).toHaveValue('Retain this question across first-use discovery');
  await expect(page.locator('.seed-card.st-ready')).toContainText('retained-seed');
});

test('optional PDF: browser loads one modern runtime only when a real file is selected', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (req) => { requests.push(new URL(req.url()).pathname); });
  await page.goto('/#lab/new');
  // This spec also runs after core-journey in the Firefox/WebKit smoke job,
  // so the shared real server already has a study and the fresh-workspace-only
  // heading is intentionally hidden. The composer is the stable product
  // surface whose optional PDF loading contract is under test.
  await expect(page.locator('#nr-question')).toBeVisible();
  expect(requests.filter((pathname) => /\/assets\/(?:pdf|pdf\.worker\.min)-/.test(pathname))).toEqual([]);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'browser-pdf.pdf',
    mimeType: 'application/pdf',
    buffer: textPdf('Deterministic browser PDF evidence'),
  });
  await expect(page.locator('.seed-card.st-ready')).toContainText('browser-pdf', { timeout: 30_000 });

  const pdfRuntimeRequests = requests.filter((pathname) => /\/assets\/pdf-[^/]+\.js$/.test(pathname));
  const pdfWorkerRequests = requests.filter((pathname) => /\/assets\/pdf\.worker\.min-[^/]+\.mjs$/.test(pathname));
  expect(pdfRuntimeRequests).toHaveLength(1);
  // A sparse document can take the honest server-SDM -> client-parse fallback
  // and instantiate the same worker twice. The delivery invariant is one
  // emitted/runtime URL, not pretending the two parsing phases are one call.
  expect([...new Set(pdfWorkerRequests)]).toHaveLength(1);
  expect(requests.filter((pathname) => /pdf.*legacy/i.test(pathname))).toEqual([]);
});
