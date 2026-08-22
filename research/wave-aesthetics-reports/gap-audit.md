# Wave-Aesthetics P0 差距审计：规格条款 → 落地像素 → 修复方案

- 日期：2026-08-22｜基线截图：`evidence/W-A/baseline/`（12 张，Playwright 实机 1440×900，真实历史数据 + 隔离空数据实例）
- 证据三源：① 规格文档（line-a-design-specs.md / WAVE-PRODUCT-DESIGN-PLAN.md §8）② 落地实测（web/src/styles.css 逐值提取）③ 独立视觉审计（视觉模型对基线截图的盲评，`baseline-tab-overview-light.png` 判词：“粗糙、拥挤、单调，像未优化的原型稿”；`baseline-detail-evidence.png` 判词：“表头无存在感、面板糊成一片”）

## 逐条差距表

| # | 规格条款（出处） | 落地像素（实测） | 差距性质 | 修复方案（craft-spec-v2 章节） |
|---|---|---|---|---|
| G1 | 正文 M3 body-large 16/24（line-a §8.2）或中文细则正文 14（PLAN.md:145）；四家设计系统正文 14px 100% 一致（case-datadense §共识） | 全局基础 **13.5px**（styles.css:125），比两份规格的正文档都小 | **规格冲突未消解，落地取了数据声的 13.5 当全局** | spec §1：正文 14/18 工作区、14/21 阅读区，数据声 12-13 |
| G2 | 标题层级靠对比强度（PX-C1：Raycast 48px 标题 vs 14px 导航）；M3 title-large 22/28 | h1 15px / h2 13px / h3 13px（styles.css:174,231,388），页面最大字号 15px | **无标题层级**——视觉审计确认“标题存在感弱、与正文字号差异小” | spec §1：h1 22/600、h2 16/600、h3 14/600 |
| G3 | 8px 基网格（PLAN.md:168）；四家 4px 基网格阶梯 2/4/8/12/16/24/32/48（case-datadense） | 硬编码 4/6/10/12/14/16/18/24/48 任意值；6/10/14/18 不在任何网格 | **无间距系统**——视觉审计确认“区块挤、留白严重不足、模块间黏连” | spec §2：4px 网格 token 化，区块 24-32、元素 8-16 |
| G4 | motion token 150/300ms + (0.2,0,0,1) + hover 8% state layer（line-a §8.3 规定，M3 官方 SCSS 核验） | **零 transition**（styles.css 全文无 transition 属性；按钮 hover 仅 border-color 瞬变） | **规格从未落地** | spec §6：白名单动效全套 |
| G5 | 密度两档 default/compact（line-a §1.4 M3 + PLAN.md:168）；阅读/数据分区（Apple HIG 布局） | 全应用单一密度：section pad 10-12px、tab pad 7×14px、表格行高无 token | **密度分层缺失**——视觉审计确认“所有信息权重趋同” | spec §3：视图级密度映射表（表格 compact 32px 行高/阅读 default 21px 行高） |
| G6 | 表头 14/600/浅底/1px 底线（EUI/antd 共识）；数字列 tnum（EUI） | 表头 **11.5px**（styles.css:411），无底色区分，无 tnum | **表头无存在感**——视觉审计原话命中 | spec §4：表头全套规格 |
| G7 | Badge 是“彩色即证据”哲学的唯一视觉出口（D-060 锁定） | Badge 11px/1×7px padding（styles.css:427-431）——语义色系统被缩到不可感知 | **签名元素被最小化** | spec §8：glyphs 16-20px 页面级签名 + spec §5 Badge 12px 胶囊 |
| G8 | 原生控件应统一定制（WCAG 2.4.7/2.4.13 焦点要求；M3 state layer） | select/textarea/input 浏览器默认外观；progress 用 -webkit-progress 伪元素补丁；无自定义滚动条 | 控件原始——视觉审计确认“控件形态原始” | spec §5：控件套件全套 |
| G9 | light/dark 双主题是 token 出厂能力（M3/Fluent，line-a §8.1） | 只有 prefers-color-scheme 自动跟随，用户无法手动切换（styles.css:39-57） | 功能缺失 | spec §5：header 切换 + localStorage |
| G10 | 行式列表 1px 分隔不卡片化（PX-C3）｜细边框小圆角（PX-C5） | 已部分合规（行式列表✓）但圆角 6px 与卡片层次弱；分隔 border 对比 1.44:1 仅装饰可用 | 部分合规，微调 | spec §4/§7：4px 圆角统一 + hover 3:1 可感知 |

## 附带发现（P0 过程中新发现，非原六根因）

1. **侧栏错误信息全文直出**：RunsSidebar 的 partial run 把完整错误堆栈（截断前 ~200 字符）平铺在列表项里，信息密度灾难（基线快照 f33e83 实证）——P3 修（错误摘要一行 + 详情进 Overview）
2. **TESTING.md 引用不存在的 scripts/smoke-server.mjs**（文档失实，Wave-G 文件治理遗漏项）——P7 修文档
3. **端口 3196 被外部进程占用**（Fastify 风格 404 响应，非本项目进程）——环境事实，记录备查
4. **上会话遗留 3993 端口实例仍在跑**——基线采集改用受控 3210 实例；遗留实例不属本 Wave 范围，不动

## 结论

六条原判定根因（G1-G5+G7）全部获得三源证据交叉确认，两条附带新发现入列。修复方案已全部收敛进 craft-spec-v2.md §10 差距总表，P2-P5 实施清单映射就绪。
