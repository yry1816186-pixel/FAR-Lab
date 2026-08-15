"""Math verification backends (spec 38 · Epic N).

This package contains subprocess scripts invoked by the TypeScript math layer
(``src/math/*.ts``) via ``python <script>``. Each script reads a JSON request from
stdin and writes a canonical JSON response to stdout. Scripts MUST:

1. Never crash — always emit valid JSON (outcome='unknown' on any error).
2. Use ``json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=False)``
   for output so cross-language canonical-hash alignment holds (§2.4).
3. Record 'backend_disabled' in the log when the backend dependency is missing.

Scripts are intentionally NOT imported as modules by the TS layer — they are
spawned as standalone processes for fresh-clone friendliness and isolation.
"""
