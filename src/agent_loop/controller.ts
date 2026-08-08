// src/agent_loop/controller.ts
// P0-3 人工 hold/pause 接管（2026-08-07）。
// AgentLoopController 让外部（CLI 交互/前端 UI/测试）在 agent 运行流中插入人工干预点：
// hold() 后，fsm_runner 在下一阶段开始处发出 stage_held 事件并异步等待；
// resume() 使所有等待者立即继续，随后发出 stage_resumed 事件。
//
// 设计铁律：未 hold 时 waitIfHeld() 同步返回（零异步让步·字节等同基线行为）。

/** 人工接管控制器接口（hold → 检查/干预 → resume）。 */
export interface AgentLoopController {
  /** 请求暂停：fsm 在下一阶段开始处等待 resume。幂等（重复 hold 无副作用）。 */
  readonly hold: () => void;
  /** 恢复执行：所有等待中的 waitIfHeld() 立即 resolve。幂等（未 hold 时无副作用）。 */
  readonly resume: () => void;
  /** 当前是否处于暂停态。 */
  readonly isHeld: () => boolean;
  /** 处于暂停态则异步等待至 resume；非暂停态立即返回（零行为）。 */
  readonly waitIfHeld: () => Promise<void>;
}

/** 创建默认人工接管控制器（hold=false 初始态）。 */
export function createAgentLoopController(): AgentLoopController {
  let held = false;
  let waiters: Array<() => void> = [];

  return {
    hold: () => {
      held = true;
    },
    resume: () => {
      if (!held) return;
      held = false;
      const pending = waiters;
      waiters = [];
      for (const resolve of pending) resolve();
    },
    isHeld: () => held,
    waitIfHeld: async () => {
      if (!held) return;
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}
