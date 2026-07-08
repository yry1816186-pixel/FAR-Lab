# Concept: `.far-proof` (Proof Bundle)

> 一个 `.far-proof` 是 **self-verifiable** 的离线证据包：claim 图 + 脱敏证据链 + proofHash。
> 第三方可在**不信任导出方**的前提下独立重算验证。

## 它解决什么

科学声明容易「结论与证据脱节」。`.far-proof` 把一条声明从 claim → evidence → verdict → seal
的全过程打包成可独立复算的工件：拿到 bundle 的人重算哈希即可确认它**未被篡改**且**自洽**。

## 结构（V1 minimal · 10 文件）

`far export far-proof --demo-chain --out <dir>` 生成：

| 文件 | 作用 |
|------|------|
| `claim_graph.json` | claim + evidence 节点（含哈希链 `current_hash` / `prev_hash`） |
| `proof_envelopes.jsonl` | sealed verdict（proofHash 覆盖） |
| `call_records.redacted.jsonl` | LLM 调用记录（脱敏） |
| `repro_runs.jsonl` | 复算运行记录 |
| `data_manifest.json` | 数据指纹清单 |
| `ro-crate-metadata.json` | RO-Crate 元数据（标准 provenance） |
| `prov.ttl` | PROV-O RDF provenance |
| `otel-trace.jsonl` | OpenTelemetry trace |
| `code/MANIFEST.md` | 代码清单 |
| `README_REPLAY.md` | 重放说明 |

## proofHash —— 篡改检测的根

`proofHash` 是对 canonical JSON 的 SHA-256。`far verify --bundle` 做的事：

1. 读取 bundle 内的存储 proofHash。
2. **独立重算** proofHash（用 bundle 内的 claim/envelope 内容）。
3. 比对：一致 → `tamperStatus: clean`；不一致 → `tamperStatus: tampered` / exit 7。

任何被 proofHash 覆盖的字节改动 → 重算 ≠ 存储 → 立即检出。这是 fail-closed 红线。

## 多轴重算

| 轴 | 实现 | 缺失时 |
|----|------|--------|
| `recomputation.node` | TS 侧 `src/proof_envelope/` | 核心轴，必跑 |
| `recomputation.python` | Python 侧 `repro/far_chain_repro/proof_hash.py` 镜像 | 标 `not-run`（环境依赖，不伪造） |
| `recomputation.browser` | 浏览器 Web Crypto（frontend/public） | Phase 2 / #13 未接入 → `not-run` |

诚实边界：`far verify` 在 python/browser 轴 not-run 时返回 `WARN`（不是 `PASS`）——**不伪造通过**。

## 相关命令

```bash
far export far-proof --demo-chain --out <dir>          # 导出（demo 源）
far export far-proof --db <path> --run-id ... --out <dir>   # 导出（真实 DB 源）
far verify --bundle <dir>                               # 第三方独立重算
far verify <dir>                                        # 位置参数等价（far verify <path>）
far export receipt --bundle <dir> --format markdown     # Trust Receipt 投影
```

## 边界（诚实）

- V1 是 **self-verifiable bundle**（proofHash + redacted chain + 第三方 node 重算），**不是**外部
  RO-Crate / PROV-O 认证机构签发。
- 浮点序列化：字符串键哈希完全证明；浮点序列化正迁移至 RFC 8785 JCS（见 README 已知边界）。
- `recomputation.python` 需 Python + sympy/z3（`pip install -e .`）；`recomputation.browser` 待接入。

参见：[evidence-ledger.md](evidence-ledger.md) · [../demos/tess-offline.md](../demos/tess-offline.md)
