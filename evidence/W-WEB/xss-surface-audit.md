# Web Workbench XSS-Surface Audit (risk item #6 closure, 2026-08-22)

**Scope:** `web/src/` (React workbench, W3-era, 127.0.0.1 local deployment profile).
**Method:** static sink scan + dependency review + render-path trace. Commands runnable as-is.

## Findings (all grep-verified 2026-08-22)

1. **Zero dangerous DOM sinks**: `dangerouslySetInnerHTML`, `innerHTML`,
   `insertAdjacentHTML`, `document.write`, `javascript:` URLs — 0 occurrences in
   `web/src/` (the single `target=` hit is a text-attribute render, not an anchor).
2. **No markdown→HTML renderer**: web deps contain no marked/remark/rehype/DOMPurify;
   the report endpoint's markdown text (`web/src/api/endpoints.ts`) is rendered as
   plain escaped JSX text — no HTML compilation path exists.
3. **React default escaping** covers every interpolation; no `eval`/`Function` usage.

## Verdict

PASS for the current local-deployment profile: no untrusted-data → HTML sink exists.
**Guard for the future:** if a markdown renderer (or any HTML-emitting component) is
added, DOMPurify (or equivalent allowlist sanitization) becomes MANDATORY before any
public-network deployment — recorded here as the standing condition.

Replication:
```
grep -rn "dangerouslySetInnerHTML\|innerHTML\|insertAdjacentHTML\|document.write\|javascript:" web/src/
grep -rn "markdown\|marked\|remark\|rehype\|DOMPurify\|sanitize" web/src/ web/package.json
```
