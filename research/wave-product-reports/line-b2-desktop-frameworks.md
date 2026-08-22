# 线 B2：桌面 GUI 框架决策证据（Tauri v2 / Electron / 参考系）

- 调研日期：2026-08-22（Wave-PRODUCT，供《产品全景设计规划方案》第 6 节）
- 方法：官方文档/仓库/发布 API 实时核验（tauri.app、electronjs.org、GitHub Releases API、packages.debian.org、packages.ubuntu.com、厂商官方博客）。所有版本/日期/数字附来源 URL；官方无数字处明确写"无官方数字"，不引用记忆值。
- 定位前提：桌面端 = 运行表面包装（复用 canonical 域语义 + 现有 React 18 SPA），不建第二套业务逻辑；核心包运行时零依赖不变量不约束桌面壳。

---

## 1. Tauri v2 核验事实

| 项目 | 核验值 | 来源 |
|---|---|---|
| v2 GA 日期 | **2024-10-02**（"Tauri 2.0 Stable Release"） | https://v2.tauri.app/blog/tauri-20/ |
| 当前稳定版 | **tauri-v2.11.5**，发布于 2026-07-01 | GitHub Releases API `repos/tauri-apps/tauri/releases/latest` |
| License | **MIT OR Apache-2.0 双许可**（仓库含 `LICENSE-APACHE-2.0`、`LICENSE-MIT`、`LICENSE.spdx`；GitHub API 检测为 Apache-2.0） | GitHub API `repos/tauri-apps/tauri` 及仓库根目录清单 |
| crates.io `tauri` | max_stable = 2.11.5，"Make tiny, secure apps for all desktop platforms" | https://crates.io/api/v1/crates/tauri |

### 1.1 系统要求（官方 prerequisites 页，https://tauri.app/start/prerequisites/）

- **Windows**：最低 Windows 7+；依赖 **WebView2**，官方原文："WebView 2 is already installed on Windows 10 (from version 1803 onward) and later versions of Windows"，否则用 Evergreen Bootstrapper 安装。MSI 打包需 VBSCRIPT 可选功能（多数安装默认开）。
- **macOS**：最低 **macOS Catalina (10.15)+**；WebKit 为系统组件，无需单独安装。渲染用 WKWebView（见 webview-versions 参考页 https://v2.tauri.app/reference/webview-versions/）。
- **Linux**：依赖 **webkit2gtk-4.1** 系包（v2 全面转向 4.1/libsoup3，不再提 4.0）。官方页只给包名不给最低版本号：Debian/Ubuntu 需 `libwebkit2gtk-4.1-dev`、`libayatana-appindicator3-dev`、`librsvg2-dev`、`libxdo-dev` 等；Arch `webkit2gtk-4.1`；Fedora `webkit2gtk4.1-devel`；Alpine `webkit2gtk-4.1-dev`（musl 静态链接另有要求）。
- **发行版实际可用性（自行核验）**：
  - `libwebkit2gtk-4.1-dev` 在 Debian 仅 **bookworm(12)+ / trixie / forky / sid**，**bullseye(11) 无**（https://packages.debian.org/libwebkit2gtk-4.1-dev）
  - Ubuntu **jammy(22.04) 有**（amd64 版本串 2.50.4-0ubuntu0.22.04.1，arm64 为 2.36.0）（https://packages.ubuntu.com/jammy/libwebkit2gtk-4.1-dev）
  - 推论（基于以上事实）：Tauri v2 Linux 支持面 ≈ Debian 12+ / Ubuntu 22.04+ / 主流滚动发行版；20.04 级老系统出局（Firezone 案例佐证，见 §4.2）

### 1.2 核心能力清单（全部官方来源核验）

- **多窗口**：核心 `WebviewWindow` API 支持多窗口；GA 博文提及 multiwebview（同窗口多 webview）在 GA 时为 unstable feature flag。来源：https://v2.tauri.app/blog/tauri-20/
- **系统托盘与菜单**：核心 tray-icon 能力（GA 博文：`system-tray` feature 改名 `tray-icon`），官方指南 https://v2.tauri.app/learn/system-tray/ 、window-menu 指南同在 Learn 目录。
- **通知**：官方插件 https://v2.tauri.app/plugin/notification/（GA 博文确认）
- **自动更新**：官方 Updater 插件（GA 博文确认，updater 配置从核心移入插件）：https://v2.tauri.app/plugin/updater/
- **Sidecar 贴壳外部进程**：官方文档 https://v2.tauri.app/develop/sidecar/ —— `bundle.externalBin` 声明；每个目标架构需带 `-$TARGET_TRIPLE` 后缀的独立二进制副本；经 shell 插件 `Command::sidecar` 运行；JS 侧需 capability 授权（`shell:allow-spawn`/`allow-execute` + `sidecar:true`），参数可用正则白名单约束。官方另文《Node.js as a sidecar》（/learn/sidecar-nodejs/）。
- **前端无关**：任意 HTML/JS 前端；`create-tauri-app` 提供 React 等模板（GA 博文）。
- **安全模型**：v2 用 **permissions/scopes/capabilities** 体系取代 v1 allowlist（GA 博文）；跨窗口/平台可分 capability 配置（Learn/Security 指南）。sidecar 调用亦受 capability 约束（sidecar 文档）。

