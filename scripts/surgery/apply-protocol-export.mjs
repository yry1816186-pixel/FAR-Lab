#!/usr/bin/env node
/**
 * Slice 4 anchored patch (2026-08-29): route the protocol chain into the export
 * plane. Six insert-only edits across five files, each guarded by its own
 * done-marker; anchors are byte-unique (fail-loud when missing or ambiguous).
 * Files are too large to rewrite whole over the GitHub API (export.ts ~46KB,
 * paper-outline.ts ~35KB, verify.ts ~20KB, package.ts ~15KB); the two small
 * edits (provenance.ts import + field) ride the same mechanism for uniformity.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const fail = (msg) => {
  console.error(`[surgery:protocol-export] ${msg}`);
  process.exit(1);
};

const countOf = (src, needle) => src.split(needle).length - 1;

const insertBefore = (src, anchor, block, label) => {
  if (countOf(src, anchor) !== 1) fail(`anchor for ${label} matched ${countOf(src, anchor)} times (need exactly 1)`);
  return src.replace(anchor, `${block}${anchor}`);
};

const insertAfter = (src, anchor, block, label) => {
  if (countOf(src, anchor) !== 1) fail(`anchor for ${label} matched ${countOf(src, anchor)} times (need exactly 1)`);
  return src.replace(anchor, `${anchor}${block}`);
};

const replaceOnce = (src, from, to, label) => {
  if (countOf(src, from) !== 1) fail(`replace anchor for ${label} matched ${countOf(src, from)} times (need exactly 1)`);
  return src.replace(from, to);
};

// ---------------------------------------------------------------------------
// 1. src/domain/provenance.ts — protocolEvidence field (+ id imports)
// ---------------------------------------------------------------------------
const PROV = 'src/domain/provenance.ts';
let prov = readFileSync(PROV, 'utf8');
if (prov.includes('protocolEvidence')) {
  console.log('[surgery:protocol-export] provenance.ts already carries protocolEvidence — nothing to do');
} else {
  prov = replaceOnce(
    prov,
    "import { BundleId, ReceiptId, RunId, ExperimentRunId, ResultSetId, StatReportId } from './ids.js';",
    "import { BundleId, ReceiptId, RunId, ExperimentRunId, ResultSetId, StatReportId, ProtocolId, ProtocolExecutionId } from './ids.js';",
    'provenance ids import',
  );
  prov = insertBefore(
    prov,
    '  /**\n   * Lane-07 scientific-communication artifacts:',
    [
      '  /**',
      '   * Protocol chain (slice 4, 2026-08-29): pre-registered research protocols and their',
      '   * human-attested execution ledgers as first-class bundle evidence — object ids plus',
      '   * content-addressed artifact hashes, with the ledger\'s honesty counts. Deviations and',
      '   * QC-failed measurements are ALSO projected into `limitations` verbatim; verify',
      '   * re-derives these counts from the store and fails on drift or missing disclosure.',
      '   * Absent on pre-protocol bundles (optional, like figures/tables).',
      '   */',
      '  protocolEvidence: z.array(z.object({',
      '    protocolId: ProtocolId,',
      '    /** Null when the protocol is registered but no execution ledger exists yet. */',
      '    executionId: ProtocolExecutionId.nullable(),',
      '    protocolArtifactHash: z.string().length(64),',
      '    ledgerArtifactHash: z.string().nullable(),',
      '    /** Ledger size at mint time — count-based re-export trigger and drift probe. */',
      '    recordCount: z.number().int().nonnegative(),',
      '    deviations: z.number().int().nonnegative(),',
      '    qcFailedMeasurements: z.number().int().nonnegative(),',
      '  })).optional(),',
      '',
    ].join('\n'),
    'protocolEvidence field',
  );
  writeFileSync(PROV, prov);
  console.log('[surgery:protocol-export] provenance.ts patched (+protocolEvidence, +id imports)');
}

