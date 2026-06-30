.PHONY: bootstrap verify demo ci-all typecheck zero-tolerance smoke-core test test-py

# =============================================================================
# FAR-Chain Makefile
# =============================================================================
# On Windows (PowerShell): run the equivalent pnpm commands directly:
#   pnpm install               → bootstrap (Node deps only)
#   pnpm run ci-all            → verify
#   pnpm run smoke-core        → demo
# =============================================================================

# ---- Primary targets ----

bootstrap: ## Install all dependencies (Node + Python)
	pnpm install --frozen-lockfile
	pip install -e ".[dev]"

verify: ## Run full CI gate (zero-tolerance → typecheck → smoke-core → test:agent_loop → test:ci)
	pnpm run ci-all

demo: ## Run core smoke demo (offline replay, no cloud key required)
	pnpm run smoke-core

# ---- Individual CI steps ----

ci-all: verify

typecheck: ## TypeScript full type check (tsc --noEmit)
	pnpm run typecheck

zero-tolerance: ## Scan for forbidden patterns (:any, @ts-ignore, empty catch, hardcoded secrets)
	pnpm run zero-tolerance

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
