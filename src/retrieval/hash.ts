/**
 * retrieval/hash — deterministic content hashing for retrieved documents.
 *
 * `documentId` is the program-generated trust anchor: it is a deterministic
 * function of (source, persistent identifier, content). An LLM cannot mint a
 * valid documentId — it can only cite one that resolves to a real retrieval
 * record. This is what makes the later citation resolver (§K1 Phase 3) able to
 * reject fabricated citations deterministically.
 */
import { createHash } from 'node:crypto';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type { DocumentSource } from './types.ts';

/** sha256 hex of a raw string payload (the exact bytes/strings received). */
export function rawSha256Hex(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Normalized-content hash: sha256 over the canonical-JSON projection of the
 * document fields (excludes volatile `retrievedAt`/`retrievalQuery` so the same
 * document fetched twice hashes identically — tamper-detectable, not
 * timestamp-sensitive). Two different documents must not collide; two fetches
 * of the same document must match.
 */
export function normalizedDocumentHash(fields: {
  sourceType: DocumentSource;
  persistentIdentifier: string;
  doi: string | null;
  title: string;
  authors: readonly string[];
  publicationDate: string | null;
  abstract: string | null;
  canonicalUrl: string;
  licenseMetadata: string | null;
}): string {
  return hashCanonicalJson({
    sourceType: fields.sourceType,
    persistentIdentifier: fields.persistentIdentifier,
    doi: fields.doi,
    title: fields.title,
    authors: [...fields.authors],
    publicationDate: fields.publicationDate,
    abstract: fields.abstract,
    canonicalUrl: fields.canonicalUrl,
    licenseMetadata: fields.licenseMetadata,
  });
}

/**
 * Deterministic document id: sha256(sourceType | persistentIdentifier |
 * normalizedHash), truncated to 32 hex chars. Same document + same content →
 * same id across runs/platforms (reproducibility anchor for corpus snapshots).
 */
export function computeDocumentId(
  sourceType: DocumentSource,
  persistentIdentifier: string,
  normalizedHash: string,
): string {
  return rawSha256Hex(`${sourceType}|${persistentIdentifier}|${normalizedHash}`).slice(0, 32);
}

/** Whitespace-normalize a text field (collapse runs, trim). */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
