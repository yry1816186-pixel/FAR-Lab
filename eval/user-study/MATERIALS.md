# User Study Materials (FA-EVAL-02)

Companion to `PROTOCOL.md`. Execution is BLOCKED_EXTERNAL (participants are
user-owned); these materials are complete and frozen.

## §1 Recruitment script + consent

**Recruitment message (zh):**
> 我们在测试一个科研辅助工作台 FAR-Lab，邀请你参加约 60–90 分钟的单次可用性研究。
> 你将完成三个真实科研小任务（文献→假设、论文→复现方案、数据→结论），并填写简短问卷。
> 不需要任何背景知识考核；全程录屏（仅研究用途，保存在本机，不入库）。
> 可以随时中止，中止不影响你获得感谢礼。

**Recruitment message (en):** mirrored translation of the above.

**Consent form (checkboxes):** 18+ / participation voluntary / screen+interaction
recording stored locally for analysis only / anonymized aggregates may be
published / right to withdraw at any time / signature + date.

## §2 Task cards (handed one at a time)

- **Card A:** "这是一个研究问题：〔预置问题，含 20–40 篇文献快照的工作区〕。
  请把它推进到：至少 3 个可评价的假设，其中至少 1 个假设挂接了证据。
  完成后告诉主试'完成'。"
- **Card B:** "这是论文快照〔预置论文〕。请在系统里完成方法分析：指出至少 1 个
  方法局限，并起草一个改进实验（变量、对照、判据）。
- **Card C:** "这是数据集〔预置 csv〕。请从问题出发走完 设计→执行→结论，
  并导出验证包。主试将运行 far verify。"

每张卡同时给出完成判据的通俗描述（与 PROTOCOL.md §3 逐字对应的口语版）。

## §3 Questionnaires

**SUS（标准 10 项，zh/en 双语，5 点李克特；计分遵循标准 SUS 交替翻转换算）**
1. 我会经常使用这个系统。/ I think that I would like to use this system frequently.
2. 这个系统太复杂。/ I found the system unnecessarily complex.
3. 我认为它容易使用。/ I thought the system was easy to use.
4. 我需要技术人员帮忙才能使用。/ I think that I would need the support of a technical person to be able to use this system.
5. 各功能整合得很好。/ I found the various functions in this system were well integrated.
6. 太多不一致。/ I thought there was too much inconsistency in this system.
7. 别人很快能学会。/ I would imagine that most people would learn to use this system very quickly.
8. 用起来很别扭。/ I found the system very cumbersome to use.
9. 我用起来很有信心。/ I felt very confident using the system.
10. 需要先学很多东西才能用。/ I needed to learn a lot of things before I could get going with this system.

**NASA-TLX raw（6 项，无加权）：** 脑力需求/体力需求/时间压力/绩效/努力/挫折。

**Likert（每旅程 3 项，5 点）:** 证据呈现有用性 / 假设或结论有用性 / 会再次使用该旅程。

## §4 Orientation script (5 min, no task demo)

固定的 5 张截图走查：主页/新研究、研究地图、证据检查器、实验执行、导出与验证。
明示："这不是任务演示，只是界面位置介绍。" 脚本逐字固定（截图存 sessions/shared/）。

## §5 Session checklist skeleton

`sessions/<id>/CHECKLIST.md`：同意书 ✓ / 人口学 ✓ / Card A 发放时间 / A 完成
声明时间 / A 判据核验（假设≥3、挂证≥1）/ 干预事件数 / Card B 同上 / Card C 同上
（far verify 结果贴原文）/ 问卷回收 ✓ / 访谈笔记要点。
