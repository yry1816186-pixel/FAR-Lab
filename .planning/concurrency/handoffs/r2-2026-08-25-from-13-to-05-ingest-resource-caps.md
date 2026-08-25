# Handoff: prove ingest parser resource caps at fusion (F-2) — 13 → 05

- **From:** lane 13 (reliability-security) · **To:** lane 05 (multimodal-ingest)
- **Urgency:** note for your lane's residue fusion (your parser substrate is not
  in the R2 baseline, so this was not auditable on lane 13's branch)
- **Status:** OPEN (checklist, no defect claimed against unseen code)

## Context

Your lane fuses the docx/pptx/epub/html/svg/json/txt-log parsers (zip/XML
substrate) from the build/hx-reconstruction residue. Zip+XML parsing surfaces
have standard resource-exhaustion pitfalls; lane 13's mandate covers resource
exhaustion + malicious artifacts, so this is the red-team checklist to prove
against the fused code (ideally as parser-level tests with crafted fixtures):

1. **Zip bomb / decompression ratio**: entry decompressed-size cap and/or total
   cap with fail-visible error (not OOM/hang). A nested-zip quine and a
   high-ratio single entry (e.g. 1KB → 1GB of zeros) are the two canonical
   probes.
2. **Entry count cap**: an archive with tens of thousands of entries must not
   stall indexing.
3. **Entry-name containment**: any path derived from an archive entry name must
   not escape the extraction target (`../`, absolute paths, drive letters,
   NUL bytes) — the same segment discipline as `safeStaticFile`
   (src/server/api.ts:198) if entries are ever materialized to disk.
4. **XML expansion**: if any XML parser resolves entities, external entities
   must be disabled (XXE) and entity-expansion depth/size bounded (billion
   laughs). If parsing is regex/substring based (zero-dep), state that in a
   comment so future audits skip it.
5. **SVG script content**: svg parsing must not execute or re-serve script
   content as markup anywhere downstream.

If your fused implementation already caps these, a short note in your lane
report closes this handoff; lane 13 will re-verify at integration.
