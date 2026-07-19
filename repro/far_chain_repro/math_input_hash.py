"""Math formalization inputHash — cross-language byte-equality with TS.

Mirrors TS ``src/math/math_verifier.ts`` ``MathVerifier.computeInputHash`` +
``canonicalConfidence``. This is the Python reference implementation that the
TS-side comment (math_verifier.ts inputHash docstring) has claimed byte-equality
with — it was previously missing (audit [F], Red Line #5).

Authority: FAR_CHAIN_DEV_SPEC/38_数学可验证层 §1 (FormalExpression) +
           03_确定性规范 §2.4 (canonical_hash byte-equality) +
           CLAUDE.md Red Line #5 (TS/Python canonicalHash 必须 byte-equal).

Model-neutrality: NO provider/model references. Pure hash determinism.
"""

from __future__ import annotations

from typing import Any

from far_chain_repro.canonical_json import hash_canonical_json


def canonical_confidence(confidence: float) -> str:
    """Normalize confidence to a cross-language byte-equal string.

    Root cause (audit [F] / Red Line #5): JS Number does not distinguish int/float
    (1.0 === 1) → JSON.stringify(1.0)="1"; Python float → json.dumps(1.0)="1.0".
    Integer-valued floats diverge across TS fast-json-stable-stringify and Python
    json.dumps, breaking computeInputHash byte-equality when confidence===1.0.

    Strategy: fixed-point 6 decimals (``f"{c:.6f}"``, matching TS ``toFixed(6)``) —
    fixed-point has no exponent-threshold divergence (JS String and Python repr
    switch to exponential at different magnitudes). -0.0 is normalized to +0.0
    (Python ``f"{-0.0:.6f}"="-0.000000"`` vs JS ``"0.000000"``). Both sides operate
    on the same IEEE-754 double, so fixed-point rounding is identical.
    """
    c = float(confidence)
    if c == 0:
        c = 0.0  # normalize -0.0 → +0.0 (align JS (-0).toFixed(6)="0.000000")
    return f"{c:.6f}"


def compute_input_hash(
    target: str,
    source: str,
    formalizer_id: str,
    confidence: float,
) -> str:
    """sha256 of canonical formalization JSON ``{target, source, formalizerId, confidence}``.

    Byte-equal with TS ``MathVerifier.computeInputHash``
    (``src/math/math_verifier.ts``). confidence is normalized via
    ``canonical_confidence()`` to guarantee cross-language byte-equality
    (audit [F] / Red Line #5).

    Args:
        target: formal target language (``"lean4"`` / ``"dafny"`` / ``"smtlib"``).
        source: formalized source code string (non-empty).
        formalizer_id: formalizer identifier (e.g. ``"core_neutral@v1"``).
        confidence: autoformalizer self-rated confidence in [0, 1].

    Returns:
        sha256 hex lowercase (64 chars).
    """
    canonical: dict[str, Any] = {
        "target": target,
        "source": source,
        "formalizerId": formalizer_id,
        "confidence": canonical_confidence(confidence),
    }
    return hash_canonical_json(canonical)