// ---------------------------------------------------------------------------
// 2. src/app/verify.ts — check 15: protocol_evidence_resolvable
// ---------------------------------------------------------------------------
const VERIFY = 'src/app/verify.ts';
let ver = readFileSync(VERIFY, 'utf8');
if (ver.includes('protocol_evidence_resolvable')) {
  console.log('[surgery:protocol-export] verify.ts already carries the protocol check — nothing to do');
} else {
  ver = replaceOnce(ver, 'same 14 checks in the same order', 'same 15 checks in the same order', 'check-count comment');
  ver = insertAfter(
    ver,
    "  'figures_tables_refs_resolvable',",
    "  'protocol_evidence_resolvable',\n",
    'VERIFY_CHECK_NAMES entry',
  );
  ver = insertBefore(
    ver,
    '  }\n\n  const failed = checks.filter((c) => !c.passed);',
    [
      '',
      '    // ---- check 15 (slice-4 protocol chain): declared protocol evidence resolves ----',
      '    // Optional field: absent on pre-protocol bundles → pass with a note (same rule as',
      '    // paperOutlineRef/figures/tables — legacy bundles must not start failing on fields',
      '    // that did not exist when they were minted).',
      '    const protoEvidence = bundle.protocolEvidence ?? [];',
      '    const protoProblems: string[] = [];',
      '    for (const pe of protoEvidence) {',
      '      const proto = tryGetObject(store, \'protocol\', pe.protocolId);',
      '      if (!proto.ok) protoProblems.push(proto.msg);',
      '      if (pe.executionId !== null) {',
      "        const ledger = tryGetObject(store, 'protocol_execution', pe.executionId);",
      '        if (!ledger.ok) {',
      '          protoProblems.push(ledger.msg);',
      '        } else {',
      '          if (ledger.obj.protocolId !== pe.protocolId) {',
      '            protoProblems.push(`台账 ${pe.executionId} 属于协议 ${ledger.obj.protocolId}，bundle 声明的是 ${pe.protocolId}`);',
      '          }',
      '          if (ledger.obj.records.length !== pe.recordCount) {',
      '            protoProblems.push(`台账 ${pe.executionId} 现有 ${ledger.obj.records.length} 条记录，bundle 铸造时为 ${pe.recordCount} — store 已越过 bundle，需重导出`);',
      '          }',
      '          if (ledger.obj.deviations.length !== pe.deviations',
      '            || ledger.obj.measurements.filter((m) => !m.qcPassed).length !== pe.qcFailedMeasurements) {',
      '            protoProblems.push(`台账 ${pe.executionId} 的偏差/QC 计数与 bundle 声明不符 — 需重导出`);',
      '          }',
      '        }',
      '      }',
      '      const specProblem = await probeArtifact(artifacts, pe.protocolArtifactHash);',
      '      if (specProblem !== null) protoProblems.push(`协议 ${pe.protocolId} 工件：${specProblem}`);',
      '      if (pe.ledgerArtifactHash !== null) {',
      '        const ledgerProblem = await probeArtifact(artifacts, pe.ledgerArtifactHash);',
      '        if (ledgerProblem !== null) protoProblems.push(`台账 ${pe.executionId} 工件：${ledgerProblem}`);',
      '      }',
      '      // laundering guard (truth-klass pattern): deviations/QC failures MUST carry a',
      '      // limitations line naming the protocol id — evidence without disclosure is',
      '      // not exportable.',
      '      if ((pe.deviations > 0 || pe.qcFailedMeasurements > 0)',
      '        && !bundle.limitations.some((l) => l.includes(pe.protocolId))) {',
      '        protoProblems.push(`协议 ${pe.protocolId} 声明 ${pe.deviations} 项偏差/${pe.qcFailedMeasurements} 项 QC 失败，但 limitations 中没有点名该协议的披露行`);',
      '      }',
      '    }',
      '    checks.push({',
      "      name: 'protocol_evidence_resolvable',",
      '      passed: protoProblems.length === 0,',
      '      detail: protoEvidence.length === 0',
      '        ? \'（pre-protocol bundle：未声明 protocolEvidence — 检查空转通过）\'',
      '        : protoProblems.length === 0',
      '          ? `${protoEvidence.length} 条 protocolEvidence 全部解析：对象可读、归属/记录数/偏差/QC 计数一致、工件哈希核验通过、披露行在册`',
      '          : protoProblems.join(\'；\'),',
      '    });',
      '',
    ].join('\n'),
    'protocol check implementation',
  );
  writeFileSync(VERIFY, ver);
  console.log('[surgery:protocol-export] verify.ts patched (check 15: protocol_evidence_resolvable)');
}

