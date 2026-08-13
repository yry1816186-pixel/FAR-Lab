---
paths:
  - "**/*.{ts,tsx,js,jsx,mts,cts}"
  - "**/package.json"
  - "**/tsconfig*.json"
---
# TypeScript and JavaScript rules

- Follow the repository's package manager, lockfile, TypeScript strictness, formatter, linter, and test framework.
- Do not use `any`, unsafe assertions, or unchecked parsed/model data at protected boundaries without a documented reason and validation.
- Model domain states with discriminated unions or equivalent explicit state machines.
- Keep browser/UI, transport, persistence, model-provider, and domain layers separated.
- Make cancellation, timeout, retry, idempotency, and error mapping explicit for async operations.
- Avoid importing test fixtures or demo-only code into production paths.
- Dependency changes require lockfile review, lifecycle-script awareness, license/security consideration, and an exit strategy.
