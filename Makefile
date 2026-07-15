.PHONY: bootstrap verify demo typecheck smoke-core test test-py

# =============================================================================
# FAR-Chain Makefile
# =============================================================================
# On Windows (PowerShell): run the equivalent pnpm commands directly:
#   pnpm install               → bootstrap (Node deps only)
#   pnpm typecheck && pnpm lint && pnpm test  → verify (quality gate)
#   pnpm run smoke-core        → demo
# =============================================================================

# ---- Primary targets ----

bootstrap: ## Install all dependencies (Node + Python)
	pnpm install --frozen-lockfile
	pip install -e ".[dev]"

verify: ## Run full quality gate (typecheck → lint → test → test:py → cross-lang)
	pnpm typecheck
	pnpm lint
	pnpm run test
	pnpm run test:py
	node --test tests/evidence_log/cross_lang_consistency.test.ts

demo: ## Run core smoke demo (offline replay, no cloud key required)
	pnpm run smoke-core

# ---- Individual CI steps ----

typecheck: ## TypeScript full type check (tsc --noEmit)
	pnpm run typecheck

smoke-core: ## Core smoke test (TS tests + Python tests)
	pnpm run smoke-core

test: ## Full test suite (all modules)
	pnpm test

test-py: ## Python regression tests
	pnpm run test:py

# ---- Help ----

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
