from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from farlab_experiment_runtime.exploration import (  # noqa: E402
    _BoundedTextBuffer,
    run_exploration,
)


class BoundedTextBufferTests(unittest.TestCase):
    def test_single_oversized_write_keeps_only_the_tail(self) -> None:
        stdout = _BoundedTextBuffer(8)

        chars_written = stdout.write("prefix-TAIL")

        self.assertEqual(chars_written, 11)
        self.assertEqual(stdout.getvalue(), "fix-TAIL")
        self.assertEqual(sum(map(len, stdout._chunks)), stdout.max_output_chars)
        self.assertLessEqual(len(stdout.getvalue()), stdout.max_output_chars)
        self.assertTrue(stdout.truncated)

    def test_repeated_writes_never_grow_past_the_limit(self) -> None:
        stdout = _BoundedTextBuffer(10)

        for value in range(1_000):
            stdout.write(f"{value:04d},")
            self.assertLessEqual(
                sum(map(len, stdout._chunks)), stdout.max_output_chars
            )
            self.assertLessEqual(len(stdout.getvalue()), stdout.max_output_chars)

        self.assertEqual(stdout.getvalue(), "0998,0999,")
        self.assertTrue(stdout.truncated)


class RunExplorationOutputTests(unittest.TestCase):
    def test_normal_output_is_complete_and_not_truncated(self) -> None:
        result = run_exploration({"code": 'print("alpha")\nprint("omega")'})

        self.assertEqual(
            result,
            {
                "ok": True,
                "stdout": "alpha\nomega\n",
                "stdoutTruncated": False,
            },
        )

    def test_single_oversized_print_is_bounded(self) -> None:
        result = run_exploration({"code": 'print("x" * 12000, end="")'})

        self.assertTrue(result["ok"])
        self.assertEqual(result["stdout"], "x" * 8_000)
        self.assertEqual(len(result["stdout"]), 8_000)
        self.assertTrue(result["stdoutTruncated"])

    def test_repeated_prints_keep_the_latest_output(self) -> None:
        result = run_exploration(
            {
                "code": (
                    'for i in range(9000):\n'
                    '    print(chr(65 + (i // 1000)), end="")'
                )
            }
        )

        self.assertTrue(result["ok"])
        self.assertEqual(
            result["stdout"],
            "".join(chr(letter) * 1_000 for letter in range(ord("B"), ord("I") + 1)),
        )
        self.assertEqual(len(result["stdout"]), 8_000)
        self.assertTrue(result["stdoutTruncated"])

    def test_runtime_error_keeps_bounded_partial_output_and_error(self) -> None:
        result = run_exploration(
            {
                "code": (
                    'print("discarded" * 1000, end="")\n'
                    'print("tail" * 1000, end="")\n'
                    'raise RuntimeError("boom")'
                )
            }
        )

        self.assertFalse(result["ok"])
        self.assertEqual(result["errorKind"], "RuntimeError")
        self.assertEqual(result["errorMessage"], "boom")
        self.assertEqual(result["stdout"], "tail" * 1_000)
        self.assertNotIn("stdoutTruncated", result)


if __name__ == "__main__":
    unittest.main()
