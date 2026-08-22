# FAR-Lab 桌面壳（Tauri v2）

桌面壳是**运行表面包装**，不是第二套业务逻辑（PRODUCT_HCI §1.2）：Rust 侧只做三件事——
spawn `node scripts/serve.mjs`（复用与浏览器完全相同的 API server + `web/dist` 工作台）、
真实等待 `GET /api/v1/health` 返回 200（不做假进度）、打开 webview 窗口；应用退出时终止
spawn 的 server（Drop 守卫）。若 4520 端口已有健康 server（第二次启动），直接复用不重复拉起。

## 使用

```bash
# 前提：仓库根已 npm install && npm run build（dist 就绪），Node ≥24 在 PATH
cd desktop
npm install
npx tauri dev        # 开发模式（编译 + 启动窗口）
npx tauri build --no-bundle   # 编译出可执行文件（不做安装包）
```

端口：默认 `4520`，可用 `FARLAB_DESKTOP_PORT` 覆盖。窗口加载 `http://127.0.0.1:<port>/`——
API server 的 loopback 安全守卫（api.ts F-1）天然只放行本机访问，桌面形态不扩大攻击面。

## 平台支持面（如实声明，依据 research/wave-product-reports/line-b2-desktop-frameworks.md 官方文档核验）

| 平台 | 状态 | 前提 |
|---|---|---|
| Windows | **本仓库开发机（Windows 10+）真实构建验证** | WebView2 运行时（Win10 1803+ 预装） |
| macOS | 代码层就绪，**未实测**（无本机）——宣称前须在 macOS 实测一次 | macOS 10.15+（系统 WebKit） |
| Linux 桌面 | 代码层就绪，**未实测**——宣称前须实测 | webkit2gtk-4.1：Debian 12+ / Ubuntu 22.04+ 才有该包；NVIDIA/Wayland 下 WebKitGTK 有已知驱动问题（官方绕行页在 line-b2 报告） |

## 已知边界（不掩盖）

- **安装包/图标/签名未做**：`bundle.active=false`（tauri.conf.json）——`--no-bundle` 只产出裸
  可执行文件；安装包需 icon 资产与 Windows 代码签名预算，列为后续项。
- 发布版（非 dev）的仓库根定位依赖编译期 `CARGO_MANIFEST_DIR`，仅在源码树内构建有效；
  随安装包分发的形态需引入 sidecar 打包 Node 运行时（line-b2 方案 B），是发布工程的一部分。
- Linux 无头环境不适用本壳（无图形界面）——CLI/API/远程 Web 是该场景的完整降级（方案 §14）。
