/**
 * agent_loop 桶文件——re-export 六阶段 FSM 全部公共 API。
 *
 * Authority: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §1.1.
 *
 * 暴露 API：
 *   - 类型（types.ts）：StageId / PayloadKind / StructuredPayload / StageArtifact /
 *     StageContext / LoopState / AgentLoopError / TerminationCriteria / FeedbackSignal /
 *     ResearchPaperOutput 等
 *   - 映射 SSOT（stage_purpose.ts）：STAGE_TO_PURPOSE_TAG / getPurposeTagForStage
 *   - 单阶段骨架（run_stage.ts）：runStage / extractFinishReasonForOfflineReplay /
 *     extractFinishReasonFromOpenAIChatCompletion
 *   - 退避策略（retry_policy.ts）：withRetry / MAX_TOKENS_TABLE / DEFAULT_RETRY_OPTIONS
 *   - 六阶段执行器（stages/*）：runStage1 / runStage2 / runStage3 / runStage4 / runStage5 / runStage6
 *   - 主循环（fsm_runner.ts）：runAgentLoop / assertTerminated / DEFAULT_TERMINATION / RunAgentLoopArgs
 *   - 论文组装（paper_assembler.ts）：assemblePaper / ResearchPaperOutput
 */

export * from './types.ts';
export * from './stage_purpose.ts';
export * from './create_params.ts';
export * from './schema_gate.ts';
export * from './run_stage.ts';
export * from './retry_policy.ts';
export { runStage1 } from './stages/stage1_understanding.ts';
export { runStage2 } from './stages/stage2_integration.ts';
export { runStage3 } from './stages/stage3_hypothesis.ts';
export { runStage4 } from './stages/stage4_evidence.ts';
export { runStage5 } from './stages/stage5_plan.ts';
export { runStage6 } from './stages/stage6_feedback.ts';
export * from './fsm_runner.ts';
export * from './paper_assembler.ts';
