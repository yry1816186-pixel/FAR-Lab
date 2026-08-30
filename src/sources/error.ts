import type { SourceFamily } from '../domain/source.js';

/**
 * Structured source-adapter failure. Network failures, non-2xx responses, unparseable
 * payloads, invalid queries and unsupported identifiers all surface as this error —
 * never swallowed, never converted into fake success data (constitution §2/§7).
 */
export type SourceAdapterErrorKind =
  | 'network' // fetch rejected / aborted / no fetch implementation (httpStatus = 0)
  | 'http_status' // non-2xx response (404 resolve branches are NOT errors, see adapters)
  | 'parse' // 2xx response whose body could not be parsed into usable records
  | 'invalid_query' // caller-supplied query rejected before any network call
  | 'unsupported_identifier'; // identifier kind this adapter cannot natively resolve

export interface SourceAdapterErrorInit {
  /** Originating family — a SourceFamily for adapters, a variant label for fulltext fetches. */
  family: SourceFamily | string;
  /** Original query text, or the identifier rendering for resolve() paths. */
  query: string;
  /** HTTP status of the failing response; 0 when no response was received. */
  httpStatus: number;
  kind: SourceAdapterErrorKind;
  message: string;
  url?: string;
  /** First bytes of the failing body — diagnostic only, never returned as data. */
  bodyPreview?: string;
}

/**
 * Security chokepoint (endgame audit B): URLs and messages persisted into
 * errors must never carry credential material — query-string keys leak via
 * logs, proxies and receipts. Sensitive parameters are masked at the single
 * construction site so no caller can forget.
 */
const CREDENTIAL_QUERY =
  /([?&])(api_?key|key|token|access_?token|secret|signature|password|passwd|client_secret)=[^&#\s]*/gi;

export const redactUrlCredentials = (text: string): string =>
  text.replace(CREDENTIAL_QUERY, (_m, sep: string, k: string) => `${sep}${k}=REDACTED`);

export class SourceAdapterError extends Error {
  readonly family: string;
  readonly query: string;
  readonly httpStatus: number;
  readonly kind: SourceAdapterErrorKind;
  readonly url?: string;
  readonly bodyPreview?: string;

  constructor(init: SourceAdapterErrorInit) {
    super(
      redactUrlCredentials(
        `[${init.family}] ${init.kind} httpStatus=${init.httpStatus} query=${JSON.stringify(init.query)}: ${init.message}`,
      ),
    );
    this.name = 'SourceAdapterError';
    this.family = init.family;
    this.query = init.query;
    this.httpStatus = init.httpStatus;
    this.kind = init.kind;
    this.url = init.url !== undefined ? redactUrlCredentials(init.url) : init.url;
    this.bodyPreview = init.bodyPreview;
  }
}

export const isSourceAdapterError = (e: unknown): e is SourceAdapterError =>
  e instanceof SourceAdapterError;
