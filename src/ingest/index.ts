/**
 * MULTIMODAL ingest lane — public surface (stable for HCI + pipeline callers).
 * SDM contract, per-format parsers, dataset profiling, and the service facade.
 */
export * from './sdm.js';
export { parseXml, findAll, findFirst, childrenNamed, textOf, attrAny, serializeXml } from './xml.js';
export type { XmlElement, XmlText, XmlNode, XmlParseResult } from './xml.js';
export { parseJats } from './parsers/jats.js';
export { parseTei } from './parsers/tei.js';
export { parseLatexml } from './parsers/latexml.js';
export { parseMarkdown } from './parsers/markdown.js';
export { parseLatex } from './parsers/latex.js';
export { PdfTextPayload, PdfTextPage, PdfTextItem, buildSdmFromPdfText } from './parsers/pdftext.js';
export { DatasetProfileDoc, ColumnProfile, ColumnType, profileDataset, parseDelimited } from './dataset.js';
export { detectCodeLanguage, scanPython, scanJsTs, buildSdmFromCode } from './code.js';
export type { CodeSymbol, CodeLanguage } from './code.js';
export { buildSdmFromNotebook } from './notebook.js';
export { validateSdmPayload, ingestSdm, ingestPdfTextPayload, persistSdm, projectSeedText, SEED_TEXT_MAX } from './service.js';
export type { IngestOutcome } from './service.js';
