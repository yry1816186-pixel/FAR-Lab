# API Reference

The REST API is served by `far api` (Fastify). By default it listens on `http://localhost:3000`,
uses an in-memory DB, seeds the demo verdict, and runs **anonymous / offline** (no key required).

- Base URL: `http://localhost:3000`
- API version prefix: `/api/v1`
- Live OpenAPI document: `GET /documentation/json`
- Health: `GET /health` · `GET /ready`

## Start the server

```bash
far api                                  # anonymous offline demo (in-memory DB)
far api --port 4000                      # custom port (or set PORT)
far api --persist ./FAR-Lab.db         # persist across restarts
far api --protected                      # require JWT (needs FAR_JWT_SECRET)
far api --no-seed                        # do not seed the demo verdict
```

## Authentication

- **Offline mode (default):** anonymous. No key, no JWT. Safe for local demo / frontend development.
- **Protected mode (`--protected`):** requires a JWT bearer token. Set `FAR_JWT_SECRET` before
  starting the server; clients send `Authorization: Bearer <token>`. See `src/api/auth/`.

## Error format

All errors use a uniform envelope (produced by `src/api/errors/`). The HTTP status is on the
response; the body carries the machine-readable code:

```json
{ "error_code": "VALIDATION_FAILED", "message": "...", "source_anchor": { "fileId": null, "stageId": null, "callRecordId": null }, "detail": [ ... ] }
```

Common codes: `400 VALIDATION_FAILED`, `404 NOT_FOUND`, `409 CHAIN_BROKEN`, `500 INTERNAL`. A live,
machine-readable OpenAPI document is served at `GET /documentation/json` (16 paths, title
"FAR-Lab API").

## Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | none | Liveness probe — process is up |
| GET | `/ready` | none | Readiness probe — DB attached and migrated |

### Hypothesize (run the verdict loop)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/hypothesize` | optional | Run the 6-stage FSM on a research input; returns the loop state, evidence-graph subtree, honest verdict, repro hash, and trace grade |

Request body:
```json
{
  "researchInput": "Does adapter A beat baseline on TESS-ASTRO?",
  "mode": "full",
  "dialogueMode": "single"
}
```
`mode` and `dialogueMode` are optional. Response `200`: `{ loopState, graphSubtree, honestVerdict, reproHash, traceGrade }`.
`400 VALIDATION_FAILED` on a malformed body. (Real inference needs a provider profile + credentials;
the default profile is offline_replay.)

### Evidence

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/evidence/:id` | optional | Fetch one evidence node by id |
| GET | `/api/v1/evidence/chain/:headHash` | optional | Fetch the evidence sub-chain whose head hash matches |

`404 NOT_FOUND` when the id / head hash is absent.

### Verdict

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/verdict` | optional | List verdict nodes (most recent first) |
| GET | `/api/v1/verdict/:id` | optional | Fetch one verdict node by id |
| GET | `/api/v1/verdict/by_hypothesis/:hypoId` | optional | Fetch the verdict for a given hypothesis id |

### Report

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/report/:runId` | optional | Structured run report (verdict trace + evidence scope) |
| GET | `/api/v1/report/:runId/paper` | optional | Long-form "paper" projection of a run |

### Integrity

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/integrity/root` | optional | Current Merkle `suiteIntegrityRoot` (independently recomputable) |
| GET | `/api/v1/integrity/proof/:seq` | optional | Hash-chain proof for a given sequence number |
| GET | `/api/v1/integrity/receipt` | optional | Trust-receipt projection of the current state |

### Benchmark / Court / Arena

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/benchmark` | none | Pre-generated FAR-Bench report JSON (offline fixture profile; not a leaderboard) |
| GET | `/api/v1/court/demo` | optional | Cross-model reliability court demo (offline_replay; issues a ReliabilityCertificate) |
| GET | `/api/v1/arena/demo` | optional | Adversarial arena demo (offline_replay; deterministic arbiter scoreboard) |

The court/arena demo endpoints replay the same fixture for every model, so under offline_replay all
verdicts are necessarily identical — they demonstrate the framework and consistency check, not real
model disagreement. Real disagreement needs a real provider (credential gate).

## Frontend

The web UI (`frontend/`) calls these endpoints; its API client defaults to `http://localhost:3000`
(override via `VITE_API_BASE_URL`). See `frontend/src/lib/api_client.ts`.

## Honest boundary

The API never lets an LLM cast the final verdict — every verdict is produced by the deterministic
R0–R9 kernel. Demo / offline_replay data is fixture-driven and is **not** a real scientific verdict.
