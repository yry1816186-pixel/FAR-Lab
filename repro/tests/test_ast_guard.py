"""AST 梯度符号扫描器回归测试（R4：FORBIDDEN_PATTERNS 定义顺序 NameError）。

Authority: .1.

注意：AST 扫描只能识别字面写出的全限定名（如 `torch.autograd.grad(...)`）。
instance method 形态（如 `loss.backward()` / `opt.step()`）的 dotted_path 是
`loss.backward` / `opt.step`，与 FORBIDDEN_PATTERNS 中的全限定名不匹配——
AST 无法解析实例的真实类型。这是 AST 扫描的固有局限，不属于模块 bug。
本测试只覆盖真正能命中的字面全限定名调用，不为不可观测的场景写假绿测试
（AGENTS §6「Modifying test expectations merely to make tests pass」红线）。
"""

from __future__ import annotations

import unittest

from far_chain_repro.ast_guard import (
    FORBIDDEN_PATTERNS,
    ForbiddenPattern,
    GradientSymbolLeak,
    ScanViolation,
    scan,
)


class AstGuardImportTest(unittest.TestCase):
    """R4 核心：模块 import 不应 NameError（dataclass 已上移到 FORBIDDEN_PATTERNS 前）。"""

    def test_import_no_name_error(self) -> None:
        # 若 NameError，import 行即崩，本测试不会被收集
        self.assertGreater(len(FORBIDDEN_PATTERNS), 0)

    def test_forbidden_patterns_shape(self) -> None:
        self.assertIsInstance(FORBIDDEN_PATTERNS, tuple)
        for pattern in FORBIDDEN_PATTERNS:
            self.assertIsInstance(pattern, ForbiddenPattern)
            self.assertIn(pattern.node_kind, ("call", "attribute"))
            self.assertTrue(pattern.dotted_path)
            self.assertTrue(pattern.reason)

    def test_forbidden_patterns_cover_required_symbols(self) -> None:
        """覆盖 09 §3 规定的 7 个禁止梯度符号模式。"""
        dotted_paths = {p.dotted_path for p in FORBIDDEN_PATTERNS}
        required = {
            "torch.autograd.grad",
            "torch.Tensor.backward",
            "torch.optim.Optimizer.step",
            "torch.optim.Optimizer.zero_grad",
            "torch.compile",
            "torch.jit.script",
        }
        self.assertTrue(required.issubset(dotted_paths), f"缺: {required - dotted_paths}")


class AstGuardScanCallTest(unittest.TestCase):
    """ast.Call 节点覆盖：字面全限定名调用必须命中。"""

    def test_scan_detects_torch_autograd_grad(self) -> None:
        src = "import torch\nresult = torch.autograd.grad(loss, params)\n"
        with self.assertRaises(GradientSymbolLeak) as ctx:
            scan(src)
        violations = ctx.exception.violations
        self.assertTrue(
            any(v.dotted_path == "torch.autograd.grad" and v.node_kind == "call" for v in violations)
        )
        # 行号必须正确（torch.autograd.grad 在第 2 行）
        hit = next(v for v in violations if v.dotted_path == "torch.autograd.grad")
        self.assertEqual(hit.lineno, 2)
        self.assertIsInstance(hit, ScanViolation)
        self.assertIn("torch.autograd.grad", hit.source_snippet)

    def test_scan_detects_torch_tensor_backward_call(self) -> None:
        src = "import torch\ntorch.Tensor.backward(loss)\n"
        with self.assertRaises(GradientSymbolLeak) as ctx:
            scan(src)
        self.assertTrue(
            any(v.dotted_path == "torch.Tensor.backward" and v.node_kind == "call"
                for v in ctx.exception.violations)
        )

    def test_scan_detects_torch_optim_optimizer_step_call(self) -> None:
        src = "import torch\ntorch.optim.Optimizer.step(opt)\n"
        with self.assertRaises(GradientSymbolLeak) as ctx:
            scan(src)
        self.assertTrue(
            any(v.dotted_path == "torch.optim.Optimizer.step" for v in ctx.exception.violations)
        )

    def test_scan_detects_torch_optim_optimizer_zero_grad_call(self) -> None:
        src = "import torch\ntorch.optim.Optimizer.zero_grad(opt)\n"
        with self.assertRaises(GradientSymbolLeak):
            scan(src)

    def test_scan_detects_torch_compile_call(self) -> None:
        src = "import torch\nmodel = torch.compile(model)\n"
        with self.assertRaises(GradientSymbolLeak) as ctx:
            scan(src)
        self.assertTrue(
            any(v.dotted_path == "torch.compile" for v in ctx.exception.violations)
        )

    def test_scan_detects_torch_jit_script_call(self) -> None:
        src = "import torch\nm = torch.jit.script(fn)\n"
        with self.assertRaises(GradientSymbolLeak):
            scan(src)


class AstGuardScanAttributeTest(unittest.TestCase):
    """ast.Attribute 节点覆盖：字面 attribute 引用（不调用）必须命中。"""

    def test_scan_detects_torch_tensor_backward_attribute(self) -> None:
        # 仅引用 backward 属性，不带括号——ast.Attribute 但非 ast.Call
        src = "import torch\nref = torch.Tensor.backward\n"
        with self.assertRaises(GradientSymbolLeak) as ctx:
            scan(src)
        self.assertTrue(
            any(v.dotted_path == "torch.Tensor.backward" and v.node_kind == "attribute"
                for v in ctx.exception.violations)
        )


class AstGuardCleanSourceTest(unittest.TestCase):
    """干净源码（无梯度符号）不 raise。"""

    def test_scan_clean_numpy_source_passes(self) -> None:
        src = "import numpy as np\nx = np.random.randn(100, 100)\ny = x @ x\n"
        scan(src)  # 不 raise 即通过

    def test_scan_clean_python_source_passes(self) -> None:
        src = "def add(a, b):\n    return a + b\n"
        scan(src)

    def test_scan_empty_source_passes(self) -> None:
        scan("")


class AstGuardSyntaxErrorTest(unittest.TestCase):
    """源码语法错时 raise SyntaxError（ast.parse 行为契约）。"""

    def test_scan_syntax_error_raises(self) -> None:
        with self.assertRaises(SyntaxError):
            scan("def broken(:\n")


if __name__ == "__main__":
    unittest.main()
