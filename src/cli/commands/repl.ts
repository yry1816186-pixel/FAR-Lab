// src/cli/commands/repl.ts
// far repl —— 交互式 REPL：连续提问 / 追问 / fork 上一次 run。
//
// 复用 executeAskRun（runAgentLoop + ASK-9 密封）。每行输入一个 question → 跑一次 6-stage FSM。
// 诚实边界：offline_replay 下每次 question 跑同一套 fixture（按 stageId 回放），verdict 固定——
// REPL 展示的是「交互式连续 run + 证据链工程」，真实多轮差异需 --profile competition_aliyun_qwen。
//
// 指令：:help / :quit（或 Ctrl-D）/ :fork <后缀>（基于上次 question 重跑）/ :history

import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';

import { openFarDb } from '../../db/open.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import { executeAskRun, buildRender, type AskRender } from './ask.ts';

interface ReplTurn {
  readonly question: string;
  readonly runId: string;
  readonly verdict: string | null;
}

async function runOne(question: string, gitCommitSha: string): Promise<AskRender> {
  const db = openFarDb(':memory:');
  try {
    const result = await executeAskRun(db, question, 'quick', gitCommitSha);
    return buildRender(result, 'offline_replay', question);
  } finally {
    db.close();
  }
}

function printTurn(r: AskRender): void {
  const vn = r.verdict === null ? '<verdict stage not reached>' : r.verdict;
  const rule = r.decisiveRuleId === null ? '' : `(${r.decisiveRuleId})`;
  process.stdout.write(
    `  → run ${r.runId} · ${r.stageCount} stages · stop=${r.terminationReason}\n` +
      `  → verdict : ${vn}${rule}\n` +
      `  → grade  : ${r.traceGrade.score.toFixed(3)} (${r.traceGrade.gradedBy})${r.traceGrade.failureCodes.length > 0 ? ` · ${r.traceGrade.failureCodes.join(',')}` : ''}\n` +
      `  → chain   : ${r.chainHeadHash ?? '<empty chain>'}\n`,
  );
  if (r.error !== null) {
    process.stdout.write(`  → error   : ${r.error.code} — ${r.error.message}\n`);
  }
}

const HELP = `
  far repl commands:
    <question>        run one 6-stage FSM (quick mode)
    :fork <suffix>    re-run the last question with a suffix appended
    :history          show this session's past runs
    :help             this help
    :quit / Ctrl-D    exit
  default offline_replay (zero-key · fixture). real inference needs --profile (see far ask).
`;

/**
 * run repl.
 */
export async function runRepl(): Promise<number> {
  const gitCommitSha = resolveGitCommitSha();
  const history: ReplTurn[] = [];
  let lastQuestion = '';

  process.stdout.write('\n  FAR-Lab · far repl (interactive)\n');
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
        process.stdout.write('  (no history runs)\n');
      } else {
        for (const t of history) {
          const q = t.question.length > 60 ? t.question.slice(0, 60) + '…' : t.question;
          process.stdout.write(`  · ${t.runId}  verdict=${t.verdict ?? '<none>'}  q="${q}"\n`);
        }
      }
      rl.prompt();
      return;
    }
    let question = input;
    if (input.startsWith(':fork ')) {
      const suffix = input.slice(':fork '.length);
      if (lastQuestion === '') {
        process.stdout.write('  (no previous question to fork)\n');
        rl.prompt();
        return;
      }
      question = `${lastQuestion} ${suffix}`.trim();
    } else if (input === ':fork') {
      process.stdout.write('  usage: :fork <suffix>\n');
      rl.prompt();
      return;
    }

    try {
      const r = await runOne(question, gitCommitSha);
      printTurn(r);
      history.push({ question, runId: r.runId, verdict: r.verdict });
      lastQuestion = question;
    } catch (err) {
      process.stdout.write(`  ✗ run failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    rl.prompt();
  };

  return new Promise<number>((resolve) => {
    rl.on('line', (line: string) => {
      // 防御：processLine 内部有 try/catch，但 try 之外的意外 throw 会让 queue 变 rejected，
      // 后续行全部静默跳过。catch 保持链不断（审计 P2-5）。
      queue = queue
        .then(() => processLine(line))
        .catch((err: unknown) => {
          process.stdout.write(`  ✗ unexpected repl error: ${err instanceof Error ? err.message : String(err)}\n`);
          rl.prompt();
        });
    });
    rl.on('close', () => {
      process.stdout.write(`\n  far repl ended (${history.length} runs)\n\n`);
      resolve(0);
    });
  });
}
