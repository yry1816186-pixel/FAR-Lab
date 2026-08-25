import fs from 'node:fs';
import { openDb } from '../persistence/db.js';
import { Store } from '../persistence/store.js';
import { openArtifactStore } from '../persistence/artifacts.js';
import { CampaignSpec } from '../domain/campaign.js';
import { driveCampaign } from '../app/campaign-driver.js';
import type { CliResult } from './experiment.js';

/**
 * `far campaign run <spec.json>` — the RU-8 campaign driver as a user-operable
 * surface (14-10 closure: campaign.ts/campaign-driver.ts leave test-only status).
 * Owns nothing: far.db stays the authority; this layer parses input, drives the
 * preregistered decision core (DAG readiness, stop rules, alpha ledger) and
 * renders the honest terminal outcome. Units execute through the REAL
 * experiment executor (same path as `far experiment run`); --json prints the
 * machine outcome.
 */
export const campaignCommand = async (sub: string | undefined, a: {
  dataDir: string;
  positional: string | undefined;
  flag: (n: string) => boolean;
  arg: (n: string) => string | undefined;
}): Promise<CliResult> => {
  const usage = 'far campaign requires a subcommand: run <campaign-spec.json> [--allow-local-datasets]';
  if (sub !== 'run') return { code: 2, text: usage };
  const specPath = a.positional;
  if (specPath === undefined) return { code: 2, text: `run requires a campaign-spec JSON file path.\n${usage}` };

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    return { code: 2, text: `cannot read campaign spec ${specPath}: ${e instanceof Error ? e.message : String(e)}` };
  }
  const parsed = CampaignSpec.safeParse(raw);
  if (!parsed.success) {
    return { code: 2, text: `campaign spec failed validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }
  const spec = parsed.data;

  const db = openDb(`${a.dataDir}/far.db`);
  const store = new Store(db);
  const artifacts = openArtifactStore(`${a.dataDir}/artifacts`);
  try {
    if (store.getRun(spec.runId) === null) {
      return { code: 2, text: `campaign references unknown run ${spec.runId} — campaigns drive experiments of an existing research run (see far runs)` };
    }
    const outcome = await driveCampaign(store, artifacts, spec, {
      allowLocalDatasets: a.flag('--allow-local-datasets'),
    });
    const lines = outcome.unitStates.map((u) => `${u.label}: ${u.state}`);
    return {
      code: outcome.stopped ? 0 : 1,
      json: outcome,
      text: outcome.stopped
        ? `campaign ${outcome.campaignId} stopped (${outcome.stopReason}) — units: ${lines.join('; ')}; experiments: ${outcome.executedRunIds.join(', ') || '(none)'}`
        : `campaign ${outcome.campaignId} did NOT reach a stop rule — units: ${lines.join('; ')}`,
    };
  } catch (e) {
    return { code: 1, text: `campaign failed: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    db.close();
  }
};
