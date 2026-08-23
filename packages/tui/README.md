# @far-lab/tui

FAR-Lab 终端研究工作台（v2：只读浏览 + 交互 composer）。

```
cd packages/tui && npm install
npm start            # node --experimental-strip-types src/main.ts
npm test             # node:test 确定性核心测试（7 用例）
FAR_URL=http://127.0.0.1:3196/api/v1  # 默认
```

## 能力
- 浏览：研究列表（↑↓/jk·Enter·q）+ 阶段叙事详情（与 Web 时间线同语义：✓✗● + 中文阶段名 + 真实 pipeline 摘要）
- Composer（v2，Ink 全屏 + 行式降级双实现）：多行输入（Ctrl+J 换行——终端无法传 Shift+Enter）；
  bracketed-paste 原文插入（粘贴永不解析为命令键，Codex paste-burst 语义）；CJK IME 多字符负载按文本插入；
  提交确认走审批词汇表（y/n/a/s/d/q，Aider io.py 血统）
- 提交纪律：确认后**就绪即止**——真实 POST 由 FAR_ALLOW_LIVE=1 门控，默认禁用（2026-08-23 no-live-API 指令，与 Web 走查步骤 05 同纪律）
- 隔离：独立 package.json + lockfile；主产品 far 依赖面零改动（zod-only 不变）；发布 @far-lab/tui 为未来独立确认步骤

## 验证状态
- 行式模式：真实服务器端到端实测（列表/详情叙事/composer 确认流）
- 核心逻辑：node:test 12/12（core 7：粘贴/IME/控制序列/换行回删/就绪门/词汇表；render 5：ink-testing-library 无 TTY 渲染断言——列表/详情叙事/composer 确认流/取消分支）
- Ink 全屏渲染路径：render-verified（ink-testing-library 确定性断言组件树/布局文本/按键处理/确认流）——仅 raw-mode 交互手感（延迟/焦点）留真实终端
