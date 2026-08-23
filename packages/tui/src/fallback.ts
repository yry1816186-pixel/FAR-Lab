/**
 * Line-mode fallback (READ-ONLY v1): when raw mode is unavailable (mintty/
 * Git Bash, piped stdin), the same views degrade to a numbered-menu readline
 * loop. Honest capability parity: list → detail → back, exit.
 */
import * as readline from 'node:readline/promises';
import { getEvents, listRuns } from './api.ts';
import { deriveStages, relTime, STAGE_ICON, STAGE_ZH } from './narrative.ts';

export async function runReadline(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const runs = await listRuns();
    // eslint-disable-next-line no-console -- line mode IS the console
    console.log(`FAR-Lab · 我的研究（行式模式 — 终端不支持全屏）\n`);
    runs.slice(0, 30).forEach((r, i) => {
      // eslint-disable-next-line no-console
      console.log(`${String(i + 1).padStart(2)}. ${(r.questionText ?? r.id).slice(0, 80)}`);
    });
    // eslint-disable-next-line no-console
    console.log('');
    const answer = await rl.question('输入编号查看研究过程（q 退出）：');
    const idx = Number.parseInt(answer.trim(), 10);
    if (answer.trim() === 'q' || Number.isNaN(idx) || idx < 1 || idx > Math.min(runs.length, 30)) return;
    const run = runs[idx - 1]!;
    const stages = deriveStages(await getEvents(run.id));
    // eslint-disable-next-line no-console
    console.log(`\n${(run.questionText ?? run.id).slice(0, 100)}\n`);
    stages.forEach((s) => {
      // eslint-disable-next-line no-console
      console.log(` ${STAGE_ICON[s.status]} ${STAGE_ZH[s.stage] ?? s.stage}${s.summary !== undefined ? ` — ${s.summary.slice(0, 60)}` : ''}`);
    });
    // eslint-disable-next-line no-console
    console.log(`\n（${relTime(run.createdAt)} · 行式模式每次会话查看一项）`);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('失败：', e instanceof Error ? e.message : String(e));
  } finally {
    rl.close();
  }
}
