# FAR-Lab Human Experience 终局重建 — HX 车道状态（独立锚点）

> 任务书：/goal 2026-09-02「人机交互层最终端到端重建」（用户原文存 git 历史 .agent_brain/MISSION_STATE.md@58c4c92）。
> 本文件是 HX 车道的可恢复执行状态。`.agent_brain/MISSION_STATE.md` 已由 Wave B 兄弟会话接管——互不覆盖。
> 已批准计划波次：T0 接管闭账 → T1 全表面走查 → T2 web 深度 → T3 CLI/TUI/Report/Desktop 同深度 → T4 门禁全表面化 → T5 从零终验+闭账。
> 用户裁定：验证=离线确定性为主，仅离线不可复现 UX 真相用 bigmodel glm-4.7-flash 调试 key 单次放行；范围=全表面同等深度。

## 事实基线（2026-09-02 上午核定）

- Wave D 已提交 `58c4c92`（18 文件，白名单纪律完美：web/src + capture-surfaces + .agent_brain + HCI_FINAL_COVERAGE）。
- 兄弟 Wave B 车道同分支同工作树活跃中：`d17e706`(沙箱)/`f202dfb`(账本)/`c1f9970`(FA-REM-01)，已推 origin 观察 hosted CI。他们拥有：src/**、experiment-runtime/**、tests/exploration-sandbox*、docs、project-spec、FINAL_*、README、zcode-harness、.github、.control/EXECUTION_STATE*、MISSION_STATE.md。
- HX 车道所有权：web/**、packages/tui/**（T3 起）、.agent_brain/HX_MISSION_STATE.md、.control/HCI_*、`.impeccable/`（永不入库）。
- 3311 gold-hxd 服务器仍在跑（PID 29964）；3196 = 用户进程严禁触碰。
- 在册待修：FA-HCI-01（StudyMap 流健康/协议空态/真相徽标）、FA-HCI-02（方法族覆写→修订链）、FA-HCI-03（门禁全表面化）、FA-HCI-04（EN 泄漏 ResearchActions.tsx:87-89）、SelectionContext P0、CLI verify 导出路径 P0、图谱 ⊘ 排除标记。

## T0 门禁亲验（2026-09-02 完成，全绿）

- web `npm run build`：EXIT=0（tsc+vite+bundle 预算；主包 index 406KB/RadarCompare 454KB/InlineMath 266KB）。
- root `npm run typecheck`：EXIT=0。
- 定向 eslint（15 个 Wave D 文件）：0 错误（root eslint 配置本就忽略 web/**，全部为 ignored 警告；web 门禁=build 内 tsc+E2E）。
- E2E chromium（FARLAB_E2E_PORT=3315）：**26 passed / 7.4m / EXIT=0**（task-metrics T1-T6 全过，T6 cancel→resume→completed 85.3s；terminal 2 spec 过）。前置：root `npm run build` 重建 dist（D-031：兄弟 d17e706 的 src 变更需重编译，首次 E2E 因陈旧 dist webServer 拒启——教训：管道后 `tail` 会吞 playwright 退出码，须直捕）。
- root vitest：兄弟车道同树亲跑 2370 过/15 跳；HX 改动仅 web/**，root vitest 不覆盖 web/src。
- 结论：Wave D（58c4c92）门禁证据齐备，接管闭账完成。

## T1 走查发现（进行中，草稿账本）

**home（1600px 视觉评审，候选项——视觉模型有误判前科，可测项待 DOM 核验）**：类型尺度弱（节标题 vs 卡标题竞争）；侧栏最近研究与"会话"间死区；研究索引卡 4 行连排问题文本扫描性差；卡/画布对比低+右 40% 空；快捷任务 chips 语义含糊；语言切换是头部最响元素；同屏两种状态指示模式（accent 条 vs 点）。

**library（功能实测）**：每行"5天前"检索时间=纯噪音（19 行全同值）；副标题称"按被引用次数排序"但卡上无可见计数=不可验证的排序承诺；关联研究按钮两个近同名截断难辨；无按研究/按获取级别（全文/摘要/仅元数据）过滤。

**调研简报已交付**（SelectionContext 完整推荐设计/CLI 12 规则/TUI 9 规则，存本会话记录；关键约束：动作随真实能力启用禁用+原因、快照语义引用、CJK 双宽对齐是 far CLI 已坐实 bug 类、无正面内部冲突）。

## 状态日志

- 2026-09-02 ~09:30：接管；发现 Wave D 已被 envboot2 提交落袋；本锚点建立；门禁亲验启动。
