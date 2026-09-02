from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from farlab_experiment_runtime.sandbox_main import _mount_is_read_only  # noqa: E402


class MountAttestationTests(unittest.TestCase):
    def test_root_read_only_mount_is_detected_from_mount_options(self) -> None:
        mountinfo = "677 454 0:89 / / ro,relatime - overlay overlay rw,lowerdir=/layers"

        self.assertTrue(_mount_is_read_only(mountinfo))

    def test_root_writable_mount_cannot_pass_as_read_only(self) -> None:
        mountinfo = "697 567 0:87 / / rw,relatime - overlay overlay rw,lowerdir=/layers"

        self.assertFalse(_mount_is_read_only(mountinfo))

    def test_missing_or_ambiguous_root_mount_fails_closed(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "absent"):
            _mount_is_read_only("1 0 0:1 / /tmp rw - tmpfs tmpfs rw")
        with self.assertRaisesRegex(RuntimeError, "neither ro nor rw"):
            _mount_is_read_only("1 0 0:1 / / relatime - overlay overlay rw")


if __name__ == "__main__":
    unittest.main()