// ---------------------------------------------------------------------------
// 3. src/pipeline/stages/export.ts — mint protocolEvidence + limitations + applicable
// ---------------------------------------------------------------------------
const EXPORT = 'src/pipeline/stages/export.ts';
let ex = readFileSync(EXPORT, 'utf8');
if (ex.includes('protocolEvidenceEntries')) {
  console.log('[surgery:protocol-export] export.ts already carries the protocol chain — nothing to do');
} else {
  ex = insertAfter(
    ex,
    "    const _statReports = ctx.store.listObjects('stat_report', run.id);",
    [
      '    // Slice-4 protocol chain: pre-registered protocols + human-attested ledgers ride the export.',
      "    const protocols = ctx.store.listObjects('protocol', run.id);",
      "    const protocolExecutions = ctx.store.listObjects('protocol_execution', run.id);",
      '',
    ].join('\n'),
    'export store reads',
  );
  ex = insertAfter(
    ex,
    '    if (sourceCount > latestBundle.sourceArtifactHashes.length) return true;',
    [
      '    // Slice-4 (count-based like the source rule): a protocol ledger that grew past',
      '    // what the latest bundle recorded, or a protocol registered after the bundle,',
      '    // forces re-export — the bundle must never omit ledger truth the store holds.',
      '    const coveredProtocols = new Map((latestBundle.protocolEvidence ?? []).map((e) => [e.protocolId, e]));',
      "    for (const p of ctx.store.listObjects('protocol', ctx.run.id)) {",
      '      const covered = coveredProtocols.get(p.id);',
      '      if (covered === undefined) return true;',
      "      const ex = ctx.store.listObjects('protocol_execution', ctx.run.id).find((e) => e.protocolId === p.id) ?? null;",
      '      const coveredRecords = covered.executionId !== null ? covered.recordCount : 0;',
      '      if ((ex?.records.length ?? 0) > coveredRecords) return true;',
      '    }',
      '',
    ].join('\n'),
    'applicable ledger trigger',
  );
  ex = insertBefore(
    ex,
    "    const bundleId = newId('bnd');",
    [
      '    // Slice-4 protocol evidence: content-address the frozen spec and the ledger; the',
      "    // ledger's honesty counts ride the bundle and its limitations line is verbatim-",
      '    // checkable (verify re-derives counts and requires the disclosure line).',
      '    const protocolEvidenceEntries: Array<{',
      '      protocolId: string;',
      '      executionId: string | null;',
      '      protocolArtifactHash: string;',
      '      ledgerArtifactHash: string | null;',
      '      recordCount: number;',
      '      deviations: number;',
      '      qcFailedMeasurements: number;',
      '    }> = [];',
      '    const protocolLimitationLines: string[] = [];',
      '    for (const p of protocols) {',
      '      const specPut = await ctx.artifacts.put(canonicalJson(p));',
      '      const ex = protocolExecutions.find((e) => e.protocolId === p.id) ?? null;',
      '      const ledgerPut = ex !== null ? await ctx.artifacts.put(canonicalJson(ex)) : null;',
      '      const deviations = ex !== null ? ex.deviations.length : 0;',
      '      const qcFailed = ex !== null ? ex.measurements.filter((m) => !m.qcPassed).length : 0;',
      '      protocolEvidenceEntries.push({',
      '        protocolId: p.id,',
      '        executionId: ex !== null ? ex.id : null,',
      '        protocolArtifactHash: specPut.hash,',
      '        ledgerArtifactHash: ledgerPut !== null ? ledgerPut.hash : null,',
      '        recordCount: ex !== null ? ex.records.length : 0,',
      '        deviations,',
      '        qcFailedMeasurements: qcFailed,',
      '      });',
      '      protocolLimitationLines.push(',
      '        `协议 ${p.id}（${p.paradigm}）：${ex !== null ? `台账 ${ex.id} 状态 ${ex.status}；` : \'台账未开始；\'}`',
      '          + `${deviations} 项偏差、${qcFailed} 项 QC 失败测量如实留存；物理环节复现需人工按采集表重做`,',
      '      );',
      '    }',
      '',
      '',
    ].join('\n'),
    'protocol evidence + limitations',
  );
  ex = insertAfter(
    ex,
    '      ...collectMissing(inputs, { lockMissing, receipts: allReceipts, templateHypCount, templatePlanCount }),',
    '      ...protocolLimitationLines,\n',
    'limitations spread',
  );
  ex = insertBefore(
    ex,
    '      // EEL evidence (D-081): experiment object ids + content-addressed artifact hashes.',
    '      ...(protocolEvidenceEntries.length > 0 ? { protocolEvidence: protocolEvidenceEntries } : {}),\n',
    'bundle protocolEvidence field',
  );
  writeFileSync(EXPORT, ex);
  console.log('[surgery:protocol-export] export.ts patched (reads + applicable + evidence + limitations + field)');
}

