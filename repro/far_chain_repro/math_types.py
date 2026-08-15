"""Math verification layer enum mirrors (§1 / §1.1).

These constants MUST stay byte-equal with the TypeScript enums in
``src/math/math_claim.ts`` and the SQL CHECK constraints in
``schema/migrations/0003_math_verification.sql``. Cross-language drift
(TS ↔ SQL) is guarded by ``tests/schema/schema_enum_sync.test.ts``.

Authority: §4.5.

Model-neutrality: this module contains NO provider/model references. It mirrors
the structural typing of the math verification layer for cross-language hash
determinism (§2.4 canonical_hash byte-equality).
"""

from __future__ import annotations

from typing import Dict, Final, List, Optional

# ============================================================
# §1  MathClaimKind — 12 values (8 symbolic + 4 numerical) — spec §1
# ============================================================

SYMBOLIC_MATH_CLAIM_KINDS: Final[List[str]] = [
    "algebraic_identity",
    "equation_solution",
    "calculus",
    "inequality",
    "dimensional_consistency",
    "matrix_identity",
    "statistic_identity",
    "theorem",
]

NUMERICAL_MATH_CLAIM_KINDS: Final[List[str]] = [
    "numerical_reproduction",
    "statistical_inference",
    "optimization_convergence",
    "validated_numerics",
]

MATH_CLAIM_KINDS: Final[List[str]] = SYMBOLIC_MATH_CLAIM_KINDS + NUMERICAL_MATH_CLAIM_KINDS

# ============================================================
# §2  VerificationLevel — 4 values (lowercase) — spec §1
# ============================================================

VERIFICATION_LEVELS: Final[List[str]] = ["L1_cas", "L2_smt", "L3_formal", "L4_human"]

# ============================================================
# §3  VerificationOutcome — 3 values — spec §1
# ============================================================

VERIFICATION_OUTCOMES: Final[List[str]] = ["verified", "refuted", "unknown"]

# ============================================================
# §4  BackendKind — 5 values — spec §1.1
# ============================================================

BACKEND_KINDS: Final[List[str]] = ["cas", "smt", "lean4", "dafny", "numerical"]

# Symbolic backends (spec §1.1 BACKEND_LEVEL keys): the 4 backends that can
# return a self-proving 'verified' outcome and contribute to achievedLevel.
SYMBOLIC_BACKEND_KINDS: Final[List[str]] = ["cas", "smt", "lean4", "dafny"]

# ============================================================
# §5  FormalTarget — 3 values — spec §1 / §5
# ============================================================

FORMAL_TARGETS: Final[List[str]] = ["lean4", "dafny", "smtlib"]

# ============================================================
# §6  Derived maps — spec §1.1
# ============================================================

# BackendKind -> VerificationLevel (symbolic backends only). 'numerical' has no
# entry and never contributes to achievedLevel (non-self-proving — spec §4.5).
BACKEND_LEVEL: Final[Dict[str, str]] = {
    "cas": "L1_cas",
    "smt": "L2_smt",
    "lean4": "L3_formal",
    "dafny": "L3_formal",
}

# Level rank ordering (partial order): L1_cas < L2_smt < L3_formal < L4_human.
LEVEL_RANK: Final[Dict[str, int]] = {
    "L1_cas": 1,
    "L2_smt": 2,
    "L3_formal": 3,
    "L4_human": 4,
}


# ============================================================
# §7  Type guards + derived helpers (mirror of math_claim.ts)
# ============================================================

def is_symbolic_kind(kind: str) -> bool:
    return kind in SYMBOLIC_MATH_CLAIM_KINDS


def is_numerical_kind(kind: str) -> bool:
    return kind in NUMERICAL_MATH_CLAIM_KINDS


def is_math_claim_kind(value: str) -> bool:
    return value in MATH_CLAIM_KINDS


def is_verification_level(value: str) -> bool:
    return value in VERIFICATION_LEVELS


def is_verification_outcome(value: str) -> bool:
    return value in VERIFICATION_OUTCOMES


def is_backend_kind(value: str) -> bool:
    return value in BACKEND_KINDS


def is_symbolic_backend_kind(kind: str) -> bool:
    return kind in SYMBOLIC_BACKEND_KINDS


def is_formal_target(value: str) -> bool:
    return value in FORMAL_TARGETS


def default_required_level(kind: str) -> str:
    """Default requiredLevel for a claim kind (spec §1.1).

    Symbolic -> L1_cas (minimum self-proving level); numerical -> L4_human
    (numerical claims are non-self-proving — only a human checkpoint closes them).
    """
    return "L4_human" if is_numerical_kind(kind) else "L1_cas"


def derived_achieved_level(verifications) -> Optional[str]:
    """Derive the achieved level from verification records (spec §1.1 方案A).

    Each verification is a mapping with at least ``backend_kind`` and ``outcome``.
    Only ``verified`` records on symbolic backends contribute; ``numerical`` never
    does (non-self-proving — spec §4.5). Returns the highest-rank contributing
    level, or ``None`` when no verified symbolic record exists.
    """
    best_rank = 0
    best_level: Optional[str] = None
    for v in verifications:
        if v.get("outcome") != "verified":
            continue
        backend_kind = v.get("backend_kind")
        if not is_symbolic_backend_kind(backend_kind):
            continue
        level = BACKEND_LEVEL[backend_kind]
        rank = LEVEL_RANK[level]
        if rank > best_rank:
            best_rank = rank
            best_level = level
    return best_level


def meets_required_level(achieved: Optional[str], required: str) -> bool:
    """Whether an achieved level meets the required level (spec §1.1)."""
    if achieved is None:
        return False
    return LEVEL_RANK[achieved] >= LEVEL_RANK[required]
