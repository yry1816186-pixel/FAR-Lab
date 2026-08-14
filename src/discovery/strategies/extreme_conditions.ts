/**
 * Strategy: extreme_conditions — extrapolation into observable extreme
 * regimes (directive §2.1-5).
 *
 * Epistemic move: take a key parameter of the question (temperature, length
 * or time scale, concentration, field strength, population size, …) and push
 * it into an extreme regime that real instruments or archives CAN reach,
 * then hypothesize where the dominant mechanism hands over to a different
 * one. Much of physics lives in exactly these handovers — but an
 * "extreme" no instrument can probe is unfalsifiable by construction, so
 * the regime must be observable and the handover signature measurable on
 * both sides of the switch point.
 */

import type { StrategyDefinition } from './strategy.ts';
import { ALWAYS_APPLICABLE } from './strategy.ts';

export const extremeConditionsStrategy: StrategyDefinition = {
  id: 'extreme_conditions',
  signature: 'question_parameters, question -> extreme_regime_mechanism_handover_hypothesis',
  epistemicMove:
    'push a key parameter into an observable extreme regime and hypothesize the mechanism-handover point',
  maxPerCall: 2,
  requiredMarkers: ['EXTREME_REGIME:', 'HANDOVER_PREDICTION:'],
  evaluateApplicability: () => ALWAYS_APPLICABLE,
  instruction: [
    'Choose ONE key parameter of the question (temperature, length or time scale,',
    'concentration, field strength, population size, …) and push it into an extreme regime',
    'that is OBSERVABLE — reachable by real instruments, experiments, or archival data. In',
    'that regime, propose a hypothesis about which mechanism takes over dominance and where',
    'the handover from the currently dominant mechanism occurs.',
    '',
    'STRUCTURAL REQUIREMENT: the "mechanism" field MUST be formatted as',
    '"EXTREME_REGIME: <the parameter and its extreme interval>" followed by',
    '"HANDOVER_PREDICTION: <the difference observable on each side of the handover point>".',
    'The falsificationMethod MUST target the handover signature — a measurement straddling',
    'the switch point that would come out differently if no handover occurred. A regime no',
    'instrument can reach, or a handover with no measurable two-sided signature, fails this',
    'strategy.',
  ].join('\n'),
};
