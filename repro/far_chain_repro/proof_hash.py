"""ProofEnvelope V2 proofHash 独立重算（RULE-PE-010 independently_recomputable）。

Authority: FAR_LAB_MASTER_PLAN/04 §2.5 + APPENDIX_C §1.9 + §2.4。

本模块是 TS computeProofHashV2 的 Python 镜像，用于跨语言 byte-equal 对拍
（RULE-PE-010：ProofEnvelope 必须可被一条不依赖项目 CI 的路径从原始 claim 重算到 proofHash 匹配）。

跨语言对齐（APPENDIX_C §1.9）：
  - separators=(",", ":")（无空格·与 TS fast-json-stable-stringify 默认一致）
  - sort_keys=True（递归字典序·与 TS stableStringify 一致）
  - ensure_ascii=False（UTF-8 直传·不强制 ASCII 转义）
  - allow_nan=False（NaN/Infinity 抛 ValueError·与 TS assertNoNonFiniteNumber 一致）

零容忍合规：无 # type: ignore / 无 pass 空块 / 无桩。纯函数（不 mutate 输入）。
"""

import hashlib
import json
import re
import unicodedata
from typing import Any

__all__ = [
    "canonical_json",
    "canonical_hash",
    "normalize_whitespace",
    "normalize_claim",
    "compute_fec_hash",
    "compute_proof_hash_v2",
    "verify_proof_hash_v2",
]


