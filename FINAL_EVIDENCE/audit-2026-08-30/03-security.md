# 安全/沙箱红队审计（2026-08-30，只读静态）

> 来源：终局接管第一轮并行审计（Explore 子代理，62 次工具调用）。未执行任何攻击动作；攻击路径为静态推理，用于建 malicious regression suite。

```
CAP-01 | 执行隔离平面（CodeAct sidecar） | PARTIAL | experiment-runtime/farlab_experiment_runtime/exploration.py（exec+compile 于受限命名空间）、src/experiment/python.ts（spawn 'uv run python -m farlab_experiment_runtime'，env 展开 process.env）、src/agent/exploration-runner.ts（gate 先于 spawn，fail-closed） | "restricted namespace" 实为进程内 Python exec：过滤 builtins+import 白名单，无 OS 级隔离——无 namespace/seccomp/cgroup/rootless container/gVisor/microVM；Windows 上零平台原语（无 Job object/AppContainer）；sidecar 以研究者全权限运行且继承全部 process.env（含 API key，python.ts:55-56）；注释自认"static checker is guardrails, not a jail" | 逃逸即研究者权限 RCE + env 全部密钥可读 | exploration lane 独立进程 + rootless 容器/gVisor/microVM（Windows: WSL2/AppContainer+Job），sidecar env 白名单化 | 恶意代码注入测试断言无文件/网络/子进程副作用 | exploration.py:150-187、src/experiment/python.ts:51-66
CAP-02 | generated code 逃逸面（静态门强度） | FAIL | TS 门 src/agent/exploratory-codeact.ts（regex 标记+dunder 禁+深链检测 findDeepModuleChain:121-131）、Python AST 镜像 exploration.py _check_source:102-147、回归 tests/codeact-escape-regression.test.ts | 双层门均为名字根匹配：别名赋值即绕过（p=np; p.f2py.os.system）；两步拆链（m=np.f2py; m.os.system）depth<3 通过；getattr+字符串拼接绕过；safe_builtins 保留 getattr/setattr/type | 已知 P0 逃逸的等价变体全部放行 → 真实命令执行 | 运行时拦截（RestrictedPython 式 getattr 守卫）或 OS 级隔离兜底 | 恶意语料回归套件 6-8 变体断言拒绝/无副作用 | exploratory-codeact.ts:119-131、exploration.py:136-147
CAP-03 | 子进程/文件系统/网络（沙箱内禁令） | PARTIAL | 禁令仅静态层（NETWORK_MARKERS/SUBPROCESS_MARKERS）；ops.py reviewed template registry；exploration stdout 截 8KB | 无 seccomp/AppArmor/Job object/网络命名空间；内存/CPU 无上限（长循环靠 sidecar.call 超时 reject，Python 侧不会停） | DoS + 逃逸后无第二道闸 | sidecar rlimit/cgroup + 无网络命名空间 | 逃逸语料断言 os.system 无输出、socket 连接失败 | exploratory-codeact.ts:57-72、python.ts:108-129
CAP-04 | network egress 策略 | FAIL | 无 deny-by-default/allowlist 实现；出网点=src/sources/*（固定基址）、src/providers/http.ts（custom baseUrl）、src/server/zotero.ts（loopback）、MCP HTTP；exfil-guard.ts:8-9 注释自认 egress allowlist 不存在 | 全开 egress；逃逸代码可外联任意主机；fetch 默认跟随重定向 | 数据外泄通道无网络层闸门 | 出站域名 allowlist + 沙箱进程无网络 | mock DNS 断言非白名单主机被拒 | src/sources/http.ts:49-84、exfil-guard.ts:7-9
CAP-05 | SSRF 面 | PARTIAL | encodePathSegment、ARXIV_ID_RE 拒 traversal 字符、Zotero 默认 loopback | httpGet 无 IP 字面量/私网段/协议校验；fetch 跟随重定向可转向内网；FARLAB_HTTPS_PROXY 可注入 | 上游重定向→内网探测（上游为固定学术 API，程度低） | fetch 层统一 destination guard（https + 私网段拒绝 + 禁跨 host 重定向） | redirect-to-169.254.169.254 fake fetch 断言拒绝 | src/sources/http.ts:58
CAP-06 | secret broker | PARTIAL | env 注入（.far-run/secrets.env gitignored）；出站绊线 exfil-guard.ts（模式+canary+2MB 上限 fail-closed）；redactSecrets chokepoint（http.ts:211-224）；receipts 仅哈希 | OpenAlex api_key 以 URL query 发送（fulltext.ts:360），失败时 url 含 key 进 SourceAdapterError.url 持久化；sidecar env 全量继承；secret-scan 无通用 Bearer/Z.ai/GLM 形态 | key 经错误日志/代理日志侧漏；逃逸+无 egress 闸=完整外泄链 | key 走 header；sidecar env 最小化；绊线模式补齐 | 错误对象/日志中无 api_key 值断言 | fulltext.ts:352-365、python.ts:55-63
CAP-07 | 路径安全（围栏/TOCTOU） | PARTIAL | workspace 工具围栏含 realpath 复检（workspace-tools.ts:44-51,150-162）；artifact store hash 正则围栏；netcdf 双读 sha256 TOCTOU 栅栏+200MB 上限 | assertLocalNetcdfPath 仅词法 startsWith 无 realpath——FARLAB_DATA_ROOT 内 symlink 指向外部即穿越；FARLAB_DATA_ROOT 是 opt-in；materializeDir 写入无围栏 | 恶意数据目录 symlink→任意文件读取进 lineage | assertLocalNetcdfPath 加 realpath 复检+默认围栏 | root 内 symlink→root 外断言拒绝 | dataset-netcdf.ts:56-71
CAP-08 | prompt injection 防线 | PARTIAL | 单一来源条款 untrusted.ts；invokeStructured 注入条款+随机定界符 fence（http.ts:411-427）；工具结果 trust 标记；语料回归 tests/injection-corpus.test.ts | fence 定界符用 Math.random 非 crypto（可预测，纵深弱点）；live-model 服从性未测（BLOCKED-live 自注）；web 前端直显外部文本不在防线内 | 文献注入→agent 滥用审批卡/工具 | fence 改 crypto randomBytes；live 注入评估进 eval | 定界符熵断言 | http.ts:418-422
CAP-09 | archive bomb / malformed file | PASS(服务端)/PARTIAL(web端) | 自研 ZIP 读取器 src/ingest/zip.ts：512 条目、64MB/条、256MB 总量、声明尺寸 vs 解压尺寸不符即拒、zip64/异压缩拒绝；xlsx/epub/docx 共用 | web workbench 客户端 jszip/mammoth/pdfjs 无同等级上限——客户端解压炸弹可崩浏览器会话（非服务器） | 低（本地单用户） | web 端解析前 cap 文件大小/条目数 | nested-zip 炸弹样本断言拒绝 | zip.ts:14-96、web/package.json:35-39
CAP-10 | 供应链（audit/SBOM/SAST/license） | PARTIAL | 运行时依赖=zod 单项；web overrides sharp/adm-zip；CI 门 license-ledger+secret-scan+path-hygiene | 无 SBOM、无 SAST（codeql/semgrep/snyk）、CI 无 npm audit 门；jszip/mammoth/pdfjs 无 override 钉版 | 新 CVE 无自动告警；无 SBOM 供消费者核对 | CI 加 npm audit --omit=dev + cyclonedx SBOM 入库 | CI 日志核对 | ci.yml:61-65
CAP-11 | release artifact signing / update integrity | FAIL | 无实现：RELEASE_OPERATIONS.md 无 signing 条目；无 gpg/sigstore/minisign/checksums；无自动更新器 | 公开产物无完整性凭证，下游无法验证未被替换 | 供应链替换攻击 | 发布附 SHA256SUMS + sigstore 签名；Tauri updater 启用时加签名校验 | 发布物验签冒烟 | RELEASE_OPERATIONS.md、desktop/package.json
CAP-12 | 远程 SSH 执行面 | PARTIAL | gateway.ts：系统 ssh/scp、key-only+StrictHostKeyChecking=yes+TOFU、BatchMode；shellQuote POSIX 单引号；remoteTimeoutWrap 远端 timeout 杀进程树；模板 reviewed-only | exec 为逐字命令直传，拼接点当前 id 服务端生成故安全，但无结构化防线防未来回归 | 命令注入需未来引入用户可控片段才会成真 | 远程命令构造集中在带回归测试的 quoting 层 | gateway-discipline.test.ts + 注入语料 | gateway.ts:36-52、remote-executor.ts:114-120
CAP-13 | 威胁模型文档 | PARTIAL | SECURITY.md 威胁表（诚实标注 not against malicious code）；RISK_REGISTER R-14/R-15；RELIABILITY_SECURITY.md §8/§11 | 未覆盖：archive bomb、release signing、egress allowlist、exploration 沙箱逃逸深度（代码承认但 RISK_REGISTER 无条目）、TOCTOU symlink 变体 | 无登记=无触发器 | R-19（静态沙箱可绕过）、R-20（无 egress 闸）、R-21（无发布签名） | 文档审查 | SECURITY.md:20-35
```

