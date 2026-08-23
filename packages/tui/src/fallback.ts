/**
 * Line-mode fallback (READ-ONLY v1): when raw mode is unavailable (mintty/
 * Git Bash, piped stdin), the same views degrade to a numbered-menu readline
 * loop. Honest capability parity: list → detail → back, exit.
 */
import { getEvents, listRuns } from './api.ts';
import { ask, closeAsk } from './ask.ts';
import { deriveStages, relTime, STAGE_ICON, STAGE_ZH } from './narrative.ts';
import { decide, VOCAB_FOOTER } from './approveCore.ts';

export async function runReadline(): Promise<void> {
  const say = (s: string): void => { console.log(s); };
  try {
    // Line-mode composer (paste-safe by construction — readline never
    // interprets pasted text as keys; IME payloads arrive as text).
    say('FAR-Lab · 研究问题输入（行式模式 — 终端不支持全屏）');
    const question = (await ask('研究问题（单行；Enter 确认）：')).trim();
    if (question.length > 0) {
      say(`\n提交确认：${question.slice(0, 120)}`);
      say(`y 确认就绪 · n 放弃    （${VOCAB_FOOTER}）`);
      const answer = await ask('> ');
      const d = decide(answer, { allowAlways: false, allowSession: false });
      if (d === 'approved') say('✓ 问题已就绪——真实提交按 no-live-API 纪律禁用（与 Web 同纪律，就绪即止）');
      else say('已放弃输入');
    }
    say('\n—— 研究列表 ——');
    const runs = await listRuns();
    runs.slice(0, 30).forEach((r, i) => {
      say(`${String(i + 1).padStart(2)}. ${(r.questionText ?? r.id).slice(0, 80)}`);
    });
    say('');
    const answer = await ask('输入编号查看研究过程（q 退出）：');
    const idx = Number.parseInt(answer.trim(), 10);
    if (answer.trim() === 'q' || Number.isNaN(idx) || idx < 1 || idx > Math.min(runs.length, 30)) return;
    const run = runs[idx - 1]!;
    const stages = deriveStages(await getEvents(run.id));
    say(`\n${(run.questionText ?? run.id).slice(0, 100)}\n`);
    stages.forEach((s) => {
      say(` ${STAGE_ICON[s.status]} ${STAGE_ZH[s.stage] ?? s.stage}${s.summary !== undefined ? ` — ${s.summary.slice(0, 60)}` : ''}`);
    });
    say(`\n（${relTime(run.createdAt)} · 行式模式每次会话查看一项）`);
  } catch (e) {
    console.error('失败：', e instanceof Error ? e.message : String(e));
  } finally {
    closeAsk();
  }
}
