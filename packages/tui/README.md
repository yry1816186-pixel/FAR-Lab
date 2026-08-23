# @far-lab/tui

FAR-Lab 终端研究浏览器（只读 v1）。

```
cd packages/tui && npm install
npm start            # 或: node --experimental-strip-types src/main.ts
FAR_URL=http://127.0.0.1:3196/api/v1  # 默认
```

- 全屏模式（Ink 7，MIT）：↑↓/jk 选择 · Enter 查看 · q 退出；阶段叙事与 Web 时间线同语义
- 行式降级：终端无法进入 raw mode 时（Git Bash/mintty/管道）自动切换，同能力
- 能力边界（诚实）：v1 只读——浏览研究与阶段叙事；不含创建研究（会触发真实模型/检索调用）
- 隔离性：独立 package.json + node_modules，主产品 far 依赖面零改动（zod-only 不变）
- 验证状态：行式模式实测（52 研究列表 + 12 阶段详情真实渲染）；Ink 全屏路径 UNVERIFIED-live（需真实交互终端）