// ---------------------------------------------------------------------------
// 4. src/pipeline/paper-outline.ts — protocol_deviations limitation category
// ---------------------------------------------------------------------------
const PAPER = 'src/pipeline/paper-outline.ts';
let pp = readFileSync(PAPER, 'utf8');
if (pp.includes('protocol_deviations')) {
  console.log('[surgery:protocol-export] paper-outline.ts already carries the protocol category — nothing to do');
} else {
  pp = insertAfter(
    pp,
    "  const experimentSpecs = store.listObjects('experiment_spec', runId);",
    [
      '  // Slice-4 protocol chain: pre-registered protocols + their ledgers project into the',
      "  // paper's limitations — the physical-world legs must be visible in the scientific",
      '  // communication artifact, deviations and QC failures included.',
      "  const protocols = store.listObjects('protocol', runId);",
      "  const protocolExecutions = store.listObjects('protocol_execution', runId);",
    ].join('\n'),
    'paper store reads',
  );
  pp = insertBefore(
    pp,
    '  // ---- references: cited sources (top hypotheses\' claim grounding + counter-evidence',
    [
      '  {',
      '    // Slice-4: deviations/QC failures from the human-attested ledgers (only LEDGER',
      '    // entries count — declared plan risks are not protocol facts). Ledgers ship',
      '    // verbatim in the reproducibility bundle (protocolEvidence).',
      '    if (protocols.length > 0) {',
      '      const deviations = protocolExecutions.reduce((a, ex) => a + ex.deviations.length, 0);',
      '      const qcFailed = protocolExecutions.reduce((a, ex) => a + ex.measurements.filter((m) => !m.qcPassed).length, 0);',
      '      limitations.push({',
      "        category: 'protocol_deviations',",
      '        detail: `${protocols.length} pre-registered protocol(s) with ${protocolExecutions.length} human-attested ledger(s): ${deviations} recorded deviation(s) and ${qcFailed} QC-failed measurement(s). Physical-world execution is attested by named actors, not machine-verified; the ledgers and frozen specs ship verbatim in the reproducibility bundle.`,',
      '        counts: { protocols: protocols.length, ledgers: protocolExecutions.length, deviations, qcFailedMeasurements: qcFailed },',
      '      });',
      '    }',
      '  }',
      '',
    ].join('\n'),
    'protocol limitation block',
  );
  pp = replaceOnce(
    pp,
    'plan, experiment stat reports); ',
    'plan, experiment stat reports, protocols and their execution ledgers); ',
    'PROVENANCE_NOTE update',
  );
  writeFileSync(PAPER, pp);
  console.log('[surgery:protocol-export] paper-outline.ts patched (reads + protocol_deviations + note)');
}

// ---------------------------------------------------------------------------
// 5. src/report/package.ts — protocol spec + ledger files in the package
// ---------------------------------------------------------------------------
const PKG = 'src/report/package.ts';
let pkg = readFileSync(PKG, 'utf8');
if (pkg.includes("path: `protocol/${pe.protocolId}.json`")) {
  console.log('[surgery:protocol-export] package.ts already writes protocol files — nothing to do');
} else {
  pkg = insertBefore(
    pkg,
    '  // ---- pandoc conversion (best-effort, honestly reported) ----',
    [
      '  // ---- protocol chain (slice 4): frozen specs + human-attested ledgers on disk ----',
      '  for (const pe of bundle.protocolEvidence ?? []) {',
      "    const proto = deps.store.getObject('protocol', pe.protocolId);",
      '    if (proto === null) {',
      '      throw new Error(`bundle ${bundle.id} declares protocol ${pe.protocolId} but the store has no such object — re-export first; a package must project exactly the bundled evidence`);',
      '    }',
      '    const protoBytes = canonicalJson(proto);',
      "    if (sha256Hex(protoBytes) !== pe.protocolArtifactHash) {",
      '      throw new Error(`protocol ${pe.protocolId} bytes drifted from the bundle\'s declared artifact hash — re-export first`);',
      '    }',
      '    written.push({ path: `protocol/${pe.protocolId}.json`, content: Buffer.from(protoBytes, \'utf8\'), encodingFormat: \'application/json\', name: `Pre-registered research protocol (${proto.paradigm})`, crate: true });',
      '    if (pe.executionId !== null) {',
      "      const ledger = deps.store.getObject('protocol_execution', pe.executionId);",
      '      if (ledger === null) {',
      '        throw new Error(`bundle ${bundle.id} declares ledger ${pe.executionId} but the store has no such object — re-export first`);',
      '      }',
      '      const ledgerBytes = canonicalJson(ledger);',
      '      if (pe.ledgerArtifactHash !== null && sha256Hex(ledgerBytes) !== pe.ledgerArtifactHash) {',
      '        throw new Error(`ledger ${pe.executionId} bytes drifted from the bundle\'s declared artifact hash — re-export first`);',
      '      }',
      '      written.push({ path: `protocol/${pe.executionId}.ledger.json`, content: Buffer.from(ledgerBytes, \'utf8\'), encodingFormat: \'application/json\', name: `Human-attested execution ledger (${pe.deviations} deviations, ${pe.qcFailedMeasurements} QC-failed measurements)`, crate: true });',
      '    }',
      '  }',
      '',
      '',
    ].join('\n'),
    'package protocol files',
  );
  writeFileSync(PKG, pkg);
  console.log('[surgery:protocol-export] package.ts patched (protocol/ spec + ledger files)');
}

console.log('[surgery:protocol-export] all edits done');