### 1.3 包体积与内存（严格区分口径）

- **官方口径数字**：仅 tauri.app 首页一句——"the size of a Tauri app can be little as 600KB"（最小值口径，非典型值）。**内存：无官方数字。** 来源：https://tauri.app/
- GA 博文无任何量化体积/内存/Electron 对比数字（已核验全文）。
- 第三方实测参考（非官方）：Firezone 博客——下载体积 Linux 12MB / Windows 8MB（对比其口径 Electron 默认 ~100MB、electron-builder ~35MB）；GUI 常驻内存约 100MB（窗口全隐藏时）。见 §4.2。

---

## 2. Electron 核验事实

| 项目 | 核验值 | 来源 |
|---|---|---|
| 当前稳定版 | **v43.4.1**（2026-08-19 发布） | GitHub Releases API `repos/electron/electron/releases/latest` |
| v43.0.0 | 发布于 **2026-06-30**；绑 **Chromium 150.0.7871.46 / Node v24.147.0 / V8 15.0** | GitHub `releases/tags/v43.0.0` 正文 |
| 支持策略 | 最新 3 个大版本受支持（现为 41/42/43）；8 周一个大版本；E43 支持至 **2027-01-05** | https://endoflife.date/electron（2026-08-20 更新） |
| License | **MIT** | GitHub API `repos/electron/electron` |

- **内置能力**：Chromium+Node.js 绑定（渲染引擎三平台同源）；Tray/Notification 为核心 API；`autoUpdater` 为内置主进程模块——但依赖 Squirrel.Mac/Squirrel.Windows 或 MSIX 打包，**Linux 无内置支持**（官方原文 "There is no built-in support for auto-updater on Linux"，建议用发行版包管理器）。来源：https://www.electronjs.org/docs/latest/api/auto-updater 。**electron-updater 不属于 Electron 核心**（electron-builder 生态，核心文档未提及）。
- **安全默认值（官方 security 教程）**：contextIsolation 自 12.0.0 默认开、sandbox 自 20.0.0 默认开、nodeIntegration 自 5.0.0 默认关；但**主进程天然全 Node 权限**，加固是开发者责任。来源：https://www.electronjs.org/docs/latest/tutorial/security
- **包体积/内存官方说明**：**无官方数字**——FAQ 页（https://www.electronjs.org/docs/latest/faq）经核验不含任何体积/内存/启动时间声明。第三方口径见 §4.2（Firezone：默认打包下载约 100MB 级）。

---

## 3. 参考系一段

**Wails**（MIT，35.9k stars，活跃）：Go 语言桌面框架（"Create beautiful applications using Go"），同样用系统 webview；后端是 Go，与 FAR-Lab Node/TS 栈不同构，引入需维护第二语言栈。**Neutralino**（LICENSE 文件核验为 MIT，8.6k stars，活跃）：轻量"便携"桌面框架，系统 webview + 内置轻量后端，体量小但生态/能力面窄（托盘、更新等成熟度低于 Tauri/Electron）。**NW.js**（MIT，41k stars，活跃）：Chromium+Node 直通 DOM 的老牌方案，与 Electron 同重量级（自带 Chromium），无体积优势，生态重心已移向 Electron。三者来源均为 GitHub API `license`/`description` + LICENSE 文件。

---

## 4. 真实开源/公开案例（公开技术披露）

### 4.1 Clash Verge Rev（Clash Meta GUI，开源，Tauri 2 + React）
- 披露：README 自述"基于性能强劲的 Rust 和 Tauri 2 框架"（https://github.com/clash-verge-rev/clash-verge-rev）。
- 坑（公开 issue）：Linux Wayland 下 "Error 71 (Protocol error) dispatching to Wayland display"（clash-verge-rev#5931），上游 tauri#10702（webkit2gtk GPU/渲染问题）；GBM buffer 崩溃 tauri#13493。Tauri 官方专设 Linux 图形问题调试页承认 WebKitGTK 与驱动（尤其 NVIDIA）冲突并给出环境变量绕行（`WEBKIT_DISABLE_COMPOSITING_MODE=1` 等）：https://v2.tauri.app/develop/debug/linux-graphics/

