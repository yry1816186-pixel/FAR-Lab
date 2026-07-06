// tests/falsifiability/_verdict_trace_fixture.ts
//
// P0-2-EXT 测试夹具：VerdictTracePersisted 的最小合法形态。
//
// 仅供「直接测 recordVerdict 持久化层」的测试用——这些测试不经过 decideFiveValueVerdict，
// 故用固定夹具而非真实 kernelOutput（与各测试自带的 fixture falsificationSpec 同性质：测试值，非真实计算）。
// 经真实 kernel 路径的验证在 verdict_trace_persist.test.ts（用 extractVerdictTrace(kernelOutput)）。
import type { VerdictTracePersisted } from '../../src/falsifiability/index.ts';

export const FIXTURE_VERDICT_TRACE: VerdictTracePersisted = {
  reasonCodes: ['FIXTURE_RULE'],
  ruleTrace: [{ ruleId: 'FIXTURE_RULE', triggered: true }],
  decisiveRuleId: 'FIXTURE_RULE',
  evidenceSufficiency: { status: 'sufficient', powerStatus: 'unknown' },
};
