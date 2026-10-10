import { ScientificComputeRequest } from '../../domain/scientific-compute.js';
import { scientificCapabilityCatalog } from '../../domain/scientific-registry.js';
import { executeScientificCompute } from '../../experiment/scientific-compute.js';
import { readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Science family (BC-002): the deterministic scientific-computing plane.
 *  Inputs are schema-validated and results are explicitly marked COMPUTED;
 *  no model or network call occurs. */

export function registerScienceRoutes(_ctx: RouteCtx): RouteFamily {
  return async (req, res, _url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] === 'science' && segments[3] === 'operations' && segments.length === 4 && method === 'GET') {
      const catalog = scientificCapabilityCatalog();
      // `operations` is retained as a compatibility projection for existing
      // clients; `capabilities` is the authoritative, versioned registry.
      sendJson(res, 200, {
        ...catalog,
        operations: catalog.capabilities,
        execution: 'local-deterministic',
        note: 'Each capability declares its output provenance, runtime surface and validation evidence; execution still requires the operation-specific schema and surface.',
      });
      return true;
    }
    if (segments[2] === 'science' && segments[3] === 'compute' && segments.length === 4 && method === 'POST') {
      const body = await readJsonObject(req);
      const parsed = ScientificComputeRequest.safeParse(body);
      if (!parsed.success) throw validation(`invalid scientific compute request: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      try {
        // Route through the pinned scientific sidecar so the HTTP surface and
        // experiment executor share one runtime/library authority and measured
        // environment. Validation remains on the Node boundary.
        const result = await executeScientificCompute(parsed.data);
        sendJson(res, 200, { operation: parsed.data.operation, result });
        return true;
      } catch (e) {
        throw validation(e instanceof Error ? e.message : String(e));
      }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
