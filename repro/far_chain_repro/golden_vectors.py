"""E4 golden hex vectors — cross-language canonical_hash regression anchors.

Each golden vector is a (name, input, expectedHex) triple where expectedHex is the
SHA-256 hex of canonical_json(strip_to_4_fields(input)) computed on a reference
implementation. TS side must produce identical hex for the same input.

Vectors cover all 9 purpose_tag values paired with distinct payload_kind values
to exercise the full CHECK constraint surface. Additionally, vectors form a valid
hash chain (each entry's prevHash = previous entry's currentHash) to enable
chain-integrity regression testing.

Authority: archived-spec §3 + E4 golden trace.
"""

from __future__ import annotations

GENESIS_PREV_HASH = "0" * 64

REPRO_CONTEXT_FIXTURE = {
    "stageId": "stage1_understanding",
    "cred": {
        "modelId": "offline-replay-fixture",
        "dashscopeRequestId": None,
        "reproHash": "1" * 64,
        "gitCommitSha": "2" * 40,
        "isoTimestamp": "2026-06-27T00:00:00Z",
    },
    "payloadKind": "understanding",
    "purposeTag": "hypothesis",
    "prevHash": GENESIS_PREV_HASH,
}

REPRO_CONTEXT_FIXTURE_EXPECTED_HEX = "96a6372bdf040677c26700456856ec365b478f9e3bf8824e4b2b9d123af4abf4"

GOLDEN_VECTORS: list[dict[str, object]] = [
    {
        "name": "meta_minimal_genesis",
        "input": REPRO_CONTEXT_FIXTURE,
        "expectedHex": REPRO_CONTEXT_FIXTURE_EXPECTED_HEX,
    },
    # ── Agent-loop realistic vectors ──
    # Each vector uses the competition model snapshot and forms a valid chain link.
    # Hashes computed by Python reference implementation and verified against TS side.
    {
        "name": "hypothesis_genesis",
        "input": {
            "stageId": "stage1_understanding",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": "req-abc123",
                "reproHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "gitCommitSha": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c",
                "isoTimestamp": "2026-06-27T10:30:00Z",
            },
            "payloadKind": "hypothesis",
            "purposeTag": "hypothesis",
            "prevHash": GENESIS_PREV_HASH,
        },
        "expectedHex": "164e34ad12145e4419708355178273a76c31d6cb2d3f458f3536930bc4082a05",
    },
    {
        "name": "experiment_code_gen",
        "input": {
            "stageId": "stage2_experiment",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": "req-def456",
                "reproHash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
                "gitCommitSha": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d",
                "isoTimestamp": "2026-06-27T10:35:00Z",
            },
            "payloadKind": "experiment",
            "purposeTag": "code_gen",
            "prevHash": "164e34ad12145e4419708355178273a76c31d6cb2d3f458f3536930bc4082a05",
        },
        "expectedHex": "0495346a4a72d838213ffcbfe61a702f319d766503580c95de673c8421efdcc5",
    },
    {
        "name": "observation_eval",
        "input": {
            "stageId": "stage3_observation",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": "req-ghi789",
                "reproHash": "f0e1d2c3b4a5968778695a4b3c2d1e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
                "gitCommitSha": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e",
                "isoTimestamp": "2026-06-27T10:40:00Z",
            },
            "payloadKind": "observation",
            "purposeTag": "eval",
            "prevHash": "0495346a4a72d838213ffcbfe61a702f319d766503580c95de673c8421efdcc5",
        },
        "expectedHex": "6d352ca20015312a51059e9e3132c5490c0f1a49a11b1ef0f7ecb7ebf3e023e9",
    },
    {
        "name": "understanding_narrative",
        "input": {
            "stageId": "stage1_understanding",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": None,
                "reproHash": "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f1a2b3c",
                "gitCommitSha": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
                "isoTimestamp": "2026-06-27T10:45:00Z",
            },
            "payloadKind": "understanding",
            "purposeTag": "narrative",
            "prevHash": "6d352ca20015312a51059e9e3132c5490c0f1a49a11b1ef0f7ecb7ebf3e023e9",
        },
        "expectedHex": "623b0b86507bb28baa2a7edb9b27a5b4dd2c8ebd1eb547b9ce1b76bc60e79d04",
    },
    {
        "name": "plan_scoring",
        "input": {
            "stageId": "stage5_planning",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": "req-jkl012",
                "reproHash": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
                "gitCommitSha": "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a",
                "isoTimestamp": "2026-06-27T10:50:00Z",
            },
            "payloadKind": "plan",
            "purposeTag": "scoring",
            "prevHash": "623b0b86507bb28baa2a7edb9b27a5b4dd2c8ebd1eb547b9ce1b76bc60e79d04",
        },
        "expectedHex": "24eb03e1d165ef56d44ca48e7f99daa1d8cbe82ae2e1b405039e81a789d40441",
    },
    {
        "name": "feedback_gt_read",
        "input": {
            "stageId": "stage6_feedback",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": "req-mno345",
                "reproHash": "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedc",
                "gitCommitSha": "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
                "isoTimestamp": "2026-06-27T10:55:00Z",
            },
            "payloadKind": "feedback",
            "purposeTag": "gt_read",
            "prevHash": "24eb03e1d165ef56d44ca48e7f99daa1d8cbe82ae2e1b405039e81a789d40441",
        },
        "expectedHex": "a8a3ee26825535c6916ac804383a8f9792be3e6f90ce0c0779f028bb82fafed7",
    },
    {
        "name": "integration_baseline_exempt",
        "input": {
            "stageId": "stage7_integration",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": None,
                "reproHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123",
                "gitCommitSha": "a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
                "isoTimestamp": "2026-06-27T11:00:00Z",
            },
            "payloadKind": "integration",
            "purposeTag": "baseline_exempt",
            "prevHash": "a8a3ee26825535c6916ac804383a8f9792be3e6f90ce0c0779f028bb82fafed7",
        },
        "expectedHex": "5c3981bb3512488460173fe5595325acb7571ce3cce95e43092638a401464367",
    },
    {
        "name": "meta_viz_select",
        "input": {
            "stageId": "stage8_meta",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": "req-pqr678",
                "reproHash": "89abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd",
                "gitCommitSha": "b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d",
                "isoTimestamp": "2026-06-27T11:05:00Z",
            },
            "payloadKind": "meta",
            "purposeTag": "viz_select",
            "prevHash": "5c3981bb3512488460173fe5595325acb7571ce3cce95e43092638a401464367",
        },
        "expectedHex": "11e8fb5b201b324d206fd70fdb9ab0a6b015078ab36f948be5c3dba6d8a0ba19",
    },
    {
        "name": "citation_dialogue",
        "input": {
            "stageId": "stage9_citation",
            "cred": {
                "modelId": "qwen3.7-max-2026-05-20",
                "dashscopeRequestId": "req-stu901",
                "reproHash": "cdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01",
                "gitCommitSha": "c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e",
                "isoTimestamp": "2026-06-27T11:10:00Z",
            },
            "payloadKind": "citation",
            "purposeTag": "dialogue",
            "prevHash": "11e8fb5b201b324d206fd70fdb9ab0a6b015078ab36f948be5c3dba6d8a0ba19",
        },
        "expectedHex": "88bd571729946ecf574b2099ef06684f678dc90f8abdc9b1090d3680823d6787",
    },
]