### 4.2 Firezone（跨平台安全客户端，Tauri，官方博客）
- 选择理由：团队已是 Rust+TS；内置 tray/通知/自更新/deep-link/msi-deb 打包模块（https://www.firezone.dev/blog/using-tauri）
- 收益：客户端下载 **Linux 12MB / Windows 8MB**（对比口径：Electron 默认约 100MB、electron-builder 约 35MB）；约 2 个月出 Windows beta。
- 坑：GUI **常驻约 100MB RAM（窗口全隐藏）**；**webkit2gtk 版本碎片化**——Ubuntu 20.04 与 24.04 无共享 webkit2gtk 版本，Tauri 1.x 在 24.04 不工作、Tauri 2.x 需 4.1 在 20.04 不工作；AppImage 兜底涨到 ~100MB 且有渲染 bug；deb bundler 无 postinst 钩子需拆包重打；Windows 托盘无左键事件。
- 结论原文："Tauri is good, try it out"，但"Tauri 像辅助轮，深入后可能要替换"。

### 4.3 1Password 8（闭源，但官方公开架构披露——壳/核心分离先例）
- 官方与社区披露：Electron UI 壳 + **共享 Rust core** 承担全部加密/文件/网络（https://1password.com/blog/1password-8-the-windows-is-here 、官方社区帖、HN 28143563）。对 FAR-Lab 的意义：'桌面壳只做 UI、能力在核心'是被大规模验证过的架构；Electron 壳本身曾引发社区争议（品牌/体验风险参考）。

### 4.4 Spacedrive（开源文件管理器，Tauri 壳 + Rust core）
- 官方 docs/收录页确认 Tauri 桌面壳（https://v2.spacedrive.com/overview/introduction 、madewithtauri.com/submissions/spacedrive）；公开 issue 生态中 Linux 大 DOM 性能问题（如 tauri#3988）与其文件网格场景相关。社区亦有反向样本（HN 44118251：有团队从 Tauri 迁回 Electron，理由是"系统 webview 不是稳定一致的构建平台"）——属社区证据，非官方。

---

## 5. FAR-Lab 决策矩阵

用例：可视化监控面板、长任务流程状态、系统托盘常驻、完成/失败通知；复用现有 React 18 SPA（web/dist）与 Node CLI/API server。

| 维度 | Tauri v2 | Electron |
|---|---|---|
| 三平台支持 | Win7+/WebView2（Win10 1803+ 预装）；macOS 10.15+；Linux 需 webkit2gtk-4.1（≈Debian 12+/Ubuntu 22.04+，官方页不给最低版本号） | 三平台一致，自带 Chromium（当前 M150），不受发行版 webview 影响；Win7/8 支持随 Chromium 上游收缩 |
| Linux 坑 | WebKitGTK 与驱动冲突（NVIDIA/Wayland 崩溃，官方绕行=禁合成模式等环境变量，有性能代价）；发行版版本碎片化（Firezone 案例）；无头/服务器场景不可用 | 无 webview 兼容问题；但同样需要 X/Wayland 图形栈；内存/体积更高（无官方数字，第三方口径 ~100MB 下载级） |
| Windows 坑 | WebView2 预装面大（Win10 1803+），缺口走 Evergreen Bootstrapper；MSI 需 VBSCRIPT 特性 | 无 WebView2 依赖问题；体积大 |
| 复用 React UI 成本 | 低：web/dist 直接作为静态前端（前端无关）；需在三套 webview 引擎上做测试矩阵 | 最低：同一 Chromium；现有 Web 工作台行为最可预期 |
| 与 Node API server 关系 | 三选项见 §6（连接既有 server / sidecar 打包 / Rust 直连 SQLite） | 天然同构：壳主进程即 Node，可与 API server 同进程、fork 或 spawn 管理，IPC/生命周期管理最简单 |
| 安全模型 | capability/permission 显式白名单（含 sidecar 参数正则约束），默认最小权限 | 主进程全 Node 权限；contextIsolation/sandbox 默认开（12.0/20.0 起），但边界靠开发者自律配置 |
| 托盘/通知 | 核心托盘 + 官方通知插件 | 核心内置 |
| 自动更新 | 官方 Updater 插件（签名机制），三平台统一 | 内置 autoUpdater 依赖 Squirrel/MSIX；**Linux 无内置**，常配 electron-updater（非核心） |
| 打包体积/内存 | 官方口径：最小 600KB；内存无官方数字（第三方实测：下载 ~8-12MB、常驻 ~100MB） | 官方无数字；第三方口径下载 ~100MB 级 |
| 维护风险 | Rust 工具链 + 三 webview 差异 + Linux 图形问题池（持续新增 issue）；2.x 迭代快（2.11.5/2026-07） | 8 周一大版本、只保 3 个（E43 至 2027-01-05），升级节奏刚性；行为一致、踩坑资料最多 |
| 无头 Linux 降级 | 桌面壳不可用即退回 Web/CLI（壳是可选层，不碰核心） | 同左 |
| 竞赛交付合规 | 壳为独立打包面，不影响模型调用路由 | 同左 |