def canonical_json(obj: Any) -> str:
    """canonical JSON 序列化（APPENDIX_C §1.9 Python 唯一允许写法）。"""
    return json.dumps(
        obj,
        sort_keys=True,
        allow_nan=False,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def canonical_hash(obj: Any) -> str:
    """canonical_json → sha256 → 64 hex 小写。"""
    return hashlib.sha256(canonical_json(obj).encode("utf-8")).hexdigest()


def normalize_whitespace(text: str) -> str:
    """normalizeWhitespace（§2.4 line 257）：\\r\\n→\\n、\\r→\\n、折叠 [ \\t]+→单空格、trim。

    同时做 Unicode NFC 归一化（评委08 F-4-007·防止 NFC/NFD 等价表示导致跨语言 hash 分裂）。
    与 TS normalizeWhitespace byte-equal（TS 端 String.prototype.normalize('NFC')）。
    """
    text = unicodedata.normalize("NFC", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def normalize_claim(claim: dict) -> dict:
    """normalizeClaim（§2.4）：claim.naturalLanguage 规范化（其余字段原样）。"""
    return {**claim, "naturalLanguage": normalize_whitespace(claim["naturalLanguage"])}


def compute_fec_hash(fec: dict) -> str:
    """FEC V2 内容 hash（镜像 TS computeFecHash·排除 freeze.fecHash 自引用）。

    与 src/fec/compiler.ts computeFecHash byte-equal：
      - vcFields = fec 的 16 字段（freeze 排除 fecHash·保留 actor/timestamp/
        environmentPolicy/deviationPolicyHash/frozenBy 5 字段）
      - hashCanonicalJson(vcFields)

    optional 字段对齐（APPENDIX_C §1.9）：TS computeFecHash 显式列 powerPlan/multipleTestingPlan，
    但 fast-json-stable-stringify **忽略值为 undefined 的键**。Python 端须镜像此语义——
    仅当原 dict 含该键且非 None 时包含；缺失/None 不进 canonical（否则多出 "x":null 导致 hash 分裂）。
    """
    freeze = fec["freeze"]
    vc_fields = {
        "fecId": fec["fecId"],
        "contractVersion": fec["contractVersion"],
        "claimId": fec["claimId"],
        "measurableImplication": fec["measurableImplication"],
        "scope": fec["scope"],
        "requiredEvidence": fec["requiredEvidence"],
        "datasetRequirements": fec["datasetRequirements"],
        "workflowRequirements": fec["workflowRequirements"],
        "metric": fec["metric"],
        "threshold": fec["threshold"],
        "direction": fec["direction"],
        "statisticalPlan": fec["statisticalPlan"],
        "seedPolicy": fec["seedPolicy"],
        "deviationPolicy": fec["deviationPolicy"],
        # freeze.fecHash 是本函数输出（自引用规避）：排除 fecHash，保留其余 5 字段。
        "freeze": {
            "actor": freeze["actor"],
            "timestamp": freeze["timestamp"],
            "environmentPolicy": freeze["environmentPolicy"],
            "deviationPolicyHash": freeze["deviationPolicyHash"],
            "frozenBy": freeze["frozenBy"],
        },
    }
    # optional 字段：与 TS stableStringify（忽略 undefined）对齐——仅当原 dict 含该键且非 None 时包含。
    if fec.get("powerPlan") is not None:
        vc_fields["powerPlan"] = fec["powerPlan"]
    if fec.get("multipleTestingPlan") is not None:
        vc_fields["multipleTestingPlan"] = fec["multipleTestingPlan"]
    return canonical_hash(vc_fields)


def _filter_anti_theater_report(report: dict) -> dict:
    """antiTheaterReport optional 字段对齐（镜像 compute_fec_hash:101-105·APPENDIX_C §1.9·D9/R1）。

    AntiTheaterReport（src/anti_theater/types.ts·APPENDIX_A §7 权威）5 个必填字段
    （findings/hasFail/failCount/warnCount/llmOverrideRejected）恒包含；3 个可选字段
    （antiTheaterScore/canSealConfirmed/verdictConstraint）仅当原 dict 含该键且非 None 时包含。

    为何过滤：TS fast-json-stable-stringify **递归忽略值为 undefined 的键**。Python 端若 report
    含 "antiTheaterScore": None（Python 独立构造场景），json.dumps 会产出 "antiTheaterScore":null，
    而 TS 端对应 undefined 被省略 → hash 分裂（RULE-PE-010 byte-equal 破坏）。本过滤兜底保证两端一致。

    边界：canSealConfirmed 可为 False（falsy）——必须用 `is not None` 而非真值判断（否则误丢 False），
    与 compute_fec_hash:102 `if fec.get(...) is not None` 同一纪律。

    数据流 TS→JSON→Python 时 JSON.stringify 已先行剥离 undefined，本过滤是防御性兜底。
    """
    filtered = {
        "findings": report["findings"],
        "hasFail": report["hasFail"],
        "failCount": report["failCount"],
        "warnCount": report["warnCount"],
        "llmOverrideRejected": report["llmOverrideRejected"],
    }
    if report.get("antiTheaterScore") is not None:
        filtered["antiTheaterScore"] = report["antiTheaterScore"]
    if report.get("canSealConfirmed") is not None:
        filtered["canSealConfirmed"] = report["canSealConfirmed"]
    if report.get("verdictConstraint") is not None:
        filtered["verdictConstraint"] = report["verdictConstraint"]
    return filtered


def compute_proof_hash_v2(envelope: dict) -> str:
    """计算 ProofEnvelopeV2 的 proofHash（self-excluding）。

    与 TS computeProofHashV2 byte-equal：相同 envelope（去掉 proofHash）→ 相同 64 hex。

    Args:
        envelope: ProofEnvelopeV2 dict（不含 proofHash，或含但会被忽略）。

    Returns:
        64 字符小写 hex sha256。

    Raises:
        ValueError: fecHash 断言失败（envelope.fecHash !== compute_fec_hash(fecSnapshot)）。
    """
    # 第 2 步：断言 FEC 一致性（compute_fec_hash 排除 freeze.fecHash·自引用规避）
    recomputed_fec_hash = compute_fec_hash(envelope["fecSnapshot"])
    if recomputed_fec_hash != envelope["fecHash"]:
        raise ValueError(
            f"compute_proof_hash_v2: fecHash mismatch "
            f"(envelope={envelope['fecHash']}, recomputed={recomputed_fec_hash})"
        )

    # 第 1 步：提取 VC 子集（白名单·self-excluding·normalize_claim）
    # metadata（kernelVersion/rulePriorityTableHash/proofHashInputs）在 verdictTrace 内，
    # 不单独列出（避免 double-count·与 TS 对齐）。
    # antiTheaterReport 全对象引用（D9·结构变化自动反映），optional 字段经 _filter_anti_theater_report
    # 条件包含（镜像 TS fast-json-stable-stringify 忽略 undefined·保证 RULE-PE-010 byte-equal）。
    proof_input = {
        "schemaVersion": envelope["schemaVersion"],
        "claim": normalize_claim(envelope["claim"]),
        "fecHash": envelope["fecHash"],
        "fecSnapshot": envelope["fecSnapshot"],
        "protocolFreeze": envelope["protocolFreeze"],
        "datasetBindings": envelope["datasetBindings"],
        "workflowBindings": envelope["workflowBindings"],
        "experimentRuns": envelope["experimentRuns"],
        "measurementResults": envelope["measurementResults"],
        "statisticalResults": envelope["statisticalResults"],
        "verdictTrace": envelope["verdictTrace"],
        "antiTheaterReport": _filter_anti_theater_report(envelope["antiTheaterReport"]),
        "ledgerRoot": envelope["ledgerRoot"],
    }

    # 第 3-5 步：canonical_hash（内置 NaN/Infinity 拒绝 via allow_nan=False）+ sha256
    return canonical_hash(proof_input)


def verify_proof_hash_v2(envelope: dict) -> bool:
    """独立重算校验：给定完整 envelope，验证 proofHash 是否正确。"""
    envelope_without_proof_hash = {k: v for k, v in envelope.items() if k != "proofHash"}
    try:
        recomputed = compute_proof_hash_v2(envelope_without_proof_hash)
    except ValueError:
        # fecHash 断言失败或 NaN → proofHash 必不匹配（篡改检测）。
        return False
    return recomputed == envelope.get("proofHash")
