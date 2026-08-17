# Third-Party Notices

FAR-Lab retrieves bibliographic metadata from public scholarly APIs and embeds
subsets of it (title, authors, year, DOI, venue, abstract where licensed) into
its exportable `.far-proof` verification bundles. This file carries the
attribution and licensing notices required or appropriate for that reuse.

---

This product uses publicly available metadata and abstracts retrieved from:

- **OpenAlex** (https://openalex.org) — OpenAlex data is made available under
  the CC0 license per OpenAlex's license statement; attribution is given here
  voluntarily and, should any portion be subject to ODC-BY 1.0 terms, this
  notice satisfies the ODC-BY 4.3 attribution obligation
  (https://opendatacommons.org/licenses/by/1-0/).
- **Crossref** (https://www.crossref.org) — bibliographic metadata reused per
  the Crossref REST API terms (https://www.crossref.org/documentation/retrieve-metadata/rest-api/).
  Abstracts are included only where the source record carries a permissive
  license (CC0 / CC-BY / CC-BY-SA / ODC-PDM / ODC-BY); records whose license
  signal is absent or non-permissive ship without their abstract, annotated as
  `abstractWithheldReason: crossref_record_license_not_permissive`.
- **arXiv** (https://arxiv.org) — descriptive metadata including abstracts is
  made available under CC0 1.0 per the arXiv API Terms of Use
  (https://info.arxiv.org/help/api/tou.html). No full texts are redistributed;
  bundles link to abstract pages only.

No full texts, PDFs, or raw API response dumps are redistributed. Every
`.far-proof` bundle embeds a copy of this notice as
`SOURCES-ATTRIBUTION.txt`, covered by the bundle's integrity manifest.

Direct software dependencies and their licenses are audited by
`scripts/license_audit.mjs` (allowlist of permissive licenses only; run output
is recorded per release). This project's own license: MIT (see `LICENSE`).

---

Verification date of the licensing statements above: 2026-08-17. Re-audit
cadence: quarterly, or on any provider terms change (audit ledger:
`.far/docs-local/COMPLIANCE-data-redistribution.md`, internal).
