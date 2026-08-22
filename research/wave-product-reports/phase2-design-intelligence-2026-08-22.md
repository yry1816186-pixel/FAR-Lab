# Wave-PRODUCT Phase-2 Design Intelligence (4-line parallel research, 2026-08-22)

> 4 个并行调研子 Agent 的增量结论落盘（主 Agent 交叉比对后取用）。已有七线调研
> （wave-product-reports/ line-a..g）与 craft-spec-v2 仍为基底；本文件只记
> 2026-08-22 产品重构会话中**实际改变实现**的结论与未来增强候选。

## A. 已落地为本会话实现的结论

### 等待/进度（线 D+NN/g）
- 顶部固定"当前阶段 + n/N + 已用时"叙事（OpenAI Deep Research 侧栏模式 + NN/g 进度指示器）
  → **实现**：RunHeader 进度行（`第 x/9 阶段·阶段名`）+ run-banner 已有耗时。
- 阶段化活动流=唯一诚实进度；颜色只标记异常（GitHub Actions 设计师准则）
  → **实现**：ActivityFeed 既有 + 新 CLI 阶段行四符印（正常事件单色）。
- 原始日志默认折叠、可展开（Claude 摘要式折叠 vs 原始流降低信任的社区证据）
  → **实现**：events tab 收进研究页 disclosure（"完整过程记录"）。

### 空态/首用（NN/g + Supabase 模式）
- 空态=教学机会：具体说能做什么 + 单主 CTA + 主动语态；示例问题教 FORMAT
  → **实现**：NewRunForm 示例问题 chips（3 个真实跑过的问题一键填充）。
- 表单预检/引导式首用（Elicit 单问题框为主角）
  → **实现**：hero 收紧（去大 Logo，问题输入为第一视觉锚点）。

### 信任/科学呈现（VSUP + GRADE + ACH）
- VSUP（value-suppressing uncertainty palettes, Correll/Kay UW）：不确定度高→显示粒度坍缩
  → **部分实现**：rank bar + BT 分数 + uncertainty 注记（tournament 级）已在；粒度坍缩列为后续增强。
- ACH evidence 为行×hypothesis 为列、"沿行工作"（ACH 方法论核心）
  → 已有实现方向一致（ACH 块在 CompareView）。
- GRADE：评级必附降级域脚注 → 已有（GRADE-lite 徽章+降级轨迹）。
- "✓0 ✗0 不显示而非误导零"（诚实呈现）→ **实现**：ResearchSummary 平衡行条件渲染。

### CLI（gh/go-gh/clig.dev/yocto-spinner）
- 错误三段式（what/why/next）→ **实现**：die(msg, code, hint)（高频错误点带下一步命令）。
- 产品四符印跨表面统一（✓✗●▲—）→ **实现**：STAGE_GLYPH（UNICODE_OK 探测降级）。
- stdout/stderr 分离、退出码 0/1/2、NO_COLOR、非 TTY 关动画 → 已有（term.ts + vendored picocolors）。

### 设计语言（Geist/Primer/shadcn/Linear 生产 CSS 实测）
- text-autospace（Chrome 140+/Safari 18.4+）中英自动 1/4 em 间距 → **实现**（@supports 门控）。
- tab hover 行背景（Raycast quiet lift）→ **实现**。
- 未采纳（有依据）：dark 边框白 10% alpha（现 token 已过 WCAG 验证链，不推翻已验证值）；
  浮层 box-shadow hairline（固定尺寸浮层无 layout-shift 收益）；非对称进出场时序
  （motion 白名单已定稿）。

## B. 记录但未实现的增强候选（后续波次）

1. VSUP 粒度坍缩渲染（维度分高不确定→粗 bin 显示）——需要不确定度→bin 映射设计。
2. CLI 表格非 TTY TSV 双模式（go-gh tableprinter 算法可移植，~200 行）。
3. CLI 相对时间列（RelativeTimeAgo 算法 40 行）。
4. spinner 开始/结束持久行（屏幕阅读器：终端无 live region，重绘帧不播报——
   yocto finalText 模式是关键）。当前 far 无 spinner（静态进度行已合规）。
5. React Flow（@xyflow/react 12.11.3，MIT，2026-08 仍活跃发版）——若证据图谱需要
   更强交互再引入；当前自研 SVG 够用。
6. 双击 Ctrl-C 语义（优雅清理→强制退，130/143）——far 单击已干净退出，低优先。
7. 修订链 OSF 式不可变版本呈现（v1 永不覆盖 v0 + diff 层）——现有 RevisionsTab 已
   语义一致，视觉增强候选。

## C. 交叉比对结论（对既有研究的修正）

- wave-hci-product.md 两阶段门（设计→批准→实施）被用户 2026-08-22 /goal 直接覆盖
  （"不要停在方案，直接重构"）；美学方向①证据排印沿用，无第二方向。
- craft-spec-v2 全部已实施（B0-B14）；本会话在其上加 IA 层（8 tab→6 任务区）与
  研究者语言层，不推翻 token/色彩/字体验证链。
