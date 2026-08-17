/**
 * two_phase_sigint —— CLI 两阶段 SIGINT 处理（UX-CLI-001 cancel 语义）。
 *
 * 语义：第一次 Ctrl+C = 优雅取消（cancelRun + 提示「下一 stage 边界生效」）；
 * 第二次 Ctrl+C = 恢复默认行为并立即终止（removeListener + re-raise）。
 * 依赖全部注入（notify/kill/removeListener），使两阶段语义可单元测试（不真杀进程）。
 */

export interface TwoPhaseSigintHooks {
  /** 第一次按下时的优雅取消动作（如 cancelRun(runId)——runId 未定时由调用方闭包吞掉）。 */
  readonly cancelRun: () => void;
  /** 第一次按下时向用户输出的提示。 */
  readonly notify: (message: string) => void;
  /** 第二次按下时的自终止动作（生产 = process.kill(process.pid, 'SIGINT')）。 */
  readonly killSelf: () => void;
  /** 第二次按下时把本处理器从进程上摘除（生产 = process.removeListener）。 */
  readonly removeListener: (fn: () => void) => void;
}

export const SIGINT_GRACEFUL_MESSAGE = 'cancelling at the next stage boundary (second Ctrl+C kills immediately)…';

export function createTwoPhaseSigintHandler(hooks: TwoPhaseSigintHooks): () => void {
  let firstConsumed = false;
  return function onSigint(): void {
    if (!firstConsumed) {
      firstConsumed = true;
      hooks.cancelRun();
      hooks.notify(SIGINT_GRACEFUL_MESSAGE);
      return;
    }
    hooks.removeListener(onSigint);
    hooks.killSelf();
  };
}
