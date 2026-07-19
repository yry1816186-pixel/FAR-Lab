from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import unittest

from far_chain_repro.verdict_kernel_v2 import decide_five_value_verdict


CASE_DIR = Path("golden_vectors/cases")


class VerdictKernelV2Test(unittest.TestCase):
    def test_gv_cases_match_expected_verdicts(self) -> None:
        files = sorted(CASE_DIR.glob("GV-*.json"))
        self.assertEqual(len(files), 14)  # GV-01..12 (核心) + GV-13 (FUSION-OS-13 derivationForm) + GV-14 (FUSION-OS-14 identifier)
        for path in files:
            with self.subTest(case=path.name):
                case = json.loads(path.read_text(encoding="utf-8"))
                output = decide_five_value_verdict(case["input"]["kernel"])
                expected = case["expected"]
                self.assertEqual(output["verdict"], expected["verdict"])
                self.assertEqual(output["decisiveRuleId"], expected["decisiveRuleId"])
                self.assertEqual(output["reasonCodes"], expected["reasonCodes"])
                self.assertEqual(output["untestedReason"], expected["untestedReason"])

    def test_compiler_hard_fail_routes_to_r1(self) -> None:
        kernel = load_kernel("GV-01")
        fec = deepcopy(kernel["fec"])
        fec["scope"]["timeWindow"] = ""
        kernel["fec"] = fec

        output = decide_five_value_verdict(kernel)
        self.assertEqual(output["verdict"], "UNTESTED")
        self.assertEqual(output["decisiveRuleId"], "R1_FEC_NOT_COMPILABLE")
        self.assertEqual(output["untestedReason"], "FEC_NOT_READY")

    def test_compiler_integrity_flags_block_r7(self) -> None:
        kernel = load_kernel("GV-01")
        fec = deepcopy(kernel["fec"])
        fec["statisticalPlan"]["multipleTestingCorrection"] = "none"
        fec["multipleTestingPlan"] = {
            "correction": "bonferroni",
            "familySize": 2,
            "adjustedAlpha": 0.025,
            "preregistered": True,
        }
        kernel["fec"] = fec
        kernel["integrityFlags"] = []
        kernel["antiTheaterFindings"] = []

        output = decide_five_value_verdict(kernel)
        self.assertEqual(output["verdict"], "INCONCLUSIVE")
        self.assertEqual(output["decisiveRuleId"], "R8_INSUFFICIENT_POWER_OR_NULL")
        self.assertIn("p_hacking_risk", output["integrityFlags"])


def load_kernel(case_id: str) -> dict[str, object]:
    case = json.loads((CASE_DIR / f"{case_id}.json").read_text(encoding="utf-8"))
    return deepcopy(case["input"]["kernel"])


if __name__ == "__main__":
    unittest.main()
