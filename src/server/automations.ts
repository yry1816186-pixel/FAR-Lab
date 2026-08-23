import type { App } from '../app/composition.js';
import { ConversationSchema, newId, type Automation, type Conversation } from '../domain/index.js';
import { generateConversationTurn, type ConversationTurnGeneration } from './conversation-agent.js';
import {
  appendAutomationRecord, MAX_MESSAGES, resolveConversationProvider, effectiveConversationReasoning,
  type CreateRunForConversation,
} from './conversations.js';

/**
 * Automation engine (resident-agent R3): fires agent turns into conversations
 * without a human message — on schedule or when a run completes. Honest
 * limits, by design: firing only happens while THIS process runs (persisted
 * state resumes the clocks after restart); every fire is a real model turn
 * capped at maxTurnsPerFire; automation turns can PROPOSE actions but never
 * auto-execute them (remembered grants are ignored in automated context — an
 * unattended loop must not spend without a human gate); every fire leaves a
 * visible automation-role message, success or failure.
 */

export interface AutomationEngineDeps {
  createRun: CreateRunForConversation;
  /** Tick interval (default 60s); tests drive tick() directly instead. */
  tickMs?: number;
  now?: () => Date;
}

export interface AutomationEngine {
  stop(): void;
  /** One evaluation pass; returns the number of automations that fired. */
  tick(now?: Date): Promise<number>;
}

const STDERR = (msg: string): void => { process.stderr.write(`far-automations: ${msg}\n`); };

export function startAutomationEngine(app: App, deps: AutomationEngineDeps): AutomationEngine {
  const nowFn = deps.now ?? ((): Date => new Date());
  let busy = false;

  const fire = async (automation: Automation, notice: string, now: Date): Promise<boolean> => {
    const conv = app.store.getObject('conversation', automation.conversationId);
    if (conv === null) {
      // orphaned: its conversation is gone — disable loudly, never fire into the void
      app.store.putObject('automation', { ...automation, enabled: false, updatedAt: now.toISOString() });
      STDERR(`automation ${automation.id} disabled (conversation ${automation.conversationId} not found)`);
      return false;
    }
    if (conv.messages.length >= MAX_MESSAGES) {
      app.store.putObject('automation', { ...automation, enabled: false, updatedAt: now.toISOString() });
      STDERR(`automation ${automation.id} disabled (conversation ${automation.conversationId} is full)`);
      return false;
    }
    try {
      const triggerText = automation.trigger.kind === 'run_completed'
        ? '每当有研究完成时'
        : `每 ${automation.trigger.intervalMinutes} 分钟`;
      const noticeContent = `⏰ [自动化「${automation.label}」·${triggerText}] ${notice}\n任务：${automation.task}`;
      appendAutomationRecord(app, automation.conversationId, noticeContent);

      // Remembered grants are deliberately blanked in automated context: only a
      // human turn may auto-execute; automation turns propose, humans resolve.
      // The conversation's reasoning gear applies to automated turns too.
      const __autoReasoning = effectiveConversationReasoning(app, conv);
      const turnInput: ConversationTurnGeneration = await generateConversationTurn(
        app,
        resolveConversationProvider(app, conv),
        { ...conv, autoApprove: [] } as Conversation,
        {
          text: `这是自动触发回合（${triggerText}）。${notice}\n执行任务：${automation.task}`,
          seeds: [],
          history: conv.messages.slice(-24),
          source: 'automation',
          maxTurns: automation.maxTurnsPerFire,
          ...(__autoReasoning !== null ? { reasoning: __autoReasoning } : {}),
        },
      );
      if (turnInput.status !== 'completed' || turnInput.reply === undefined) {
        appendAutomationRecord(
          app,
          automation.conversationId,
          `⚠️ [自动化「${automation.label}」] 本轮 Agent 失败（${turnInput.status}）：${turnInput.error ?? 'no reply'}——触发通知保留，可重试`,
        );
      } else {
        const reply = turnInput.reply;
        const candSeq = conv.messages.reduce((n, m) => n + (m.candidates?.length ?? 0), 0);
        const afterNotice = app.store.getObject('conversation', automation.conversationId);
        if (afterNotice !== null) {
          app.store.putObject('conversation', ConversationSchema.parse({
            ...afterNotice,
            messages: [
              ...afterNotice.messages,
              ConversationSchema.shape.messages.element.parse({
                id: newId('cmsg'),
                role: 'agent',
                content: [
                  reply.reply,
                  ...(reply.clarifyingQuestions.length > 0 ? [`\n**需要澄清：**\n${reply.clarifyingQuestions.map((q) => `- ${q}`).join('\n')}`] : []),
                ].join('\n'),
                ...(reply.candidates.length > 0
                  ? { candidates: reply.candidates.map((c, i) => ({ id: `cand_${candSeq + i + 1}`, text: c.text, rationale: c.rationale })) }
                  : {}),
                ...(turnInput.toolTrace.length > 0 ? { toolTrace: turnInput.toolTrace } : {}),
                ...(turnInput.proposals.length > 0 ? { proposals: turnInput.proposals } : {}),
                ...(turnInput.usage !== undefined ? { usage: turnInput.usage } : {}),
                createdAt: new Date().toISOString(),
              }),
            ],
            turns: afterNotice.turns + 1,
            updatedAt: new Date().toISOString(),
          }));
        }
      }
    } catch (e) {
      appendAutomationRecord(
        app,
        automation.conversationId,
        `⚠️ [自动化「${automation.label}」] 触发异常：${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return true;
  };

  const tick = async (at?: Date): Promise<number> => {
    if (busy) return 0; // serialize passes — an overlapping tick would double-fire
    busy = true;
    const now = at ?? nowFn();
    let fired = 0;
    try {
      const automations = app.store.listObjects('automation', '__none__');
      for (const automation of automations) {
        if (!automation.enabled) continue;
        if (automation.trigger.kind === 'schedule') {
          const dueAt = Date.parse(automation.lastFiredAt ?? automation.createdAt) + automation.trigger.intervalMinutes * 60_000;
          if (now.getTime() < dueAt) continue;
          if (await fire(automation, '定时触发', now)) {
            markFired(app, automation, [], now);
            fired += 1;
          }
        } else {
          const boundary = Date.parse(automation.createdAt);
          const completed = app.store.listRuns(60)
            .filter((r) => r.status === 'completed' && !automation.notifiedRunIds.includes(r.id) && Date.parse(r.createdAt) >= boundary);
          if (completed.length === 0) continue;
          const notice = completed.length === 1
            ? `研究 ${completed[0]!.id} 已完成`
            : `${completed.length} 项研究已完成：${completed.map((r) => r.id).join('、')}`;
          if (await fire(automation, notice, now)) {
            markFired(app, automation, completed.map((r) => r.id), now);
            fired += 1;
          }
        }
      }
    } finally {
      busy = false;
    }
    return fired;
  };

  const timer = setInterval(() => { void tick(); }, deps.tickMs ?? 60_000);
  timer.unref?.();
  return {
    stop: (): void => clearInterval(timer),
    tick,
  };
}

const markFired = (app: App, automation: Automation, newRunIds: string[], now: Date): void => {
  const fresh = app.store.getObject('automation', automation.id) ?? automation;
  const notified = [...fresh.notifiedRunIds, ...newRunIds.filter((id) => !fresh.notifiedRunIds.includes(id))];
  app.store.putObject('automation', {
    ...fresh,
    fireCount: fresh.fireCount + 1,
    notifiedRunIds: notified.slice(-50),
    lastFiredAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
};
