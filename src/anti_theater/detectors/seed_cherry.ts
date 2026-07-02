/**
 * seed_cherry detector —— 种子挑选攻击检测（AT-SEED-CHERRY / seed-cherry-picking）。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §2（detect_seed_cherry 伪代码）+
 *            03 §2.1 reasonCode #8（PROTOCOL_INCOMPLETE·seed 相关约束）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：确定性 / 误报率=0 / 不用 LLM-as-judge）。
 *
 * 攻击语义：研究者从多个随机种子中只挑选出有利的 run 入报（hidden failed run），
 *           或在 freeze 后偷换 seedPolicy（pre-registration 篡改），从而伪造可复现性。
 *           本检测确定性捕获两类种子攻击：
 *             1) HIDDEN_FAILED_RUN —— 预注册声明种子集 declaredSeeds 中的某些种子
 *                在 runRegistry.runs 中找不到对应 run（被隐去）。
 *             2) SEED_POLICY_MISMATCH —— 实际 fec.seedPolicy 的 canonical hash
 *                与 freeze 时封存的 preregistrationRecord.seedPolicyHash 不一致。
 *
 * 适配裁决（D14·SeedPolicy 无 declaredSeeds 字段；种子声明改从 preregistrationRecord 读取）：
 *   - declared_seeds = input.preregistrationRecord.declaredSeeds（非 fec.seedPolicy.declaredSeeds）。
 *   - declaredSeeds === undefined → 跳过 HIDDEN_FAILED_RUN 子路径（无声明即无法判隐去）。
 *   - ran_seeds = set(input.runRegistry.runs.map(r => r.seed))。
 *   - missing = declared - ran；非空 → HIDDEN_FAILED_RUN（findingIdSuffix='-HIDDEN_RUN'）。
 *
 * frozen vs executed hash（关键裁决·冻结端来源 preregistrationRecord）：
 *   - executed = hashCanonicalJson({ seedPolicy: input.fec.seedPolicy })。
 *   - frozen   = input.preregistrationRecord.seedPolicyHash。
 *   - 不等 → SEED_POLICY_MISMATCH（findingIdSuffix='-SEED_POLICY'）。
 *
 * 模型中立（无 qwen/dashscope/openai 字面量·F3/C1）。
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。纯函数·确定性·不 mutate input·不读 FS/网络。
 */

import type { AntiTheaterLintInput, DetectorFinding } from '../types.ts';
import { makeFinding } from '../finding_factory.ts';
import { hashCanonicalJson } from '../../evidence_log/hasher.ts';

/**
 * 检测种子挑选攻击（AT-SEED-CHERRY）。
 *
 * list 型 detector：最多产出 2 条 FAIL finding（HIDDEN_FAILED_RUN + SEED_POLICY_MISMATCH），
 * 用 findingIdSuffix 区分（-HIDDEN_RUN / -SEED_POLICY）。无发现返回 []。
 *
 * 触发条件（确定性·严格）：
 *   - HIDDEN_FAILED_RUN：preregistrationRecord.declaredSeeds 非空且存在声明种子
 *     未出现在 runRegistry.runs[*].seed 中。
 *   - SEED_POLICY_MISMATCH：hashCanonicalJson({seedPolicy: fec.seedPolicy})
 *     !== preregistrationRecord.seedPolicyHash。
 *
 * 误报率=0 保证：触发条件全部基于确定性的集合差集（数值精确比较）与 SHA-256 canonical
 *               hash 字符串严格相等比较，无启发式 / 无近似 / 无概率判定。
 *
 * @param input anti-theater lint 输入（消费 preregistrationRecord.declaredSeeds / .seedPolicyHash /
 *              runRegistry.runs / fec.seedPolicy）
 * @returns 命中的 DetectorFinding 列表（最多 2 条）或空数组（未命中）
 */
export function detect_seed_cherry(input: AntiTheaterLintInput): readonly DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  // —— 子路径 1：HIDDEN_FAILED_RUN（D14·declaredSeeds 从 preregistrationRecord 读取）——
  const declaredSeeds = input.preregistrationRecord.declaredSeeds;
  if (declaredSeeds !== undefined) {
    const ranSeeds = new Set<number>(input.runRegistry.runs.map((run) => run.seed));
    const missing: number[] = [];
    for (const declared of declaredSeeds) {
      if (!ranSeeds.has(declared)) {
        missing.push(declared);
      }
    }

    if (missing.length > 0) {
      const sortedMissing = missing.slice().sort((a, b) => a - b);
      const missingDisplay = sortedMissing.join(',');
      findings.push(
        makeFinding({
          attackId: 'AT-SEED-CHERRY',
          outcome: 'FAIL',
          reasonCode: 'HIDDEN_FAILED_RUN',
          evidenceRef: input.fec.fecId,
          message:
            `Pre-registered declaredSeeds not fully present in runRegistry.runs ` +
            `(missing seeds ${missingDisplay}; declared ${declaredSeeds.length} but ran ${ranSeeds.size} distinct seeds).`,
          affectedProofHashInputs: [
            `runRegistry (missing seeds ${missingDisplay})`,
          ],
          remediation:
            'Run and log every declared seed (including failed runs) into runRegistry before sealing; ' +
            'do not omit unfavorable-seed runs from the run registry.',
          findingIdSuffix: 'HIDDEN_RUN',
        }),
      );
    }
  }

  // —— 子路径 2：SEED_POLICY_MISMATCH（executed=fec.seedPolicy hash vs frozen=preregistrationRecord.seedPolicyHash）——
  const executedSeedPolicyHash = hashCanonicalJson({ seedPolicy: input.fec.seedPolicy });
  const frozenSeedPolicyHash = input.preregistrationRecord.seedPolicyHash;
  if (executedSeedPolicyHash !== frozenSeedPolicyHash) {
    findings.push(
      makeFinding({
        attackId: 'AT-SEED-CHERRY',
        outcome: 'FAIL',
        reasonCode: 'SEED_POLICY_MISMATCH',
        evidenceRef: input.fec.fecId,
        message:
          `fec.seedPolicy canonical hash ('${executedSeedPolicyHash}') !== ` +
          `preregistrationRecord.seedPolicyHash ('${frozenSeedPolicyHash}'); seed policy mutated after freeze.`,
        affectedProofHashInputs: ['fec.seedPolicy'],
        remediation:
          'Restore fec.seedPolicy to the exact pre-registered object captured at freeze time, ' +
          'or re-run the protocol-freeze + measurement pipeline under a new sealed seed policy.',
        findingIdSuffix: 'SEED_POLICY',
      }),
    );
  }

  return findings;
}
