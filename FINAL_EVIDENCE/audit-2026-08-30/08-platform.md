# 跨平台/发布/CI 审计（2026-08-30，只读）

> 来源：终局接管第一轮并行审计（Explore 子代理，54 次工具调用）。
> 核心结论：**ACC-38 的 "CI green on hosted runner" 当前不成立** — 真实 GitHub Actions 上 ci.yml 自 2026-08-29 起连续失败（最后一次全绿 = run 33174874867 @8e8a480，2026-08-28）；"desktop real build" 指本地手工验证，CI 中从不构建桌面端。
> 主代理抽验（08-30）：gh run list 证实最近 6 跑全 failure；HEAD(98d4cb8) 仅 verify job 红，失败测试 = tests/dataset-netcdf.test.ts 两个用例（ENOENT copyfile + sidecar r.ok false），因在 describe.skipIf 守卫外引用本地 fixture work/scenario-b/air_temperature.nc；web-e2e 在 HEAD 已绿（6c769ae 时代的 core-journey/perf 失败已被后续提交修复）。

```
CAP-01 | CI workflow 全景与矩阵 | FAIL | .github/workflows/ci.yml（verify+web-e2e+release-pack 三 job）、surgery.yml（休眠 noop） | 矩阵仅 ubuntu-latest × node 24 × chromium 单点；无 windows/macos、无 node 多版本、无浏览器多项目；无 concurrency 取消、无 timeout 顶层约束 | 平台回归只能靠本地手工 | ubuntu+windows(matrix) × node 24 × chromium+firefox | ci.yml:17,77,109
CAP-02 | hosted runner 真实状态 | FAIL | run 33295687364(98d4cb8) verify 红(netcdf fixture)；33264214248(6c769ae) web-e2e 红(已修复) | 主干红导致 release-pack(needs verify) 永远无法触发；ACC-38 evidence 无 run id/SHA 锚定 | 修 fixture 门控后推一次全绿 run 并钉 SHA | gh run view --log-failed
CAP-03 | 桌面 Tauri 配置 | PARTIAL | desktop/src-tauri/ | tray/hotkey(Alt+Shift+F)/single-instance/window-state/notification/deep-link(HKCU)/强杀守护(Job Object/PDEATHSIG)/fatal MessageBox 全有；无 updater、无 signing/notarization、无 fileAssociations；deep-link 仅 Windows；targets:"all" 但 macOS 声明为死路径 | 未签名安装包 SmartScreen 拦截；无更新通道；发布版定位依赖编译期 CARGO_MANIFEST_DIR（源码树内构建才有效） | updater+签名 or 明示源码树运行表面定位 | tauri.conf.json 无 updater/sign 块；desktop/README.md:27,31
CAP-04 | 安装→首启→更新→回滚→卸载 | PARTIAL | README Quick Start、docs/backup-restore.md、wsl-headless-test.sh、core-journey.spec.ts:19(首启 G1) | 安装=文档级手动；更新=无（无 updater）；应用回滚=无；卸载=无文档且 HKCU far:// 注册键永不清理；桌面缺 Node sidecar 打包(line-b2 方案 B 未做) | 卸载注册键清理+更新通道文档化 | tauri.conf.json
CAP-05 | clean-room 重建能力 | PARTIAL | scripts/export-public.mjs + public-release-manifest.json（allowlist 拷贝+副本内 fresh install/typecheck/lint/test/build 自校验） | tests/dataset-netcdf.test.ts 两个用例在 skipIf 块外引用未跟踪本地文件→干净克隆必挂【主代理已证实=CI 红根因】；CI 的 release-pack 从未真实跑过（0 artifact、0 release、远端 0 tag） | fixture 门控修复+真实触发一次 release-pack | run 33295687364 失败日志
CAP-06 | 绝对路径/本地缓存泄漏 | PASS | rg "C:/Users" 仅 submission/gen_*.py、artifacts/、research/、work/（被 manifest exclude） | src/、scripts/ 零绝对路径 | path-hygiene 加 C:/Users 规则加固 | rg 输出 vs exclude 列表
CAP-07 | packages/tui 发布配置 | PARTIAL | packages/tui/package.json(@far-lab/tui 0.3.0, ink7+react19, node:test 7 文件) | 无 publishConfig/files/engines；bin 指向 src/main.ts 原生 TS（依赖 strip-types，Node>=22.6 隐含未声明）；从未发布；版本 0.3.0 与根 0.1.0 漂移 | engines 声明 + files 白名单 | npm pack --dry-run
CAP-08 | web 浏览器矩阵 | FAIL | web/playwright.config.ts（单 project，CI=chromium，本地=msedge） | Firefox/WebKit 零覆盖、Safari 系真实内核零覆盖 | firefox+webkit projects（哪怕 smoke 子集） | playwright.config.ts 无 projects 数组
CAP-09 | 文档面 | PARTIAL | docs/EXTENSIBILITY.md、backup-restore.md、web/TESTING.md、desktop/README.md、README.md | 无 troubleshooting.md、无 CONTRIBUTING.md、无迁移指南；docs/ 仅 2 文件；README 自述 CI 同构（形状属实、绿度不属实） | 补 troubleshooting+contribution 最小页 | ls docs/
CAP-10 | release 流程 | FAIL | 全 package.json 0.1.0；本地 tag v1.1.0 指向已删除 workflow；OSS_LEDGER+license-ledger 门禁 | 无 CHANGELOG；远端 0 tag 0 release；无 SBOM；无签名；release-pack 从未执行 | 重建 tag→release-pack→GitHub Release 最小闭环+CHANGELOG.md | gh api releases length=0
CAP-11 | 版本 pin 与 lockfile | PARTIAL | package-lock.json×4 v3、Cargo.lock、uv.lock、python.ts --frozen | CI 的 pip install numpy 未 pin（与 uv.lock 家族可能漂移）；无 rust-toolchain.toml、无 .python-version | CI numpy pin；rust 工具链 pin | ci.yml:48
CAP-12 | .control 发布阻塞记录 | PARTIAL | BLOCKERS.json、RELEASE_BLOCKERS.md、FRONTIER_STATUS.json | B-QWEN(OPEN 外部)、B-S1 PDF(待审) 记录在案；FRONTIER_STATUS 的 "CI success" 停留在 9c0819e(08-27)——当前主干连红未进 blocker 清单 | blocker 记录加 lastCIgreenSHA 字段 | BLOCKERS.json
```

## Top 3 最高杠杆改进

1. **修 CI 红灯断点**（CAP-02/05）：dataset-netcdf.test.ts 两个用例移入既有 skipIf 守卫。一次推送恢复 ACC-38 的最小事实基础，解锁 release-pack 整条链。
2. **真实触发一次 release-pack + 重建版本闭环**（CAP-10）：推 tag 让 export-public.mjs 自校验发布包在 hosted runner 真跑一遍（历史 0 次），落地 CHANGELOG.md + 远端 release。
3. **发布矩阵补 windows runner + firefox/webkit smoke**（CAP-01/08）：产品宣称 Windows 桌面形态但 CI 零覆盖。

## 发布矩阵缺项清单

- OS×arch：现有 ubuntu-latest(x64) 单格。缺 windows-x64（桌面主宣称平台）、macos-arm64/x64、linux-arm64。
- 浏览器：缺 firefox、webkit(Safari 内核)——SSE 重连叙事在 WebKit 从未验证。
- 桌面 targets：tauri targets:"all" 但 CI 无 cargo/tauri build job；安装包产物零自动化。
- Python：CI numpy bootstrap 未 pin；无 3.11/3.12 双版本。
- 发布通道：tag→release-pack→GitHub Release 全链 0 次真实执行。
