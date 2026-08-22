/**
 * Browser stub for citation-js's `sync-fetch` dependency (Node-only: pulls
 * node-fetch/fetch-blob with node:stream imports). FAR-Lab only ever passes
 * STRING payloads to Cite.async — the URL-input path this dependency serves
 * is never taken; reaching it in a browser fails loudly instead of pulling
 * Node polyfills into the bundle (PLAN-reuse-adoption R1).
 */
export default function syncFetchStub(): never {
  throw new Error('sync-fetch URL inputs are not supported in the browser build');
}
