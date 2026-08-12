// src/cli/commands/check_resource.ts
// far check-resource —— real existence verification of a cited identifier.
//
// Closes forensic K5 / directive §20: LLM output (e.g. ExecutableCheck.exists, a
// cited DOI) must NOT be accepted as existence verification. This command verifies
// an identifier against its AUTHORITATIVE source (Crossref for DOI, arXiv for
// arxiv-id) and prints the deterministic result.
//
// Usage: far check-resource <kind>:<value> [--json]
//   kind ∈ doi | arxiv | url
//   e.g. far check-resource doi:10.1126/science.aac4716
//        far check-resource arxiv:2501.12345
//
// Exit codes: 0 VERIFIED · 7 NOT_FOUND (a fabrication signal) · 8 UNAVAILABLE
//             (env failure — NOT a fabrication) · 9 UNSUPPORTED · 1 bad args · 2 error.

import { validateResource, parseResourceSpec, type ResourceValidation } from '../../validation/resource_checker.ts';

/** Run `far check-resource`. */
export async function runCheckResource(args: readonly string[]): Promise<number> {
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length === 0) {
    process.stderr.write('far check-resource: a spec is required (e.g. doi:10.1126/science.aac4716)\n');
    return 1;
  }
  const spec = positional[0];
  if (spec === undefined) {
    process.stderr.write('far check-resource: spec missing\n');
    return 1;
  }
  const parsed = parseResourceSpec(spec);
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }
  const json = args.includes('--json');
  let result: ResourceValidation;
  try {
    result = await validateResource(parsed.kind, parsed.value);
  } catch (err) {
    // Network/timeout that the checker re-threw → UNAVAILABLE (env failure).
    const msg = err instanceof Error ? err.message : String(err);
    result = {
      kind: parsed.kind,
      value: parsed.value,
      status: 'UNAVAILABLE',
      checkedAt: new Date().toISOString(),
      method: `error: ${msg}`,
      document: null,
    };
  }

  const exitFor = (s: ResourceValidation['status']): number =>
    s === 'VERIFIED' ? 0 : s === 'NOT_FOUND' ? 7 : s === 'UNAVAILABLE' ? 8 : 9;

  if (json) {
    process.stdout.write(`${JSON.stringify({
      kind: result.kind,
      value: result.value,
      status: result.status,
      checkedAt: result.checkedAt,
      method: result.method,
      document: result.document === null ? null : {
        documentId: result.document.documentId,
        title: result.document.title,
        doi: result.document.doi,
        authors: result.document.authors,
        canonicalUrl: result.document.canonicalUrl,
      },
    }, null, 2)}\n`);
  } else {
    const doc = result.document;
    process.stdout.write(
      `${result.kind}:${result.value} → ${result.status} (${result.method})\n` +
      (doc ? `  title: ${doc.title}\n  authors: ${doc.authors.slice(0, 3).join(', ')}${doc.authors.length > 3 ? ' et al.' : ''}\n  url: ${doc.canonicalUrl}\n` : ''),
    );
  }
  return exitFor(result.status);
}