# 9-vector mini-chain: each entry's prevHash matches previous entry's currentHash.
# Validates chain-integrity regression across all purpose_tag values.
CHAIN_VECTORS = GOLDEN_VECTORS[1:]  # hypothesis_genesis through citation_dialogue form a valid chain


# ── Numeric canonical boundary vectors (spec 23 §80 / HANDOFF §3.3 / day-0 cross-lang PoC 2026-06-29) ──
# 走 hash_canonical_json（底层通用 canonical 函数），非 canonical_hash（T3 白名单 cred 全 string 不碰数值）。
#
# day-0 cross-lang PoC 方法论：TS 侧通过 spawnSync stdin 把 JSON 传给 Python，两侧分别 hash 比对。
# 测的是「同一 JSON 经双向序列化后是否 byte-equal」。
#
# 实测关键发现（证据驱动，2026-06-29）：spec HANDOFF §3.3 列的 N1(1.0) 与 N3(2**53+1)「差异」是 JS 引擎在
# 【构造字面量时】的值规约（1.0→1；2**53+1→2**53=...992），规约在序列化 stdin 前完成，故 Python json.loads 拿到
# 已规约的值（int 1 / ...992），两边 byte-equal —— 在 stdin-harness 下是 GREEN，不是 RED。声称 RED = 伪造。
# 唯一能跨 JSON 传输保留的真实差异是【序列化格式】：N2b 指数表示法零填充（TS "1e-7" vs Py "1e-07"）。
# canonical_hash 信任根 byte-equal 不受影响（cred 全 string）。
NUMERIC_GREEN_VECTORS: list[dict[str, object]] = [
    {"name": "N1b_float_arith_0.1+0.2", "obj": {"n": 0.1 + 0.2}},
    {"name": "N2_sci_1e21", "obj": {"n": 1e21}},
    {"name": "int_42", "obj": {"n": 42}},
    {"name": "unicode_cafe_nfc", "obj": {"s": "café"}},
    {"name": "isoTs_ms_string", "obj": {"t": "2026-07-08T12:00:00.123Z"}},
    # N1(1.0)/N3(2**53+1)：JS 值规约在 stdin 序列化前完成，Python 经 json.loads 拿到规约后值，两边 byte-equal。
    # 归 GREEN 诚实反映 stdin-harness 真实行为。Python int 任意精度保留 9007199254740993，但经 stdin 传入的是 ...992。
    {"name": "N1_float_1.0_normalized", "obj": {"n": 1.0}, "note": "JS 1.0→1 经 stdin 双向相等"},
    {"name": "N3_bigint_gt_2p53_normalized", "obj": {"n": 9007199254740993}, "note": "JS ...992 经 stdin Python 得 ...992 双向相等（Python 端原生 ...993，但 stdin 传入已规约值）"},
]

# 真实可观测的跨语言序列化格式鸿沟（day-0 PoC RED，证据驱动）。
# 经 stdin-harness 实测，唯一能跨 JSON 传输保留的差异是指数表示法零填充。如实锁定作为 V3 RFC 8785 JCS 迁移回归基线。
NUMERIC_KNOWN_DIVERGENCE: list[dict[str, object]] = [
    {"name": "N2b_sci_1e-7", "obj": {"n": 1e-7}, "tsSerial": '{"n":1e-7}', "pySerial": '{"n":1e-07}', "note": "指数表示法零填充：TS '1e-7' / Py '1e-07'"},
]
