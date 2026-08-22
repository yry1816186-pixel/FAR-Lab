# ENV-LIMITED GUI 交互复验记录（2026-08-22，completion-verifier 指令批）

三项此前因 IAB 输入管道退化而只完成 DOM 存在性验证的交互，本批在稳定窗口内逐一实走。方法：每项在新鲜浏览器窗口内完成"导航→真实点击→断言→截图"全链路（退化窗口立即弃换新窗）。

## 复验一：版本对比 before/after 展开 ✅
- 路径：`#run/run_7zez1a8ezbbrrgw9begtta0gsw/revisions` → 点击「展开全文对比（before / after）」summary
- 结果：details 展开，**jsdiff 词级 inline diff 可见**（"词级差异：绿色 = 新增（修订后）· 红色 = 删除（修订前）"图例 + v0/v1 前缀词级混排 "…key driver of HGT→the spread of resistance…"），plan 操作的 before/after 同列
- 截图：`env-reverify-1-version-compare.png`（948KB）

## 复验二：ExperimentsTab 英文态零中文 ✅
- 路径：实验执行 tab → 切 English → 面板中文扫描（\u4e00-\u9fff，排除语言切换按钮本身）
- 结果：`zhLeakLines=0`——intro（"Executed-experiment truth (dataset/training/statistics/verdict)…"）/ "Refresh" 按钮 / 空态 / 引导文案全部英文
- 截图：`env-reverify-2-experiments-en.png`（254KB）

## 复验三：Zotero 未运行降级面板 ✅
- 路径：首页 → 点击「从 Zotero 导入」→ 等 2.8s（连接尝试）
- 结果：dialog 打开，诚实降级文案完整："未检测到本机 Zotero（需运行桌面版并启用本地 API）。可改为拖入文件或粘贴 DOI/BibTeX。" + 「关闭」按钮 + 替代路径指引
- 截图：`env-reverify-3-zotero-degrade.png`（328KB）

## 过程记录
- IAB 输入管道在长驻窗口约 1-2 次导航后退化（click/截图管线失效，读操作正常）——与既往两次一致；新鲜窗口开窗期交互可靠，本批全部以"新窗快打"完成
- 语言偏好跨会话持久化（EN 状态延续），复验三前显式切回中文再走，两种语言的降级文案均存在（代码审查 + zh 实走）
