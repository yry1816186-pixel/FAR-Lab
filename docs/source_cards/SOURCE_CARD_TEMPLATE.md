# SourceCard Template

```yaml
sourceId: "SC-YYYYMMDD-001"
url: "https://example.invalid/source"
title: "Source title"
sourceType: "official_doc"
publisher: "Publisher name"
fetchedAt: "2026-06-27T00:00:00.000Z"
claim: "One falsifiable sentence that this source supports."
evidenceLevel: "primary"
stability: "versioned"
usedFor: "api_contract"
verifiedFactId: null
notes: "Record uncertainty as [verified_live] once confirmed, instead of filling gaps."
```

Rules:

- One card supports one falsifiable claim.
- A scientific evidence SourceCard proves only that the source made the claim.
- Facts used for API contracts or scoring context need a verified fact id before they become project SSOT.
