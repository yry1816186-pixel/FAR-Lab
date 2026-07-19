"""七分量确定性 hash 引擎。

Authority: FAR_CHAIN_DEV_SPEC/09_repro_deterministic.md §2.

七分量 = MODEL_SNAPSHOT + active_model_ids_sorted + CalcSpec + seed + nthread
         + code_hash + env_hash

threadpoolctl.threadpool_limits(limits=1) 圈定 BLAS 线程为 1，消除并行浮点
累加序差异 → repro_hash 跨运行字节一致。

注意（与 09 §2 §4 区分）：
    §2 repro_hash（本模块）进入 call_records.cred.reproHash 字段。
    §4 verify_chain 校验的是包含 cred 的链式 current_hash。
    两者是独立的 hash 链。
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Iterator

from threadpoolctl import threadpool_info, threadpool_limits

from .canonical_json import hash_canonical_json
from .dataclasses_ext import to_canonical_dict


# ---------- 七分量结构（dataclass，字段顺序 = hash 输入顺序） ----------


@dataclass(frozen=True)
class CalcSpec:
    """计算规格（七分量之一）。

    frozen=True 保证不可变（反 mutate props）。
    字段顺序 = dataclass 定义顺序 = hash 输入顺序（保证 asdict 递归转 dict 后
    顺序稳定，sort_keys 内部还会再排序一次，但字段集必须对齐 09 §2.1）。
    """

    seed: int
    nthread: int  # 必须为 1（threadpool_limits 圈定，确定性最强）
    allowed_ops: tuple[str, ...]  # ALLOWED_OPS 白名单（与 ast_guard 对齐）
    input_hash: str  # 输入数据 sha256 hex（不进 data，只进 hash）
    code_hash: str  # op 实现源码 hash（防 hot-swap random_state）


@dataclass(frozen=True)
class ReproContext:
    """七分量 hash 输入上下文（运行时 hash 计算用·calc_bridge 消费）。

    与 SevenFactorSnapshot 的关系（02 §5.2 SSOT）：
        ReproContext = 运行时 hash 输入（侧重计算环境）
        SevenFactorSnapshot = 存储态记录（侧重审计可查）
    repro_hash 必须从 ReproContext 算（calc_bridge 消费）；
    repro_runs 落 SevenFactorSnapshot（审计可查）。
    """

    model_snapshot: str  # = COMPETITION_MODEL_SNAPSHOT 常量
    active_model_ids_sorted: tuple[str, ...]  # 排序后活跃 model id（repro_hash 序列化接缝）
    calc_spec: CalcSpec  # 嵌套 dataclass（asdict 递归转）
    env_hash: str  # conda-lock + CPU arch hash


# ---------- 确定性 threadpool 上下文 ----------


@contextmanager
def deterministic_blas_ctx(nthread: int = 1) -> Iterator[None]:
    """圈定 BLAS 线程数，消除并行浮点累加序差异。

    Args:
        nthread: BLAS 线程上限，默认 1（确定性最强）。>1 时浮点累加序不可复现。

    Yields:
        None。退出 with 块自动恢复原线程数。

    Raises:
        AssertionError: 当 nthread != 1 时 raise。
            反 theater：nthread>1 须显式声明非确定性路径。
            spec §2.1 函数签名无 _allow_nondeterministic 参数——若需 ablation，
            调用方应直接用 threadpoolctl.threadpool_limits 自行管理。
        RuntimeError: 当 threadpool_info() 返回空（进程未加载 BLAS 库）。
            此时 threadpool_limits 不可观测 → R9 测试 post==pre 不 raise → CI 永红。
            pin 'numpy>=1.24,<2.0'（含 MKL/OpenBLAS 后端）后重测。
    """
    assert nthread == 1, (
        f"deterministic_blas_ctx 默认要求 nthread=1（确定性最强），收到 {nthread}。"
        f"若需 ablation 路径，请直接用 threadpoolctl.threadpool_limits 自行管理。"
    )
    info_before = threadpool_info()
    if not info_before:
        raise RuntimeError(
            "threadpool_info() 返回空：进程未加载 BLAS 库。"
            "请 pin 'numpy>=1.24,<2.0'（含 MKL/OpenBLAS 后端）后重测。"
        )
    with threadpool_limits(limits=nthread, user_api="blas"):
        yield


# ---------- 七分量 hash 计算 ----------


def compute_repro_hash(ctx: ReproContext) -> str:
    """计算七分量确定性 repro_hash。

    Args:
        ctx: ReproContext（已含七分量）。

    Returns:
        sha256 hex 小写（64 字符），与 TS 侧 cross_lang_consistency 对齐。

    实现要点（反幻觉）：
        1. ctx 经 to_canonical_dict 递归转 dict（CalcSpec 嵌套也转）
        2. active_model_ids_sorted 必须是排序后的 tuple（repro_hash 序列化接缝）
           —— TS 侧对应 JSON.stringify(sortedActiveModelIds)，
              Python 侧 tuple(sorted(...))，canonical_json._tuple_to_list 已递归转 list
        3. 用 hash_canonical_json 而非 canonical_hash：
           canonical_hash 内部 _hashable 白名单只取 stageId/cred/payloadKind/prevHash
           四字段（与 verify_chain 对齐），ReproContext 字段集不匹配 → 会 raise
           ValueError。hash_canonical_json 直接 sha256(canonical_json(payload))，
           无白名单约束，是七分量 hash 的正确入口。
        4. canonical_json 内部 allow_nan=False + sort_keys + separators 紧凑
    """
    payload = to_canonical_dict(ctx)
    return hash_canonical_json(payload)


# ---------- 七分量 hash 校验（R9 回归测试核心） ----------


def verify_repro_hash(ctx: ReproContext, expected_hex: str) -> None:
    """校验 repro_hash 是否与期望值 byte-equal。

    Args:
        ctx: 重算用的 ReproContext。
        expected_hex: 写入期记录的 repro_hash（repro_runs.repro_hash）。

    Raises:
        HashMismatch: 当实际 != 期望时 raise，附带两 hex + 七分量诊断信息。
    """
    actual = compute_repro_hash(ctx)
    if actual != expected_hex:
        raise HashMismatch(
            field="repro_hash",
            expected=expected_hex,
            actual=actual,
            context=to_canonical_dict(ctx),
        )


class HashMismatch(Exception):
    """hash 不匹配异常（含诊断信息，反 theater：不静默吞）。

    Attributes:
        field: 不匹配字段名（'repro_hash'）。
        expected: 期望 hex（写入期记录）。
        actual: 实际 hex（验证期重算）。
        context: ReproContext 转 dict 后的七分量诊断快照。
    """

    def __init__(self, field: str, expected: str, actual: str, context: dict[str, Any]) -> None:
        self.field = field
        self.expected = expected
        self.actual = actual
        self.context = context
        super().__init__(
            f"[{field}] hash mismatch:\n"
            f"  expected={expected}\n"
            f"  actual=  {actual}\n"
            f"  context_keys={list(context.keys())}"
        )
