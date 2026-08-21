/** Tone + label-key mapping for domain enum values (single owner of badge semantics). */
import type { BadgeTone } from './components/common';
import type { DictKey } from './i18n/dict';
import type { CitationBindingStatus, NoveltyLabel, RunStatus, StageState, TestabilityStatus } from './api/types';

export function runStatusTone(status: RunStatus): BadgeTone {
  switch (status) {
    case 'completed': return 'ok';
    case 'running': case 'queued': return 'info';
    case 'paused': case 'partial': return 'warn';
    case 'failed': return 'err';
    case 'created': case 'cancelled': return 'muted';
  }
}

export const runStatusKey = (status: RunStatus): DictKey => `status.${status}` as DictKey;

export function stageStateTone(state: StageState): BadgeTone {
  switch (state) {
    case 'done': return 'ok';
    case 'running': return 'info';
    case 'failed': return 'err';
    case 'pending': case 'skipped': return 'muted';
  }
}

export const stageStateKey = (state: StageState): DictKey => `stageState.${state}` as DictKey;

export function bindingTone(status: CitationBindingStatus): BadgeTone {
  switch (status) {
    case 'verified': return 'ok';
    case 'resolved_unaligned': return 'warn';
    case 'unresolved': return 'err';
    case 'missing': return 'muted';
  }
}

export const bindingKey = (status: CitationBindingStatus): DictKey => `binding.${status}` as DictKey;

export function testabilityTone(status: TestabilityStatus): BadgeTone {
  switch (status) {
    case 'testable_now': return 'ok';
    case 'testable_with_data': return 'info';
    case 'untestable_currently': return 'warn';
    case 'unfalsifiable': return 'err';
  }
}

export const testabilityKey = (status: TestabilityStatus): DictKey => `testability.${status}` as DictKey;

export function noveltyTone(label: NoveltyLabel): BadgeTone {
  switch (label) {
    case 'evidence_grounded': return 'info';
    case 'novel_speculation': return 'warn';
    case 'mixed': return 'muted';
  }
}

export const noveltyKey = (label: NoveltyLabel): DictKey => `novelty.${label}` as DictKey;

export function checkTone(passed: boolean): BadgeTone {
  return passed ? 'ok' : 'err';
}
