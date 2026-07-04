"""Deterministic five-value verdict kernel mirror for golden-vector replay.

This Python module mirrors the TypeScript V2 kernel's R0-R9 cascade for the
on-disk GV oracle cases. It is intentionally small and side-effect free; the CLI
entrypoint reads a case JSON file and emits the computed verdict trace.
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Any

VERDICT_FLOAT_TOLERANCE = 1e-7
STABLE_METRIC_KEY_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$")
STAT_PLAN_REQUIRED_FIELDS = [
    "primaryMetric",
    "nullHypothesis",
    "alternativeHypothesis",
    "alpha",
    "effectDirection",
    "confidenceIntervalMethod",
    "multipleTestingCorrection",
    "missingDataPolicy",
    "outlierPolicy",
    "stoppingRule",
]


def verdict_lte(left: float, right: float) -> bool:
    return left <= right + VERDICT_FLOAT_TOLERANCE


def verdict_gte(left: float, right: float) -> bool:
    return left >= right - VERDICT_FLOAT_TOLERANCE


def decide_five_value_verdict(kernel_input: dict[str, Any]) -> dict[str, Any]:
    integrity_flags = list(kernel_input.get("integrityFlags", []))
    empty_scope = {
        "isDegraded": False,
        "coverage": "none",
        "impactedScopeEdges": [],
        "scopeSlipText": None,
        "hasSameScopeRefutation": False,
    }
    empty_stat = {
        "refutes": False,
        "supports": False,
        "conflicting": False,
        "underpowered": False,
        "effectiveDirection": "unknown",
        "primaryAdjustedPValue": None,
        "primaryEffectSize": None,
        "primaryConfidenceInterval": None,
        "hasWarnAssumption": False,
    }
    fec = kernel_input.get("fec")
    if fec is not None and fec.get("contractVersion") != "FEC/2.0":
        return make_output(
            "UNTESTED",
            ["R0_SCHEMA_INVALID"],
            "R0_SCHEMA_INVALID",
            empty_scope,
            empty_stat,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
            "SCHEMA_INVALID",
        )

    compile_result = None if fec is None else compile_fec_for_verdict(fec)
    if compile_result is None or not compile_result["ok"]:
        return make_output(
            "UNTESTED",
            ["R1_FEC_NOT_COMPILABLE"],
            "R1_FEC_NOT_COMPILABLE",
            empty_scope,
            empty_stat,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
            "FEC_NOT_READY",
        )
    integrity_flags = merge_integrity_flags(integrity_flags, compile_result["integrityFlags"])

    if not has_valid_dataset_binding(kernel_input):
        return make_output(
            "UNTESTED",
            ["R2_NO_VALID_DATASET_BINDING"],
            "R2_NO_VALID_DATASET_BINDING",
            empty_scope,
            empty_stat,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
            "EVIDENCE_MISSING",
        )

    critical_deviations = [
        deviation
        for deviation in kernel_input.get("protocolDeviations", [])
        if deviation.get("severity") == "critical"
    ]
    if critical_deviations:
        for deviation in critical_deviations:
            kind = deviation.get("kind")
            if kind == "alpha_rewrite" and "harking_risk" not in integrity_flags:
                integrity_flags.append("harking_risk")
            if kind == "metric_swap" and "p_hacking_risk" not in integrity_flags:
                integrity_flags.append("p_hacking_risk")
        return make_output(
            "UNTESTED",
            [
                "R3_CRITICAL_PROTOCOL_DEVIATION",
                *[deviation_reason_code(str(deviation.get("kind", ""))) for deviation in critical_deviations],
            ],
            "R3_CRITICAL_PROTOCOL_DEVIATION",
            evaluate_scope(kernel_input),
            evaluate_statistics(kernel_input),
            kernel_input["evidenceSufficiency"],
            integrity_flags,
            "CRITICAL_DEVIATION",
        )

    scope_report = evaluate_scope(kernel_input)
    statistical_report = evaluate_statistics(kernel_input)
    alpha = float(fec["statisticalPlan"]["alpha"])
    power_plan = fec.get("powerPlan")
    minimum_detectable_effect = None if power_plan is None else power_plan.get("minimumDetectableEffect")

    if scope_report["isDegraded"] and not scope_report["hasSameScopeRefutation"]:
        return make_output(
            "DEGRADED_SCOPE",
            ["R4_SCOPE_MISMATCH_NONCRITICAL", *scope_drift_codes(kernel_input)],
            "R4_SCOPE_MISMATCH_NONCRITICAL",
            scope_report,
            statistical_report,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
        )

    if any(finding.get("severity") == "fail" for finding in kernel_input.get("antiTheaterFindings", [])):
        return make_output(
            "UNTESTED",
            ["ANTI_THEATER_FAIL"],
            "ANTI_THEATER_FAIL",
            scope_report,
            statistical_report,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
            "ANTI_THEATER_FAIL",
        )

    if statistical_report["conflicting"]:
        return make_output(
            "INCONCLUSIVE",
            ["R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE"],
            "R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE",
            scope_report,
            statistical_report,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
        )

    if statistical_report["refutes"]:
        return make_output(
            "REFUTED",
            ["R6_PRIMARY_TEST_REFUTES"],
            "R6_PRIMARY_TEST_REFUTES",
            scope_report,
            statistical_report,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
        )

    r7_pass = (
        statistical_report["supports"]
        and statistical_report["primaryAdjustedPValue"] is not None
        and verdict_lte(float(statistical_report["primaryAdjustedPValue"]), alpha)
        and statistical_report["primaryEffectSize"] is not None
        and (
            minimum_detectable_effect is None
            or verdict_gte(float(statistical_report["primaryEffectSize"]), float(minimum_detectable_effect))
        )
        and kernel_input["evidenceSufficiency"].get("status") == "sufficient"
        and not scope_report["hasSameScopeRefutation"]
        and len(integrity_flags) == 0
        and not statistical_report["hasWarnAssumption"]
    )
    if r7_pass:
        return make_output(
            "CONFIRMED",
            ["R7_PRIMARY_TEST_CONFIRMS"],
            "R7_PRIMARY_TEST_CONFIRMS",
            scope_report,
            statistical_report,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
            bounded_support=True,
        )

    primary_adjusted = statistical_report["primaryAdjustedPValue"]
    primary_effect = statistical_report["primaryEffectSize"]
    r8_trigger = (
        (primary_adjusted is not None and not verdict_lte(float(primary_adjusted), alpha))
        or kernel_input["evidenceSufficiency"].get("powerStatus") == "underpowered"
        or (
            primary_effect is not None
            and minimum_detectable_effect is not None
            and not verdict_gte(float(primary_effect), float(minimum_detectable_effect))
        )
        or statistical_report["hasWarnAssumption"]
        or "p_hacking_risk" in integrity_flags
    )
    if r8_trigger:
        reason_codes = ["R8_INSUFFICIENT_POWER_OR_NULL"]
        if any(finding.get("kind") == "seed-cherry-picking" for finding in kernel_input.get("antiTheaterFindings", [])):
            reason_codes.append("SEED_CHERRY_PICK_WARN")
        return make_output(
            "INCONCLUSIVE",
            reason_codes,
            "R8_INSUFFICIENT_POWER_OR_NULL",
            scope_report,
            statistical_report,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
        )

    statistics = kernel_input.get("statistics", [])
    if statistics and all(stat.get("status") == "skipped" for stat in statistics):
        return make_output(
            "UNTESTED",
            ["R9_ALL_TESTS_SKIPPED"],
            "R9_ALL_TESTS_SKIPPED",
            scope_report,
            statistical_report,
            kernel_input["evidenceSufficiency"],
            integrity_flags,
            "NO_DECISION_PATH",
        )

    return make_output(
        "UNTESTED",
        ["NO_DECISION_PATH"],
        "NO_DECISION_PATH",
        scope_report,
        statistical_report,
        kernel_input["evidenceSufficiency"],
        integrity_flags,
        "NO_DECISION_PATH",
    )


def evaluate_scope(kernel_input: dict[str, Any]) -> dict[str, Any]:
    if kernel_input.get("fec") is None:
        return {
            "isDegraded": False,
            "coverage": "none",
            "impactedScopeEdges": [],
            "scopeSlipText": None,
            "hasSameScopeRefutation": False,
        }
    coverages = [binding["scopeCoverage"] for binding in kernel_input.get("datasetBindings", [])]
    scope_partial = any(coverage.get("relation") != "within" for coverage in coverages)
    drift_warn = any(
        diagnostic.get("kind") == "distribution_drift" and diagnostic.get("severity") == "warn"
        for stat in kernel_input.get("statistics", [])
        for diagnostic in stat.get("assumptionDiagnostics", [])
    )
    is_degraded = scope_partial or drift_warn
    impacted = [coverage for coverage in coverages if coverage.get("relation") != "within"]
    same_scope_refutation = any(
        item.get("crossesRefutationThreshold") and item.get("sameScope")
        for item in kernel_input.get("contradictionSet", [])
    )
    return {
        "isDegraded": is_degraded,
        "coverage": "none" if not coverages else "partial" if is_degraded else "full",
        "impactedScopeEdges": impacted,
        "scopeSlipText": render_scope_slip(impacted, drift_warn) if is_degraded else None,
        "hasSameScopeRefutation": same_scope_refutation,
    }


def evaluate_statistics(kernel_input: dict[str, Any]) -> dict[str, Any]:
    fec = kernel_input.get("fec")
    if fec is None:
        return {
            "refutes": False,
            "supports": False,
            "conflicting": False,
            "underpowered": False,
            "effectiveDirection": "unknown",
            "primaryAdjustedPValue": None,
            "primaryEffectSize": None,
            "primaryConfidenceInterval": None,
            "hasWarnAssumption": False,
        }
    alpha = float(fec["statisticalPlan"]["alpha"])
    metric_key = fec["metric"]["metricKey"]
    statistics = kernel_input.get("statistics", [])
    primary = [stat for stat in statistics if stat.get("testId") == metric_key]
    significant = [
        stat
        for stat in statistics
        if stat.get("adjustedPValue") is not None and verdict_lte(float(stat["adjustedPValue"]), alpha)
    ]
    supports = any(stat.get("effectDirection") == "supports" for stat in significant)
    refutes = any(stat.get("effectDirection") == "refutes" for stat in significant)
    primary_first = primary[0] if primary else {}
    has_warn_assumption = any(
        diagnostic.get("severity") == "warn"
        for stat in statistics
        for diagnostic in stat.get("assumptionDiagnostics", [])
    ) or any(finding.get("severity") == "warn" for finding in kernel_input.get("antiTheaterFindings", []))
    return {
        "refutes": refutes,
        "supports": supports,
        "conflicting": supports and refutes,
        "underpowered": kernel_input["evidenceSufficiency"].get("powerStatus") == "underpowered",
        "effectiveDirection": "supports" if supports else "refutes" if refutes else "unknown",
        "primaryAdjustedPValue": primary_first.get("adjustedPValue"),
        "primaryEffectSize": primary_first.get("effectSizeObserved"),
        "primaryConfidenceInterval": primary_first.get("confidenceInterval"),
        "hasWarnAssumption": has_warn_assumption,
    }


def make_output(
    verdict: str,
    reason_codes: list[str],
    decisive_rule_id: str,
    scope_report: dict[str, Any],
    statistical_report: dict[str, Any],
    evidence_sufficiency: dict[str, Any],
    integrity_flags: list[str],
    untested_reason: str | None = None,
    bounded_support: bool = False,
) -> dict[str, Any]:
    return {
        "verdict": verdict,
        "reasonCodes": reason_codes,
        "ruleTrace": [{"ruleId": decisive_rule_id, "triggered": True}],
        "decisiveRuleId": decisive_rule_id,
        "scopeReport": scope_report,
        "statisticalReport": statistical_report,
        "evidenceSufficiency": evidence_sufficiency,
        "untestedReason": untested_reason,
        "integrityFlags": integrity_flags,
        "boundedSupport": bounded_support,
    }


def compile_fec_for_verdict(fec: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    integrity_flags = list(fec.get("integrityFlags", []))

    if len(str(fec.get("measurableImplication", "")).strip()) == 0:
        errors.append("FEC_NOT_COMPILABLE")

    scope = fec.get("scope", {})
    if (
        len(str(scope.get("population", "")).strip()) == 0
        or len(str(scope.get("timeWindow", "")).strip()) == 0
        or len(str(scope.get("domainConstraint", "")).strip()) == 0
    ):
        errors.append("SCOPE_UNBOUNDED")

    metric = fec.get("metric", {})
    metric_key = str(metric.get("metricKey", ""))
    if len(metric_key.strip()) == 0 or STABLE_METRIC_KEY_PATTERN.fullmatch(metric_key) is None:
        errors.append("METRIC_MISSING")

    threshold = fec.get("threshold", {})
    threshold_value = threshold.get("value")
    threshold_unit = threshold.get("unit")
    metric_unit = metric.get("unit")
    if not is_finite_number(threshold_value) or threshold_unit != metric_unit:
        errors.append("THRESHOLD_MISSING")

    if len(fec.get("datasetRequirements", [])) == 0 or len(fec.get("workflowRequirements", [])) == 0:
        errors.append("EVIDENCE_REQUIREMENT_MISSING")

    stat_plan = fec.get("statisticalPlan", {})
    missing_stat_fields = [
        field
        for field in STAT_PLAN_REQUIRED_FIELDS
        if is_missing_stat_field(stat_plan.get(field))
    ]
    if missing_stat_fields:
        errors.append("STAT_PLAN_MISSING")
    else:
        alpha = stat_plan.get("alpha")
        if not is_finite_number(alpha) or not (0 < float(alpha) < 1):
            errors.append("STAT_PLAN_MISSING")

    family_size = fec.get("multipleTestingPlan", {}).get("familySize", 1)
    if family_size > 1 and stat_plan.get("multipleTestingCorrection") == "none":
        if "p_hacking_risk" not in integrity_flags:
            integrity_flags.append("p_hacking_risk")

    if involves_randomness(fec) and fec.get("seedPolicy", {}).get("fixed") is not True:
        errors.append("PROTOCOL_INCOMPLETE")

    if fec.get("freeze", {}).get("frozenBy") != "deterministic_freezer":
        errors.append("LLM_FROZEN")

    return {"ok": len(errors) == 0, "integrityFlags": integrity_flags, "errors": errors}


def is_missing_stat_field(value: object) -> bool:
    return value is None or (isinstance(value, str) and len(value.strip()) == 0)


def is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def involves_randomness(fec: dict[str, Any]) -> bool:
    workflow_requires_seed = any(
        workflow.get("requireFixedSeed") is True
        for workflow in fec.get("workflowRequirements", [])
    )
    metric_deterministic = fec.get("metric", {}).get("isDeterministic") is True
    return workflow_requires_seed or not metric_deterministic


def merge_integrity_flags(input_flags: list[str], compiled_flags: list[str]) -> list[str]:
    merged = list(input_flags)
    for flag in compiled_flags:
        if flag not in merged:
            merged.append(flag)
    return merged


def has_valid_dataset_binding(kernel_input: dict[str, Any]) -> bool:
    return any(
        binding.get("sourceAnchor", {}).get("resolved") is True
        for binding in kernel_input.get("datasetBindings", [])
    )


def scope_drift_codes(kernel_input: dict[str, Any]) -> list[str]:
    drift = any(
        diagnostic.get("kind") == "distribution_drift"
        for stat in kernel_input.get("statistics", [])
        for diagnostic in stat.get("assumptionDiagnostics", [])
    )
    return ["DATASET_DRIFT_WARN"] if drift else []


def deviation_reason_code(kind: str) -> str:
    if kind == "alpha_rewrite":
        return "ALPHA_REWRITE_DETECTED"
    if kind == "metric_swap":
        return "METRIC_SWAP_DETECTED"
    return f"{kind.upper()}_DETECTED"


def render_scope_slip(impacted: list[dict[str, Any]], drift_warn: bool) -> str:
    parts = [
        f"{item.get('dimension')}={item.get('value')}({item.get('relation')})"
        for item in impacted
        if item.get("dimension") is not None
    ]
    if drift_warn:
        parts.append("dataset distribution drift")
    return f"scope narrowed: {'; '.join(parts)}" if parts else "scope narrowed"


def decide_case_file(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        case = json.load(handle)
    return decide_five_value_verdict(case["input"]["kernel"])


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        sys.stderr.write("usage: python -m far_chain_repro.verdict_kernel_v2 <case.json>\n")
        return 2
    output = decide_case_file(Path(argv[1]))
    sys.stdout.write(json.dumps(output, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
