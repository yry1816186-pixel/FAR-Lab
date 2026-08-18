# FAR-Lab web workbench

React + TypeScript + Vite single-page app for FAR-Lab: research missions,
claim assays, proof-bundle verification, evidence exploration, and the
Science-125 benchmark report.

## Develop

```bash
# from the repository root: API on :3000 + this app on :5173
pnpm dev

# or standalone (API must run separately: pnpm api)
npm install
npm run dev
```

Vite proxies `/api`, `/health`, `/ready`, `/metrics` to `localhost:3000`.
Set `VITE_API_BASE_URL` to an absolute URL for cross-origin deployments.

## Verify

```bash
npm run typecheck   # tsc -b (project-references aware)
npm run lint        # eslint, zero-tolerance for explicit any
npm run test        # vitest run (jsdom)
npm run build       # tsc -b && vite build → dist/ (deterministic)
```

## Layout

```
src/
  app/        application shell, router, providers, error boundary
  features/   one directory per product surface (home, missions, assay,
              verify, evidence, benchmark, about)
  entities/   domain vocabulary: verdicts, lifecycle states, DTO mirrors
  shared/     api client + SSE, i18n catalogues, ui primitives, theme
```

The backend DTO is the contract of record; `entities/dtos.ts` mirrors field
names verbatim and `shared/api` validates envelopes at the boundary.
