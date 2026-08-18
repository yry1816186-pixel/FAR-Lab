// tests/evidence_log/paragraph_locator.test.ts
// EVID-PARAGRAPH-001：段落指纹/版式鲁棒重定位/许可 fail-closed/篡改检出/
// claim 关系挂接。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  attachClaimRelation,
  buildParagraphEvidence,
  extractParagraphs,
  locateParagraph,
  normalizeParagraphText,
  paragraphFingerprint,
  relocateParagraph,
  verifyParagraphEvidence,
} from '../../src/evidence/paragraph_locator.ts';

const FULLTEXT = [
  'We analyze the correlation between exoplanet radius and insolation.',
  '',
  'Data were drawn from the survey of 2011 participants across twelve sites.',
  'The recruitment pipeline favored volunteers with prior astronomy coursework.',
  '',
  'Results show the reported association is inflated by selection effects.',
].join('\n');

test('EVID-PARAGRAPH-001: 规范化吸收版式差异——换行/弯引号/断字接回不改指纹', () => {
  const flat = 'The recruitment pipeline favored volunteers with prior astronomy coursework.';
  const reflowed = 'The  recruitment\n\tpipeline favored\nvolunteers with prior astronomy coursework.';
  assert.equal(normalizeParagraphText(flat), normalizeParagraphText(reflowed));
  assert.equal(paragraphFingerprint(normalizeParagraphText(flat)), paragraphFingerprint(normalizeParagraphText(reflowed)));
  // PDF 断字 + 弯引号
  assert.equal(
    normalizeParagraphText('interpre-\ntation of the "effect"'),
    'interpretation of the "effect"',
  );
  assert.notEqual(
    paragraphFingerprint(normalizeParagraphText('effect is real')),
    paragraphFingerprint(normalizeParagraphText('effect is not real')),
  );
});

test('EVID-PARAGRAPH-001: 切段序号确定性 + locator 构造（指纹主锚/span 次锚）+ 越界拒绝', () => {
  const paragraphs = extractParagraphs(FULLTEXT);
  assert.equal(paragraphs.length, 3);
  assert.equal(paragraphs[0]?.index, 0);
  assert.ok(paragraphs[1]?.normalized.startsWith('Data were drawn'));
  const locator = locateParagraph(FULLTEXT, 'doc-abc', 2);
  assert.equal(locator.paragraphIndex, 2);
  assert.equal(locator.documentId, 'doc-abc');
  assert.equal(locator.normalizedTextHash.length, 64);
  assert.ok(locator.charEnd > locator.charStart, 'span 次锚在场');
  // 同全文同段 → 同 locator（确定性）
  assert.deepEqual(locateParagraph(FULLTEXT, 'doc-abc', 2), locator);
  assert.throws(() => locateParagraph(FULLTEXT, 'doc-abc', 99), /out of range/);
});

test('EVID-PARAGRAPH-001: 许可门——非 licensed-fulltext 一律 NO_FULLTEXT_LICENSE fail-closed', () => {
  const denied = buildParagraphEvidence({ fulltext: FULLTEXT, documentId: 'doc-1', paragraphIndex: 0, license: 'no-license-metadata-only' });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.status, 'NO_FULLTEXT_LICENSE');
    assert.match(denied.reason, /downgrade to metadata-level evidence/);
  }
  const unknown = buildParagraphEvidence({ fulltext: FULLTEXT, documentId: 'doc-1', paragraphIndex: 0, license: 'unknown' });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.status, 'NO_FULLTEXT_LICENSE');
  const ok = buildParagraphEvidence({ fulltext: FULLTEXT, documentId: 'doc-1', paragraphIndex: 0, license: 'licensed-fulltext' });
  assert.equal(ok.ok, true);
});

test('EVID-PARAGRAPH-001: 证据链完整性——段文本被改 → 指纹不符检出；claim 关系不可变挂接', () => {
  const built = buildParagraphEvidence({ fulltext: FULLTEXT, documentId: 'doc-1', paragraphIndex: 2, license: 'licensed-fulltext' });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const withClaim = attachClaimRelation(built.record, 'claim-7', 'supports');
  assert.deepEqual(withClaim.claimRelations, [{ claimId: 'claim-7', relation: 'supports' }]);
  assert.equal(built.record.claimRelations.length, 0, '挂接不可变——原记录不带关系');
  const multi = attachClaimRelation(attachClaimRelation(withClaim, 'claim-8', 'context'), 'claim-9', 'refutes');
  assert.equal(multi.claimRelations.length, 3);

  // 篡改：段文本改一个词 → 重算指纹与 locator 声明不符
  const tampered = { ...multi, paragraphText: multi.paragraphText.replace('inflated', 'eliminated') };
  const integrity = verifyParagraphEvidence(tampered);
  assert.equal(integrity.ok, false);
  assert.match(integrity.reason, /paragraph hash mismatch/);
  assert.equal(verifyParagraphEvidence(multi).ok, true);
});

test('EVID-PARAGRAPH-001: 版本变化重定位——重排 SAME_HASH / 内容漂移 DRIFTED / 删除 NOT_FOUND', () => {
  const built = buildParagraphEvidence({ fulltext: FULLTEXT, documentId: 'doc-1', paragraphIndex: 1, license: 'licensed-fulltext' });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  // 版本 2：同样的段落内容、不同版式（加标题行/重排空行）→ SAME_HASH
  const v2 = ['Header: Survey Analysis v2', '', 'Data were drawn from the survey of 2011 participants across twelve sites.', 'The recruitment pipeline favored volunteers with prior astronomy coursework.', '', 'Results show the reported association is inflated by selection effects.'].join('\n');
  const same = relocateParagraph(built.record, v2);
  assert.equal(same.status, 'FOUND_SAME_HASH');
  assert.equal(same.newLocator?.paragraphIndex, 1, '重排后段序号更新');
  assert.equal(same.hashDrift, null);

  // 版本 3：段落内容被修订（corrigendum）→ DRIFTED + 新旧 hash 显式对照
  const v3 = FULLTEXT.replace('across twelve sites', 'across fourteen sites');
  const drifted = relocateParagraph(built.record, v3);
  assert.equal(drifted.status, 'FOUND_DRIFTED');
  assert.notEqual(drifted.hashDrift?.newHash, drifted.hashDrift?.oldHash);
  assert.equal(drifted.hashDrift?.oldHash, built.record.locator.normalizedTextHash);

  // 版本 4：该段整体被删除替换为无关内容 → NOT_FOUND（宁缺毋错）
  const v4 = FULLTEXT.replace(/Data were drawn[\s\S]*?coursework\./, 'Completely different methodology section.');
  const gone = relocateParagraph(built.record, v4);
  assert.equal(gone.status, 'NOT_FOUND');
  assert.equal(gone.newLocator, null);
  assert.ok(gone.bestSimilarity < 0.7);
});
