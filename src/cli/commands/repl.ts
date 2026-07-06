// src/cli/commands/repl.ts
// far repl —— 交互式 REPL：连续提问 / 追问 / fork 上一次 run。
//
// 复用 executeAskRun（runAgentLoop + ASK-9 密封）。每行输入一个 question → 跑一次 6-stage FSM。
// 诚实边界：offline_replay 下每次 question 跑同一套 fixture（按 stageId 回放），verdict 固定——
// REPL 展示的是「交互式连续 run + 证据链工程」，真实多轮差异需 --profile competition_aliyun_qwen。
//
// 指令：:help / :quit（或 Ctrl-D）/ :fork <后缀>（基于上次 question 重跑）/ :history

import Database from 'better-sqlite3';
import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';

import { runMigrations } from '../../db/migrator.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { executeAskRun, buildRender, type AskRender } from './ask.ts';

interface ReplTurn {
  readonly question: string;
  readonly runId: string;
  readonly verdict: string | null;
}

async function runOne(question: string, gitCommitSha: string): Promise<AskRender> {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  try {
    const result = await executeAskRun(db, question, 'quick', gitCommitSha);
    return buildRender(result, 'offline_replay', question);
  } finally {
    db.close();
  }
}

function printTurn(r: AskRender): void {
  const vn = r.verdict === null ? '<未到达裁决阶段>' : r.verdict;
  const rule = r.decisiveRuleId === null ? '' : `（${r.decisiveRuleId}）`;
  process.stdout.write(
    `  → run ${r.runId} · ${r.stageCount} stages · stop=${r.terminationReason}\n` +
      `  → verdict : ${vn}${rule}\n` +
      `  → chain   : ${r.chainHeadHash ?? '<空链>'}\n`,
  );
  if (r.error !== null) {
    process.stdout.write(`  → error   : ${r.error.code} — ${r.error.message}\n`);
  }
}

const HELP = `
  far repl 指令：
    <问题>            跑一次 6-stage FSM（quick 模式）
    :fork <后缀>      基于上次 question + 后缀 重跑
    :history          查看本会话历史 run
    :help             本帮助
    :quit / Ctrl-D    退出
  默认 offline_replay（零密钥·fixture）。真实推理需 --profile（见 far ask）。
`;

export async function runRepl(): Promise<number> {
  const gitCommitSha = resolveGitCommitSha();
  const history: ReplTurn[] = [];
  let lastQuestion = '';

  process.stdout.write('\n  FAR-Chain · far repl（交互式）\n');
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  process.stdout.write(HELP);

  const rl = readline.createInterface({ input: stdin, output: stdout, prompt: 'far> ' });
  rl.prompt();

  // 串行队列：保证多行输入（管道 / 粘贴）按序处理，不并发跑多个 loop。
  let queue: Promise<void> = Promise.resolve();

  const processLine = async (raw: string): Promise<void> => {
    const input = raw.trim();
    if (input === '') {
      rl.prompt();
      return;
    }
    if (input === ':quit' || input === ':exit') {
      rl.close();
      return;
    }
    if (input === ':help') {
      process.stdout.write(HELP);
      rl.prompt();
      return;
    }
    if (input === ':history') {
      if (history.length === 0) {
        process.stdout.write('  (无历史 run)\n');
      } else {
        for (const t of history) {
          const q = t.question.length > 60 ? t.question.slice(0, 60) + '…' : t.question;
          process.stdout.write(`  · ${t.runId}  verdict=${t.verdict ?? '<无>'}  q="${q}"\n`);
        }
      }
      rl.prompt();
      return;
    }
    let question = input;
    if (input.startsWith(':fork ')) {
      const suffix = input.slice(':fork '.length);
      if (lastQuestion === '') {
        process.stdout.write('  (无上次 question 可 fork)\n');
        rl.prompt();
        return;
      }
      question = `${lastQuestion} ${suffix}`.trim();
    } else if (input === ':fork') {
      process.stdout.write('  用法: :fork <后缀>\n');
      rl.prompt();
      return;
    }

    try {
      const r = await runOne(question, gitCommitSha);
      printTurn(r);
      history.push({ question, runId: r.runId, verdict: r.verdict });
      lastQuestion = question;
    } catch (err) {
      process.stdout.write(`  ✗ 运行失败: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    rl.prompt();
  };

  return new Promise<number>((resolve) => {
    rl.on('line', (line: string) => {
      queue = queue.then(() => processLine(line));
    });
    rl.on('close', () => {
      process.stdout.write(`\n  far repl 结束（${history.length} 次 run）\n\n`);
      resolve(0);
    });
  });
}
