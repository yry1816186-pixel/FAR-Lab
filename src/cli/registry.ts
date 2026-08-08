// src/cli/registry.ts
// 职责：FAR-Lab CLI 命令注册表 + 表驱动分发层（FI-1 · far 命令家族）。
//
// 设计：
//   1. 每个 CLI 命令是一个 CliCommand 描述符（name / aliases / description / run）。
//   2. 分发器 runCli 只做三件事：查表（findCommand）→ 处理 -h/--help → 调用 run。
//   3. 注册表与命令实现分离：registry 不 import 任何命令模块，命令实现（含子命令
//      parseOptions + OptionSchema 解析）由调用方（src/cli/far.ts）以 COMMANDS 数组注入。
//      这样 registry 可以独立测试，且 far.ts 可以按需 lazy import 重型命令。
//   4. 约定：run 返回 number = 进程退出码；返回 undefined = 命令自行管理进程生命周期
//      （当前仅 far api：Fastify server 注册了 SIGINT/SIGTERM 优雅关停，保持事件循环存活）。

/** 单个 CLI 命令描述符。run 返回 number = 退出码；undefined = 命令接管进程生命周期。 */
export interface CliCommand {
  readonly name: string;
  /** 额外触发名（如 version 的 --version / -v）。 */
  readonly aliases?: readonly string[];
  /** 一行摘要（帮助 / 文档生成用）。 */
  readonly description: string;
  readonly run: (args: readonly string[]) => number | Promise<number> | void | Promise<void>;
}

/** 分发器运行时上下文：命令实现 + 帮助文本来源。 */
export interface CliRuntime {
  readonly commands: readonly CliCommand[];
  readonly helpText: string;
  readonly commandHelp: (command: string) => string;
}

/** 精确匹配命令名或别名（区分大小写，与历史 far 行为一致）。 */
export function findCommand(commands: readonly CliCommand[], name: string): CliCommand | undefined {
  return commands.find(
    (cmd) =>
      cmd.name === name || (cmd.aliases !== undefined && cmd.aliases.includes(name)),
  );
}

/** 全部命令名（排序，去重）。 */
export function listCommands(commands: readonly CliCommand[]): readonly string[] {
  return [...new Set(commands.map((cmd) => cmd.name))].sort();
}

/**
 * 表驱动分发入口。返回 number = 应作为进程退出码；返回 undefined = 命令接管进程生命周期。
 *
 * 行为与重构前的 main() 逐字一致：
 *   - 无命令 / --help / -h        → 打印整份帮助（无命令 exit 1，显式 help exit 0）
 *   - `far <cmd> --help` / -h     → 打印该命令用法片段（未知命令回退整份帮助），exit 0
 *   - 未知命令                    → stderr 报错 + 整份帮助，exit 1
 *   - 已知命令                    → 调 run(argv.slice(1))，透传退出码
 */
export async function runCli(
  runtime: CliRuntime,
  argv: readonly string[],
): Promise<number | undefined> {
  const command = argv[0];

  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(runtime.helpText);
    return command === undefined ? 1 : 0;
  }

  // Per-command help: `far <cmd> --help` / `-h` prints that command's usage section.
  if (argv.slice(1).some((a) => a === '-h' || a === '--help')) {
    process.stdout.write(runtime.commandHelp(command) + '\n');
    return 0;
  }

  const cmd = findCommand(runtime.commands, command);
  if (cmd === undefined) {
    process.stderr.write(`far: unknown command '${command}'\n\n${runtime.helpText}`);
    return 1;
  }

  const exitCode = await cmd.run(argv.slice(1));
  return exitCode === undefined ? undefined : exitCode;
}
