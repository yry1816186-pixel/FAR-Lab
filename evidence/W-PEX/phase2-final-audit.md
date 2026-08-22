# PEX Phase-2 终局对抗审计与裁定（2026-08-22）

独立对抗审计（fresh agent，默认拒绝立场）对 13 项能力的裁定：

**11 项通过**（commit 轨迹/AI 研究动作 live 200/execute 阶段 done/CLI completion+watch/四假设操作路由/palette-hit+isComposing 入 bundle/门禁诚实/零 TODO-stub/吞错全部有注释）。

**2 项阻断裁定**：
1. **FTS5 未 live**——审计判定正确且抓到真实运维缺口：审计时服务器仍在跑 ade36e6 前的构建（该服务器实例无人执行过搜索，惰性建表的 far_search 尚不存在，catch 落回 LIKE）。**修复=重启加载新构建**；live 复验：`/api/v1/search?q=nucleosome%20occlusion` → `snippet:"Regional constitutive heterochromatin and local «nucleosome occlusion» of targe…", rank:-8.476`。
2. **seeds 数据缺失**——**裁定为引用笔误非缺陷**：审计指令中的 run id 尾部误多一个 `1`（真 id `run_bbgtvep5bwdy26n0kvxkw0epvn`）。复核：2 条 `family=user_provided` source_document 正确挂载于该 run，runs 表一致。

**审计后追加**：B12-G1（健康面 activeRoute 投影——用户激活自定义路由时健康条不再只报 env 路由）已实现并 live 验证（无激活自定义路由时字段诚实缺席）。

**遗留（全部有记录归属）**：ENV-LIMITED GUI 交互验证（版本对比展开视觉/实验页 EN/Zotero 降级面板的浏览器交互级验证——IAB 输入管道两度退化阻断，DOM 存在性+API 层已验，记入 B13 复验清单）；B6 绑定密度 live A/B（PENDING_LIVE，b6-binding-notes.md）；`far experiment status --watch` 的 TTY 重绘（IMPLEMENTED_UNVERIFIED live——winpty 沙箱崩溃，帧渲染器已单测）。

**终局门禁**：vitest 804/806（54 文件，2 既定 skip）· root+web tsc/build 0 · secret-scan PASS · completion-gate **VERIFIED_READY**（24 live_verified + 2 tested，26/26）。