## Top-3 最高杠杆改进（按真实风险）

1. **给 exploration lane 换真隔离（CAP-01/02/03）**：现状=agent 生成的 Python 在研究者全权限进程 exec，唯一防线是可绕过的静态门，且 sidecar env 继承全部 API key。改进：专用 sidecar 进程进 rootless 容器/gVisor/microVM（Windows 走 WSL2 或 AppContainer+Job），env 白名单化，无网络。
2. **网络 egress deny-by-default + destination guard（CAP-04/05/06）**：httpGet/providers fetch 收口处加固定主机 allowlist + 私网段/IP 字面量拒绝 + 禁跨 host 重定向；OpenAlex key 从 URL query 移到 header。
3. **建 malicious regression suite 锁死静态门已知绕过（CAP-02/07）**：别名/拆链/getattr/拼接变体断言；netcdf realpath 复检；fence 定界符改 crypto random。

## 可用攻击路径（供 malicious regression suite）

- **A（高危）exploration 沙箱别名逃逸**：`p = np` 后 `p.f2py.os.system("cmd")`；两步拆链 `m = np.f2py` + `m.os.system`；`getattr(np, 'f2'+'py').os.system`。TS 门只对字面名建 regex；Python 门深链检测要求 func 根名在 _ALLOWED_ROOTS 且 safe_builtins 保留 getattr/type。现有回归只锁直连形态。逃逸后 os.environ 直读全部 provider key，无 egress 闸即可外传。
- **B（中危）OpenAlex api_key 泄漏面**：key 以 `?api_key=` 拼 URL；网络失败时含 key 的完整 url 进 SourceAdapterError 持久化。
- **C（中危）netcdf 符号链接穿越 FARLAB_DATA_ROOT**：词法 startsWith 放行 root 内 symlink 指向的任意文件；对照组 workspace-tools 已有 realpath 复检，照抄即修。
- **D（低危/纵深）fence 定界符可预测**：Math.random 生成 8 字符定界符，V8 xorshift128+ 可预测；修复即 crypto.randomBytes。
- **E（低危/回归防线）SSH 命令拼接点**：gateway.exec 逐字直传；测试锁定"任何用户/模型可控值进入远程命令必须过 shellQuote"。

诚实性说明：仓库安全文档对自身弱点的披露相当诚实；本次审计的增量：别名绕过路径的静态证据（A）、api_key URL 泄漏面（B）、symlink 穿越（C）、egress/签名/SBOM 三项缺席的系统化确认。
