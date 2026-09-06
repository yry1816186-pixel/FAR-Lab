import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing --${name} value`);
  return args[index + 1];
};
const root = path.resolve(option('out', 'artifacts/sjtu-125'));
const zipPath = path.resolve(option('zip', path.join(os.homedir(), 'Desktop', 'FAR-Lab_SJTU_125_Results.zip')));
const partial = args.includes('--partial');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const csvCell = (value) => {
  let text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
const filesUnder = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const filename = path.join(directory, entry.name);
  if (entry.isSymbolicLink()) throw new Error(`Symbolic link cannot enter delivery: ${filename}`);
  return entry.isDirectory() ? filesUnder(filename) : [filename];
}).sort();
const assertNoSecrets = (filename) => {
  const bytes = fs.readFileSync(filename);
  const pattern = /sk-[A-Za-z0-9_.-]{16,}/;
  if (pattern.test(bytes.toString('latin1')) || pattern.test(bytes.toString('utf16le'))) {
    throw new Error(`Credential-shaped content found; packaging stopped: ${filename}`);
  }
};
const integrity = (database) => {
  const result = database.prepare('PRAGMA integrity_check').all();
  if (result.length !== 1 || Object.values(result[0])[0] !== 'ok') throw new Error('SQLite integrity_check failed');
};
const assertStopped = (database, records) => {
  const active = database.prepare("SELECT id FROM runs WHERE status IN ('running', 'queued') OR EXISTS (SELECT 1 FROM json_each(runs.doc, '$.stages') WHERE json_extract(value, '$.state') = 'running')").all();
  if (active.length || Object.values(records).some((record) => ['running', 'queued'].includes(record.status))) {
    throw new Error('Batch still has active runs. Stop or finish it before packaging, including --partial.');
  }
};
const fingerprint = (database) => digest(JSON.stringify(database.prepare('SELECT id, status, updated_at, doc FROM runs ORDER BY id').all()));

async function main() {
  const questions = readJson(path.join(root, 'source', 'questions.json'));
  if (!Array.isArray(questions) || questions.length !== 125 || questions.some((q, i) => q.id !== i + 1) || new Set(questions.map((q) => q.title)).size !== 125) {
    throw new Error('Source question coverage must be exactly 125 unique questions with IDs 1..125');
  }
  if (fs.existsSync(zipPath)) throw new Error(`Archive already exists; choose another --zip path: ${zipPath}`);
  const recordsBytes = fs.readFileSync(path.join(root, 'runs.json'));
  const records = JSON.parse(recordsBytes);
  if (Object.keys(records).some((id) => !/^\d+$/.test(id) || Number(id) < 1 || Number(id) > 125)) throw new Error('runs.json contains unexpected question IDs');
  const runIds = Object.values(records).map((record) => record.runId).filter(Boolean);
  if (new Set(runIds).size !== runIds.length) throw new Error('Different questions reference the same run');
  const sourceDb = new DatabaseSync(path.join(root, 'runtime', 'far.db'), { readOnly: true });
  let initialFingerprint;
  let delivery;
  try {
    assertStopped(sourceDb, records);
    integrity(sourceDb);
    initialFingerprint = fingerprint(sourceDb);
    const deliveryParent = path.join(root, 'delivery');
    fs.mkdirSync(deliveryParent, { recursive: true });
    delivery = fs.mkdtempSync(path.join(deliveryParent, 'FAR-Lab_SJTU_125_Results-'));
    fs.mkdirSync(path.join(delivery, 'runtime'));
    await backup(sourceDb, path.join(delivery, 'runtime', 'far.db'));
    for (const name of ['source', 'results']) {
      if (fs.existsSync(path.join(root, name))) fs.cpSync(path.join(root, name), path.join(delivery, name), { recursive: true, dereference: false });
    }
    fs.cpSync(path.join(root, 'runtime', 'artifacts'), path.join(delivery, 'runtime', 'artifacts'), { recursive: true, dereference: false });
    for (const name of ['configuration.json', 'preflight.json', 'runs.json', 'progress.json']) {
      if (fs.existsSync(path.join(root, name))) fs.copyFileSync(path.join(root, name), path.join(delivery, name));
    }
    fs.mkdirSync(path.join(delivery, 'scripts'));
    for (const name of ['extract-sjtu-questions.py', 'sjtu-batch.mjs', 'package-sjtu-results.mjs']) {
      fs.copyFileSync(path.resolve('scripts', name), path.join(delivery, 'scripts', name));
    }
    for (const name of ['package.json', 'package-lock.json', 'pnpm-lock.yaml']) {
      if (fs.existsSync(name)) fs.copyFileSync(name, path.join(delivery, name));
    }
    assertStopped(sourceDb, readJson(path.join(root, 'runs.json')));
    if (initialFingerprint !== fingerprint(sourceDb) || !recordsBytes.equals(fs.readFileSync(path.join(root, 'runs.json')))) {
      throw new Error('Source batch changed while copying. Delivery is unverified; rerun after all writers stop.');
    }
  } finally {
    sourceDb.close();
  }

  const { createApp } = await import('../dist/app/composition.js');
  const { verifyBundle } = await import('../dist/app/verify.js');
  const app = await createApp({ dataDir: path.join(delivery, 'runtime') });
  const results = [];
  try {
    for (const question of questions) {
      const record = records[String(question.id)];
      const result = {
        id: question.id, title: question.title, category: question.category, pages: question.pages,
        runId: record?.runId ?? null, runStatus: 'missing', bundleVerdict: 'unverified',
        deliveryStatus: 'MISSING', scientificStatus: 'UNVERIFIED', errors: [],
      };
      const dir = path.join(delivery, 'results', String(question.id).padStart(3, '0'));
      fs.mkdirSync(dir, { recursive: true });
      try {
        const run = record?.runId ? app.store.getRun(record.runId) : null;
        if (!run) throw new Error('No persisted run for this question');
        result.runStatus = run.status;
        result.stages = run.stages;
        const storedQuestion = app.store.getObject('question', run.questionId);
        if (storedQuestion?.text !== question.title) throw new Error('Persisted question does not match source title');
        if (record.status !== run.status) result.errors.push(`runs.json status ${record.status} differs from database ${run.status}`);
        const receipts = app.store.listObjects('receipt', run.id);
        const modelReceipts = receipts.filter((r) => r.modelCall);
        const sources = app.store.listObjects('source_document', run.id);
        const hypotheses = app.store.listObjects('hypothesis', run.id);
        result.receiptCount = receipts.length;
        result.modelCalls = modelReceipts.length;
        result.modelIds = [...new Set(modelReceipts.map((r) => r.modelCall.modelId))];
        result.executionModes = [...new Set(receipts.map((r) => r.executionMode))];
        result.totalTokens = modelReceipts.reduce((sum, r) => sum + (r.modelCall.usage.totalTokens ?? 0), 0);
        result.sourceCount = sources.length;
        result.claimCount = app.store.listObjects('claim', run.id).length;
        result.hypothesisCount = hypotheses.length;
        result.hypotheses = hypotheses.map((h) => ({ id: h.id, statement: h.statement, noveltyLabel: h.noveltyLabel }));
        result.sources = sources.map((s) => ({ id: s.id, title: s.title, identifiers: s.identifiers, url: s.oaUrl, year: s.publicationYear, contentDepth: s.contentDepth }));
        result.executionStage = run.stages.find((s) => s.stage === 'execute') ?? null;
        if (!modelReceipts.length || modelReceipts.some((r) => r.executionMode !== 'live' || r.modelCall.modelId !== 'qwen3.7-max')) {
          result.errors.push('Expected live qwen3.7-max model receipts for every recorded model call');
        }
        const bundles = app.store.listObjects('bundle', run.id);
        const bundle = bundles.at(-1);
        if (!bundle) throw new Error('No reproducibility bundle');
        const verification = await verifyBundle(bundle.id, { store: app.store, artifacts: app.artifacts });
        result.bundleId = bundle.id;
        result.bundleVerdict = verification.verdict;
        result.failedChecks = verification.failedChecks;
        result.vacuousChecks = verification.vacuousChecks ?? [];
        writeJson(path.join(dir, 'verification.json'), verification);
        if (verification.verdict !== 'verified') result.errors.push(`Bundle verdict: ${verification.verdict}; ${verification.failedChecks.join(', ')}`);
        const manifestFile = path.join(dir, 'MANIFEST.json');
        if (!fs.existsSync(manifestFile)) result.errors.push('Per-question export manifest missing');
        else {
          const manifest = readJson(manifestFile);
          if (manifest.runId !== run.id || manifest.bundleId !== bundle.id) result.errors.push('Export manifest belongs to another run or bundle');
          for (const [relative, expected] of Object.entries(manifest.files)) {
            const filename = path.resolve(dir, relative);
            if (!filename.startsWith(`${dir}${path.sep}`)) throw new Error('Unsafe export manifest path');
            if (!fs.existsSync(filename) || digest(fs.readFileSync(filename)) !== expected.sha256) result.errors.push(`Export hash mismatch: ${relative}`);
          }
        }
        for (const name of ['report.md', 'bundle.json', 'run.json', 'receipts.json']) {
          if (!fs.existsSync(path.join(dir, name))) result.errors.push(`Required export missing: ${name}`);
        }
        if (run.status !== 'completed') result.errors.push(`Run is ${run.status}: ${run.lastError ?? record.error ?? ''}`);
        if (!record.exported) result.errors.push('Batch did not record a completed export');
        result.deliveryStatus = result.errors.length ? 'INCOMPLETE' : 'VERIFIED_ARTIFACTS';
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
        result.deliveryStatus = result.runStatus === 'missing' ? 'MISSING' : 'INCOMPLETE';
      }
      writeJson(path.join(dir, 'delivery-status.json'), result);
      results.push(result);
      if (results.length % 25 === 0) console.log(JSON.stringify({ verifiedQuestions: results.length, total: 125 }));
    }
  } finally {
    app.close();
  }
  const snapshotDb = new DatabaseSync(path.join(delivery, 'runtime', 'far.db'));
  try { integrity(snapshotDb); snapshotDb.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } finally { snapshotDb.close(); }
  const completed = results.filter((r) => r.runStatus === 'completed').length;
  const verified = results.filter((r) => r.deliveryStatus === 'VERIFIED_ARTIFACTS').length;
  const summary = {
    generatedAt: new Date().toISOString(), status: verified === 125 ? 'ALL_ARTIFACTS_VERIFIED' : 'PARTIAL_UNVERIFIED',
    expectedQuestions: 125, listedQuestions: results.length, completedRuns: completed, verifiedArtifacts: verified,
    missingOrUnverifiedQuestionIds: results.filter((r) => r.deliveryStatus !== 'VERIFIED_ARTIFACTS').map((r) => r.id),
    scientificStatus: 'UNVERIFIED', databaseIntegrity: 'ok', model: 'qwen3.7-max', partialMode: partial,
    modelCalls: results.reduce((n, r) => n + (r.modelCalls ?? 0), 0),
    totalTokens: results.reduce((n, r) => n + (r.totalTokens ?? 0), 0),
    limitations: [
      '工件核验通过表示引用、回执、哈希和对象关系通过项目的确定性检查，不表示科学问题已解决。',
      '模型输出属于探索性研究建议；结论、创新性、实验有效性和外部来源陈述仍需独立审查。',
      '每题只运行一轮自治研究。实验执行状态逐题保留；跳过、外部或人工协议不能视为已开展实验。',
      '来源手册发表于 2021 年；完整页上下文包含相邻题目，题号由提取脚本分配。',
      '源工作区已有未提交变更；commit 不能独自还原运行代码。脚本和依赖清单附带，完整项目环境需另行提供。',
      '排除 superseded-context-attempt；此包只汇总当前 runs.json 映射的最终尝试。',
    ],
  };
  writeJson(path.join(delivery, 'SUMMARY.json'), summary);
  writeJson(path.join(delivery, 'RESULTS.json'), results);
  const columns = ['id', 'title', 'category', 'pages', 'runId', 'runStatus', 'bundleVerdict', 'deliveryStatus', 'scientificStatus', 'sourceCount', 'claimCount', 'hypothesisCount', 'modelCalls', 'totalTokens', 'errors'];
  fs.writeFileSync(path.join(delivery, 'RESULTS.csv'), `\uFEFF${columns.join(',')}\r\n${results.map((r) => columns.map((c) => csvCell(r[c])).join(',')).join('\r\n')}\r\n`);
  const statusText = verified === 125 ? '125 题工件已通过核验，科学结论仍待独立验证' : `部分交付：${verified}/125 题工件通过核验`;
  fs.writeFileSync(path.join(delivery, 'README.zh-CN.md'), `# FAR-Lab · SJTU 125 个科学问题\n\n${statusText}。\n\n模型：qwen3.7-max。流水线完成 ${completed}/125 题。\n\n入口：index.html；汇总：RESULTS.json、RESULTS.csv、SUMMARY.json。逐题文件在 results/001 至 results/125，含原始报告、研究提纲、引用、回执和 verification.json（存在可核验 bundle 时）。\n\n${summary.limitations.map((s) => `- ${s}`).join('\n')}\n\n数据库 runtime/far.db 是停止后通过 SQLite backup API 创建的一致性快照，并已执行 integrity_check；runtime/artifacts 保存内容寻址工件。source 保存原始 PDF、125 题清单、页文本和提取审计。\n\nSHA256SUMS.txt 覆盖所有交付文件，但不包含清单自身。ZIP 生成后逐条解压读取并核对全部文件 SHA-256；ZIP 外的 .sha256 记录归档整体摘要。\n\n重跑命令（在完整 FAR-Lab 项目根目录，需现有 Node 24+ 和构建产物）：\n\n\`node scripts/package-sjtu-results.mjs --out artifacts/sjtu-125\`\n\n只有确有未完成题且需要交付实际产物时追加 \`--partial\`；此选项不会放宽运行中数据库、损坏数据库或密钥扫描限制。\n`);
  const rows = results.map((r) => {
    const prefix = `results/${String(r.id).padStart(3, '0')}`;
    const links = ['report.md', 'paper.md', 'verification.json', 'delivery-status.json'].filter((name) => fs.existsSync(path.join(delivery, prefix, name))).map((name) => `<a href="${prefix}/${name}">${({ 'report.md': '报告', 'paper.md': '研究提纲', 'verification.json': '核验', 'delivery-status.json': '状态' })[name]}</a>`).join(' · ');
    return `<tr><td>${r.id}</td><td>${escapeHtml(r.title)}<small>${escapeHtml(r.category)} · PDF ${r.pages.join(', ')}</small></td><td>${escapeHtml(r.runStatus)}<small>${escapeHtml(r.bundleVerdict)}</small></td><td>${r.sourceCount ?? 0} / ${r.hypothesisCount ?? 0}</td><td>${links}${r.errors.length ? `<small class="error">${escapeHtml(r.errors.join('; '))}</small>` : ''}</td></tr>`;
  }).join('\n');
  fs.writeFileSync(path.join(delivery, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FAR-Lab · SJTU 125 个科学问题</title><style>body{font:15px/1.6 system-ui,sans-serif;margin:24px;color:#202522;background:#fff}main{max-width:1300px;margin:auto}h1{font-size:26px}p{max-width:980px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #d4d9d6;overflow-wrap:anywhere}th{background:#eef4ef}small{display:block;color:#59635c}a{color:#066a73}.error{color:#a42836}nav{margin:20px 0}th:nth-child(1){width:35px}th:nth-child(2){width:40%}th:nth-child(3){width:100px}th:nth-child(4){width:75px}@media(max-width:700px){body{margin:12px}table{table-layout:auto;font-size:13px}th,td{padding:7px}th:nth-child(n){width:auto}h1{font-size:22px}}</style><main><h1>FAR-Lab · SJTU 125 个科学问题</h1><p>${escapeHtml(statusText)}。模型 qwen3.7-max；流水线完成 ${completed}/125 题。</p><p>以下结果属于探索性研究产物。工件核验并不证明科学结论成立；实验跳过、外部协议和待人工验证均保留在原始记录中。</p><nav><a href="README.zh-CN.md">交付说明</a> · <a href="RESULTS.csv">CSV 汇总</a> · <a href="RESULTS.json">JSON 汇总</a> · <a href="source/sjtu-booklet.pdf">来源手册</a> · <a href="SHA256SUMS.txt">SHA-256 清单</a></nav><table><thead><tr><th>题号</th><th>科学问题</th><th>运行 / 核验</th><th>来源 / 假设</th><th>产物</th></tr></thead><tbody>${rows}</tbody></table></main></html>`);
  if (verified !== 125 && !partial) throw new Error(`Only ${verified}/125 questions verified. Review ${delivery}; use --partial to package actual incomplete results.`);
  const entries = filesUnder(delivery).map((filename) => {
    assertNoSecrets(filename);
    return { name: path.relative(delivery, filename).split(path.sep).join('/'), sha256: digest(fs.readFileSync(filename)) };
  });
  fs.writeFileSync(path.join(delivery, 'SHA256SUMS.txt'), `${entries.map((e) => `${e.sha256}  ${e.name}`).join('\n')}\n`);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  const script = `
$ErrorActionPreference = 'Stop'
Compress-Archive -LiteralPath $env:FARLAB_PACKAGE_DIR -DestinationPath $env:FARLAB_PACKAGE_ZIP -CompressionLevel Optimal
$archive = [System.IO.Compression.ZipFile]::OpenRead($env:FARLAB_PACKAGE_ZIP)
try {
  $prefix = [System.IO.Path]::GetFileName($env:FARLAB_PACKAGE_DIR) + '/'
  $manifest = @{}
  Get-Content -LiteralPath (Join-Path $env:FARLAB_PACKAGE_DIR 'SHA256SUMS.txt') -Encoding utf8 | ForEach-Object {
    if ($_ -notmatch '^([0-9a-f]{64})  (.+)$') { throw 'Invalid manifest line' }
    $manifest[$Matches[2]] = $Matches[1]
  }
  $manifest['SHA256SUMS.txt'] = (Get-FileHash -LiteralPath (Join-Path $env:FARLAB_PACKAGE_DIR 'SHA256SUMS.txt') -Algorithm SHA256).Hash.ToLowerInvariant()
  $seen = @{}
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\\', '/')
    if ($name.EndsWith('/')) { continue }
    if (!$name.StartsWith($prefix)) { throw 'Unexpected archive root' }
    $relative = $name.Substring($prefix.Length)
    if (!$manifest.ContainsKey($relative) -or $seen.ContainsKey($relative)) { throw ('Unexpected/duplicate ZIP entry: ' + $relative) }
    $stream = $entry.Open()
    try { $actual = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() } finally { $stream.Dispose() }
    if ($actual -ne $manifest[$relative]) { throw ('ZIP hash mismatch: ' + $relative) }
    $seen[$relative] = $true
  }
  if ($seen.Count -ne $manifest.Count) { throw 'ZIP file coverage mismatch' }
  Write-Output ('ZIP_VERIFIED_FILES=' + $seen.Count)
} finally { $archive.Dispose() }
`;
  const output = execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 600000,
    env: { ...process.env, FARLAB_PACKAGE_DIR: delivery, FARLAB_PACKAGE_ZIP: zipPath },
  });
  if (!output.includes(`ZIP_VERIFIED_FILES=${entries.length + 1}`)) throw new Error('ZIP verification receipt missing');
  const archiveHash = digest(fs.readFileSync(zipPath));
  fs.writeFileSync(`${zipPath}.sha256`, `${archiveHash}  ${path.basename(zipPath)}\n`);
  console.log(JSON.stringify({ ...summary, deliveryDirectory: delivery, archive: zipPath, archiveSha256: archiveHash, archiveVerifiedFiles: entries.length + 1, secretScan: 'passed' }, null, 2));
  if (verified !== 125) process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
