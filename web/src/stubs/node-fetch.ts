/**
 * Browser stub for citation-js core's `node-fetch` dependency (its fetchFile
 * URL util). FAR-Lab only passes STRING payloads to Cite.async — the URL path
 * is never taken; reaching it fails loudly instead of bundling Node polyfills.
 * The named exports exist because fetchFile.js imports them statically.
 */
export default function nodeFetchStub(): never {
  throw new Error('node-fetch URL inputs are not supported in the browser build');
}
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;
