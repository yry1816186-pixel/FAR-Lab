---
paths:
  - "**/*.py"
  - "**/pyproject.toml"
  - "**/requirements*.txt"
  - "**/uv.lock"
---
# Python rules

- Follow the repository's declared Python version, formatter, linter, type checker, package manager, and test runner.
- Use typed boundaries and explicit validation for external, persisted, and model-generated data.
- Avoid hidden global state, import-time side effects, mutable defaults, broad exception swallowing, and nondeterministic ordering.
- Preserve exception causality and expose stable domain/application error codes at public boundaries.
- For scientific/numeric code, define units, dtype/precision, NaN/Infinity, randomness, seeds, tolerances, and platform-dependent behavior.
- Prefer pure domain functions and dependency injection over provider/storage imports in core modules.
- Add focused unit tests plus property/metamorphic tests where invariants are more important than examples.
