// src/cli/commands/court.ts
// `far court` reserves the public CLI surface for genuine cross-model runs.
//
// The current standalone CLI has only one built-in runtime gateway and therefore
// cannot construct two independently configured model targets. It fails
// honestly with NOT_SUPPORTED instead of relabelling repeated calls as a
// unanimous cross-model certificate. Embedders can configure independent
// targets through the API service contract.

/** Parsed court arguments. */
export interface CourtArgs {
  readonly claim: string;
  readonly models: readonly string[];
  readonly json: boolean;
}

const DEFAULT_MODELS = ['model-a', 'model-b'];

export function parseCourtArgs(argv: readonly string[]): CourtArgs {
  let claim = '';
  let models: readonly string[] = DEFAULT_MODELS;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === '--models') {
      const raw = argv[++index] ?? '';
      const parts = raw.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
      if (parts.length < 2) {
        throw new Error('far court: --models requires at least two distinct configured target ids');
      }
      if (new Set(parts).size !== parts.length) {
        throw new Error('far court: --models target ids must be unique');
      }
      models = parts;
      continue;
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(`far court: unknown argument "${argument}"`);
    }
    claim = claim === '' ? argument : `${claim} ${argument}`;
  }

  return { claim, models, json };
}

export { computeAgreement } from '../../api/internal/court_service.ts';
export type { ReliabilityCertificate } from '../../api/internal/court_service.ts';

export async function runCourt(argv: readonly string[]): Promise<number> {
  const args = parseCourtArgs(argv);
  if (args.claim.trim().length === 0) {
    process.stderr.write(
      'far court: missing claim.\n' +
        '  usage: far court "<claim>" [--models configured-a,configured-b] [--json]\n',
    );
    return 2;
  }

  const payload = {
    status: 'NOT_SUPPORTED',
    code: 'COURT_TARGETS_NOT_CONFIGURED',
    claim: args.claim,
    requestedModels: args.models,
    requirement:
      'at least two independently configured model targets with distinct independence keys, exact model snapshots, and observed-model allowlists',
    guidance:
      'configure courtModelTargets through the embedding API; the standalone CLI will not relabel repeated calls through one gateway as cross-model evidence',
  } as const;

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stderr.write(
      `far court: ${payload.status} — ${payload.requirement}.\n` +
        `  ${payload.guidance}.\n`,
    );
  }
  return 3;
}
