/**
 * anti_theater detector AT-HARK —— Hypothesis Sealed After Result（HARKing：结果出来后才"预注册"假设）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_hark 伪代码）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：攻击可重复 / reasonCode / 不用 LLM-as-judge / 误报率=0）。
 *
 * 伪代码（§2）：
 *   hyp_sealed = input.preregistrationRecord.hypothesisSealedAt
 *   exp_finished = max(r.endedAt for r in input.executionTrace.runs if r.endedAt)
 *   if hyp_sealed > exp_finished:
 *       return finding(AT-HARK, FAIL, HARKING_REVISION_AFTER_RESULT,
 *                       affected=["preregistrationRecord.hypothesisSealedAt"])
 *   return None
 *
 * 适配裁决（必须遵循）：
 *   - outcome='FAIL'。attackId='AT-HARK'（makeFinding 经 ATTACK_ID_TO_KIND 自动映射到 'harking-revision-after-result'）。
 *   - blockSeal=false（HARK 不在 BLOCK 级 attack 子集·AT-FAKE-PASS/AT-JUDGE-OVERRIDE/AT-DATA-HASH-FAKE/AT-WORKFLOW-DIGEST/AT-DEP-FLOAT-DRIFT）。
 *   - runs 非空且至少 1 个非空 endedAt 时 exp_finished=max(非空 endedAt)；runs 为空或全无 endedAt → 不触发（return []）。
 *   - hyp_sealed > exp_finished 用 ISO-8601 字符串字典序比较（同格式下字典序 ≡ 时间序；两端格式一致由预注册/execution_trace 协议保证）。
 *   - reasonCode='HARKING_REVISION_AFTER_RESULT'。affectedProofHashInputs=['preregistrationRecord.hypothesisSealedAt']。
 *
 * 模型中立（F3/C1）：无 qwen/dashscope/openai 字面量。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';

/**
 * 检测假设封存时间晚于最晚实验结束时间（HARKing：先出结果后改假设）。
 *
 * @param input anti-theater lint 输入（7 字段·本 detector 消费 executionTrace.runs + preregistrationRecord.hypothesisSealedAt）
 * @returns 单 finding（FAIL·HARKING_REVISION_AFTER_RESULT）或空数组（无发现）
 */
export function detect_hark(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const hypSealed: string = input.preregistrationRecord.hypothesisSealedAt;

  // 收集所有非空 endedAt（防御性：types 标注 endedAt: string 必填，但伪代码 `if r.endedAt` 防空·此处一致）。
  const endedAtList: readonly string[] = input.executionTrace.runs
    .map((run) => run.endedAt)
    .filter((endedAt): endedAt is string => typeof endedAt === 'string' && endedAt.length > 0);

  // runs 为空或全无 endedAt → 不触发（无法判定 max·return []）。
  if (endedAtList.length === 0) {
    return [];
  }

  // max(endedAt)：先复制再 sort（不 mutate 原数组·不 mutate input），取末位为最大值。
  // 字典序 sort ≡ ISO-8601 同格式时间序（YYYY-MM-DDTHH:mm:ss... 固定位数前缀）。
  const sortedAsc: string[] = [...endedAtList].sort();
  const expFinished: string | undefined = sortedAsc[sortedAsc.length - 1];
  // 不变量：endedAtList.length > 0 已在上方 return [] 守卫，sort 后末位必然存在（防御 noUncheckedIndexedAccess）。
  if (expFinished === undefined) {
    return [];
  }

  // hyp_sealed > exp_finished（字典序）：假设在结果出来之后才封存 → HARKing。
  if (hypSealed > expFinished) {
    return [
      makeFinding({
        attackId: 'AT-HARK',
        outcome: 'FAIL',
        reasonCode: 'HARKING_REVISION_AFTER_RESULT',
        evidenceRef: 'preregistrationRecord.hypothesisSealedAt',
        message:
          `HARKing detected: hypothesis sealed at '${hypSealed}' is later than the latest experiment ` +
          `end time '${expFinished}'. The hypothesis was sealed after results were known, ` +
          `undermining preregistration as a commitment device.`,
        affectedProofHashInputs: ['preregistrationRecord.hypothesisSealedAt'],
        remediation:
          'Seal the hypothesis (preregistrationRecord.hypothesisSealedAt) before running any experiment; ' +
          'a hypothesis revised after results are observed cannot serve as a falsifiability commitment.',
      }),
    ];
  }

  // 假设先于（或同时于）最晚实验结束 → 合规·无发现。
  return [];
}
