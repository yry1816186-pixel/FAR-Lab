import { HttpError, sendJson, type RouteCtx, type RouteFamily } from '../http-kit.js';
import { fetchZoteroAnnotations, fetchZoteroLibrary, ZoteroUnavailableError } from '../zotero.js';

/** Zotero family (BC-002): local-library bridge. The page cannot fetch Zotero
 *  directly (no CORS headers on 127.0.0.1:23119), so the server proxies the
 *  full snapshot. */

export function registerZoteroRoutes(_ctx: RouteCtx): RouteFamily {
  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'zotero') return false;
    if (segments[3] === 'library' && segments.length === 4 && method === 'GET') {
      try {
        sendJson(res, 200, await fetchZoteroLibrary());
      } catch (e) {
        if (e instanceof ZoteroUnavailableError) {
          throw new HttpError(503, { code: 'provider_unreachable', message: e.message, retryable: true });
        }
        throw e;
      }
      return true;
    }
    if (segments[3] === 'annotations' && segments.length === 4 && method === 'GET') {
      // Researcher annotations (highlights/notes) — seed material for studies.
      try {
        sendJson(res, 200, await fetchZoteroAnnotations());
      } catch (e) {
        if (e instanceof ZoteroUnavailableError) {
          throw new HttpError(503, { code: 'provider_unreachable', message: e.message, retryable: true });
        }
        throw e;
      }
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
