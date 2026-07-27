<!-- FAR-Lab PR template — 诚实优先：不伪造通过、不删测试、标 NEEDS_* -->

## 这条 PR 做了什么

<!-- 一句话：驱动了哪个真实依赖 / 修了什么。引用 file:line。 -->

## 变更类型

- [ ] 修复（bugfix）
- [ ] 新功能 / 接线
- [ ] 文档 / 治理
- [ ] 重构（无行为变化）
- [ ] 测试

## 验证

<!-- 跑了哪些命令？贴实跑输出关键行，不要手填数字（红线 RR-1）。 -->
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] 定向测试（贴文件名 + 结果）

## 诚实自查（红线）

- [ ] 我没有删除测试 / 断言来让它通过。
- [ ] 我没有用 `:any` / `@ts-ignore` / 空 `catch{}` / 占位 return 来糊弄类型或错误。
- [ ] 我没有把 offline 当 live、把未验证当完成。
- [ ] 涉及真实 API / 真实数据 / GPU / 比赛提交的，已标 `NEEDS_API_VALIDATION` / `NEEDS_REAL_ENV` /
      `NEEDS_GPU_VALIDATION` / `NEEDS_HUMAN_OPERATION`。
- [ ] 我没有手填裸统计数字（测试数 / 覆盖率 / 通过率），均由命令实时生成。

## 关联 issue / 文档

<!-- closes #N / relates to docs/... -->
