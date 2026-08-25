# Handoff: exploration sandbox numpy surface partially non-functional + matrix.ts test-only wiring

- **From:** lane 14 (evaluation-redteam) — **To:** lane 10 (scientific-execution, owns `experiment-runtime/**` + experiment modules)
- **Date:** 2026-08-25
- **Urgency:** medium (advertised capability gap; fail-closed so no honesty violation, but the namespace contract is unreliable and untested)

## Finding 1: numpy ops that lazily import submodules die inside the sandbox

Inside the REAL sidecar namespace (repo-locked env, direct op call):

```bash
cd work/r2-14-evaluation-redteam
uv run --project experiment-runtime python - <<'EOF'
import sys
sys.path.insert(0, r"experiment-runtime")
from farlab_experiment_runtime.exploration import op_run_exploration
print(op_run_exploration({"code": "print(float(np.mean([1.0, 2.0, 3.0])))"}))   # ok=True, prints 2.0
print(op_run_exploration({"code": "print(int(np.arange(4).sum()))"}))          # ok=False, ImportError
EOF
```

Result (2026-08-25):
- `np.mean([1,2,3])` → `{'ok': True, 'stdout': '2.0\n'}`
- `np.arange(4).sum()` → `{'ok': False, 'errorKind': 'ImportError', 'errorMessage': "exploration namespace does not provide 'numpy._core._methods'; allowed: [...]"}`

Root cause shape: `_make_import` in `experiment-runtime/farlab_experiment_runtime/exploration.py` whitelists only top-level module names, but numpy ≥2 ops dispatch through lazy submodule imports (e.g. `_core._methods`). The docstring namespace contract promises "numpy (as np)"; arbitrary analysis code will hit ImportError depending on which numpy internals it exercises.

**Test gap:** no product test executes numpy payloads through the sandbox (`tests/exploration-runner.test.ts` uses pure-python payloads only). Suggested fix directions: allow `numpy.*` submodule imports in the hook (they resolve inside the already-bound numpy), or pre-warm the needed submodules before exec; then add a numpy regression payload to the runner test.

## Finding 2: `src/experiment/matrix.ts` is wired only from tests

Lane-14 P1 probe: `src/experiment/matrix.ts` is unreachable from both production entrypoints and imported only by `tests/experiment-screening.test.ts` and `tests/experiment.test.ts`. If matrix screening is an advertised capability, it needs a real production caller; otherwise wire-or-delete per the SCIENCE-lane precedent for dead algorithms.

Probe evidence: `eval/results/r2-14/p1-wiring.json` (committed copy in `evidence/r2-14/p1-wiring.json`).