## 6. 与本地 Node API server 关系的三个选项（只列利弊，不替主 Agent 决策）

1. **壳连接既有 server（HTTP/WS 到 localhost 或既有部署）**——壳=纯监控/通知面板。利：零业务逻辑进壳、server 单一权威、无头场景 Web/CLI 与桌面同源；弊：用户需先起 server（或壳内提供"启动/停止 server"的生命周期管理=又一种 sidecar-lite）；网络端口/发现/鉴权要设计。
2. **Node server 作为 Tauri sidecar 打包（externalBin + target-triple）**——单安装包体验。利：一键安装即用；弊：需为每平台/架构产出 Node 单可执行（Node SEA/打包器，多一条构建链）；更新链=壳+sidecar 双更新；Firezone 案例提示 bundler 灵活性不足的摩擦。
3. **Tauri Rust 后端直连 SQLite（绕过 Node server）**——利：最小分发；弊：**违背本项目"不建第二套业务逻辑"定位**（域语义在 Node/TS 侧是 canonical），等于复制 API 层，维护双实现风险最高，不建议作为默认。
4. （Electron 分支下的天然选项）**Electron 主进程内嵌/fork API server**——利：同语言同进程边界、生命周期/IPC 最简、无 target-triple 打包问题；弊：接受 Electron 体积与安全边界自律。

## 7. 供主 Agent 决策的候选方案

- **方案 A：Tauri v2 壳 + web/dist + 连接既有 Node server**（监控面板/托盘/通知为纯展示层）。前提：目标 Linux 支持面可声明为 Debian 12+/Ubuntu 22.04+；接受三 webview 引擎测试矩阵与 Linux 图形问题池（官方绕行手段存在）；安装体验首版可接受"先起 server 后开壳"或壳内轻量进程管理。
- **方案 B：Tauri v2 壳 + Node server sidecar 单包分发**。前提：愿意建设 Node 单可执行交叉打包链并承担双组件更新；其余同 A。
- **方案 C：Electron 壳（复用 web/dist + 主进程管理 Node server）**。前提：体积/内存非硬约束（部署环境无官方数字可援引，社区口径 ~100MB 级）；团队接受 8 周大版本节奏与主进程全 Node 权限的自律安全边界；换取行为一致性（单一 Chromium）与最低栈摩擦。
- 共同不变量：桌面壳永远是可选运行表面；canonical 语义与服务在 Node 侧，无头 Linux/服务器场景直接 Web/CLI，壳不可用不算系统故障。

## 8. 来源清单

- Tauri：https://v2.tauri.app/blog/tauri-20/ ；https://tauri.app/start/prerequisites/ ；https://tauri.app/ ；https://v2.tauri.app/develop/sidecar/ ；https://v2.tauri.app/learn/ ；https://v2.tauri.app/reference/webview-versions/ ；https://v2.tauri.app/develop/debug/linux-graphics/ ；GitHub API tauri-apps/tauri（releases/latest=tauri-v2.11.5, 2026-07-01；LICENSE-MIT/LICENSE-APACHE-2.0）；crates.io /crates/tauri
- Electron：GitHub API electron/electron（releases/latest=v43.4.1 2026-08-19；tag v43.0.0 正文：Chromium 150.0.7871.46/Node v24.147.0/V8 15.0；MIT）；https://endoflife.date/electron ；https://www.electronjs.org/docs/latest/api/auto-updater ；https://www.electronjs.org/docs/latest/tutorial/security ；https://www.electronjs.org/docs/latest/faq
- 发行版包：https://packages.debian.org/libwebkit2gtk-4.1-dev ；https://packages.ubuntu.com/jammy/libwebkit2gtk-4.1-dev
- 案例：https://github.com/clash-verge-rev/clash-verge-rev （README）；clash-verge-rev#5931、tauri#10702、tauri#13493、tauri#3988；https://www.firezone.dev/blog/using-tauri ；https://v2.spacedrive.com/overview/introduction ；https://1password.com/blog/1password-8-for-windows-is-here ；HN 28143563 / 44118251（社区证据）
- UNVERIFIED 项：无（本文件所有版本/日期/数字均有上述来源；未做本地实测，性能数字未独立复现）
