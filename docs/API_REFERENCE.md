# FAR-Lab API Reference

> Base URL: `http://localhost:3000`
> All app endpoints live under `/api/v1/`. Probes (`/health`, `/ready`) are on the bare root.
> OpenAPI JSON: `GET /documentation/json`

## Probes

### GET /health
Liveness probe. Returns 200 with service status.

**Response 200:**
```json
{ "status": "ok", "service": "far-lab", "version": "1.0.0" }
```

### GET /ready
Readiness probe. Pings the database. Returns 503 when DB is down.

**Response 200:**
```json
{ "status": "ready", "db": "ok" }
```

## Evidence

### GET /api/v1/evidence/:id
Single evidence-log entry by ID.

**Path params:** `id` (string) — evidence record ID

**Response 200:** `EvidenceResponse`
```json
{
  "id": "ev-001",
  "stageId": "stage-1-understanding",
  "cred": "qwen-max",
  "payloadKind": "understanding",
  "claim": "...",
  "prevHash": "0000...",
  "canonicalHash": "a1b2...",
  "timestamp": "2026-08-05T..."
}
```

**Response 404:** `ApiErrorResponse` (error_code: `EVIDENCE_NOT_FOUND`)

### GET /api/v1/evidence/chain/:headHash
Chain head call-record + graph subtree rooted at the given head hash.

**Path params:** `headHash` (string, 64-hex) — chain head SHA-256

**Response 200:** `EvidenceChainResponse`

## Verdict

### GET /api/v1/verdict/:id
Single verdict node by ID.

**Response 200:** `HonestVerdictDto`
```json
{
  "id": "v-001",
  "hypothesisId": "h-001",
  "verdict": "CONFIRMED",
  "reasonCodes": ["R7_PRIMARY_TEST_CONFIRMS"],
  "decisiveRuleId": "R7_PRIMARY_TEST_CONFIRMS",
  "ruleTrace": [...],
  "sealedConclusion": "INCONCLUSIVE",
  "metricValue": 0.72
}
```

### GET /api/v1/verdict/by_hypothesis/:hypoId
The single verdict node for a hypothesis. Returns 404 when none is associated.

### GET /api/v1/verdict
Paginated verdict list (all verdicts, including REFUTED — Honesty Wall).

**Query params:** `limit` (int, default 100), `offset` (int, default 0)

## Integrity (Trust Root)

### GET /api/v1/integrity/root
Whole-chain Merkle root + chain head locator. The chain folded into a single 64-hex digest.

**Response 200:** `IntegrityRootDto`
```json
{
  "merkleRoot": "a1b2c3...",
  "chainHead": { "seq": 42, "hash": "d4e5f6...", "timestamp": "..." },
  "gitCommitSha": "abc1234",
  "envHash": "def4567..."
}
```

### GET /api/v1/integrity/proof/:seq
Merkle inclusion proof (audit path) for one call_record by sequence number.

**Path params:** `seq` (int) — evidence sequence number

**Response 200:** `IntegrityProofDto`
```json
{
  "seq": 5,
  "leaf": "a1b2...",
  "siblings": ["c3d4...", "e5f6..."],
  "expectedRoot": "g7h8..."
}
```

### GET /api/v1/integrity/receipt
Portable whole-chain trust-root snapshot (Repro Receipt). Pin into a paper appendix or CI artifact.

## Hypothesize

### POST /api/v1/hypothesize
Kick off a research loop. Returns loopState + graph + verdict + reproHash.

**Request body:** `HypothesizeRequest`
```json
{
  "claim": "Model A achieves macro-F1 >= 0.80 on TESS-ASTRO benchmark",
  "seed": "tess-offline"
}
```

**Response 200:** `HypothesizeResponse`

## Benchmark

### GET /api/v1/benchmark
Science-125 integrity breadth suite report. Contains suite-level aggregate Merkle root + leaderboard entries.

## Arena (Adversarial)

### GET /api/v1/arena/demo
Adversarial arena demo results (offline_replay proponent + 3 refuters).

## Court (Cross-Model)

### GET /api/v1/court/demo
Cross-model reliability court demo certificate (offline_replay 3 models).

## Report

### GET /api/v1/report/:runId
HTML research report for a given run ID. Content-Type: text/html.

### GET /api/v1/report/:runId/paper
Assembled paper output for a given run ID.

## Error Format

All errors use RFC 7807 Problem Details subset:

```json
{
  "error_code": "EVIDENCE_NOT_FOUND",
  "message": "evidence record ev-999 not found",
  "source_anchor": {
    "file_id": "evidence_log",
    "stage_id": "api",
    "call_record_id": null
  },
  "detail": null
}
```

## Authentication

JWT Bearer token via `Authorization: Bearer <token>` header.
Configured via `FAR_JWT_SECRET` environment variable.
When no secret is set, auth middleware is disabled (development mode).
