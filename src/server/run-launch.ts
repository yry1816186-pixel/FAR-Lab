import type { App } from '../app/composition.js';
import type { RunStageName } from '../domain/run.js';
import { ResearchQuestion, ScientificGoalType, SourceDocument, newId } from '../domain/index.js';
import { canonicalSha256 } from '../shared/crypto.js';
import { MODEL_CONFIG_ID_RE, notFound, validation } from './http-kit.js';

/**
 * Shared run-launch core (BC-002 split; pure extraction from api.ts): the
 * question/seed validation + store creation path behind POST /runs, the
 * conversation launch bridge and the automations engine — one owner so every
 * producer gets identical validation, seed ingestion and async-start rules.
 */

export type StartRun = (runId: string, execOpts?: { stopAfter?: RunStageName }) => boolean;

/** R1: validate+normalize the optional `seeds` array (user-provided sources). String return = error. */
const SEED_TEXT_MAX = 50_000;

function parseSeedSources(raw: unknown): string | {
  title: string;
  identifiers: { kind: 'doi' | 'arxiv' | 'url' | 'other'; value: string }[];
  text?: string;
  year?: number;
  authors: string[];
}[] {
  if (raw === undefined) return [];
  // An EMPTY array is legitimate: the conversation launch bridge always passes
  // collectConversationSeeds(conv), and a seedless conversation must be able to
  // launch a run (2026-08-27 journey: rejecting [] broke every seedless launch
  // since the bridge landed). Only a non-array or >50 shape is invalid.
  if (!Array.isArray(raw) || raw.length > 50) {
    return 'field "seeds" must be an array of at most 50 seed sources';
  }
  const out: {
    title: string; identifiers: { kind: 'doi' | 'arxiv' | 'url' | 'other'; value: string }[];
    text?: string; year?: number; authors: string[];
  }[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return `seeds[${i}]: must be an object`;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === 'string' && rec.title.trim().length > 0
      ? rec.title.trim().slice(0, 500)
      : `User-provided source ${i + 1}`;
    let text: string | undefined;
    if (rec.text !== undefined) {
      if (typeof rec.text !== 'string' || rec.text.trim().length === 0) return `seeds[${i}].text: must be a non-empty string`;
      if (rec.text.length > SEED_TEXT_MAX) return `seeds[${i}].text: exceeds ${SEED_TEXT_MAX} chars`;
      text = rec.text;
    }
    const identifiers: { kind: 'doi' | 'arxiv' | 'url' | 'other'; value: string }[] = [];
    if (rec.identifiers !== undefined) {
      if (!Array.isArray(rec.identifiers)) return `seeds[${i}].identifiers: must be an array`;
      for (const idu of rec.identifiers) {
        if (typeof idu !== 'object' || idu === null) return `seeds[${i}].identifiers: entries must be objects`;
        const { kind, value } = idu as Record<string, unknown>;
        if (kind !== 'doi' && kind !== 'arxiv' && kind !== 'url') return `seeds[${i}].identifiers[].kind: doi|arxiv|url`;
        if (typeof value !== 'string' || value.trim().length === 0 || value.length > 500) return `seeds[${i}].identifiers[].value: 1-500 chars`;
        identifiers.push({ kind, value: value.trim() });
      }
    }
    if (identifiers.length === 0) {
      // SourceDocument requires >=1 identifier; an unidentifiable seed gets an
      // honest synthetic marker (verify_sources will report it unresolvable).
      identifiers.push({ kind: 'other', value: `user-seed:${i + 1}:${title.slice(0, 80)}` });
    }
    let year: number | undefined;
    if (rec.year !== undefined) {
      if (typeof rec.year !== 'number' || !Number.isInteger(rec.year) || rec.year < 1400 || rec.year > 2100) {
        return `seeds[${i}].year: integer 1400-2100`;
      }
      year = rec.year;
    }
    let authors: string[] = [];
    if (rec.authors !== undefined) {
      if (!Array.isArray(rec.authors) || rec.authors.some((a) => typeof a !== 'string')) return `seeds[${i}].authors: string array`;
      authors = (rec.authors as string[]).slice(0, 20).map((a) => a.slice(0, 200));
    }
    out.push({ title, identifiers, ...(text !== undefined ? { text } : {}), ...(year !== undefined ? { year } : {}), authors });
  }
  return out;
}

/**
 * Shared run-creation core (POST /runs and conversation launch): question
 * validation, optional model route, seed ingestion and async start. With
 * draft:true (§8.2) the run + seeds persist but execution does NOT start —
 * scope-proposal / PATCH question / resume complete the pre-launch journey.
 */
export const createRunWithSeeds = async (
  app: App,
  startRun: StartRun,
  body: Record<string, unknown>,
): Promise<string> => {
  const { text, domain, goalType } = body as { text?: unknown; domain?: unknown; goalType?: unknown };
  if (body.draft !== undefined && typeof body.draft !== 'boolean') {
    throw validation('field "draft" must be a boolean when given');
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw validation('field "text" is required (non-empty string: the research question)');
  }
  const dom = domain === undefined ? 'unspecified' : domain;
  if (typeof dom !== 'string' || dom.trim().length === 0) {
    throw validation('field "domain" must be a non-empty string when given');
  }
  const goal = goalType === undefined ? 'explanatory' : goalType;
  const parsedGoal = ScientificGoalType.safeParse(goal);
  if (!parsedGoal.success) {
    throw validation(`invalid goalType "${String(goal)}" — must be one of: ${ScientificGoalType.options.join(', ')}`);
  }
  const question = ResearchQuestion.parse({
    id: newId('q'),
    text,
    background: '',
    goalType: parsedGoal.data,
    scope: { domain: dom, phenomena: [text] },
    constraints: {},
    createdAt: new Date().toISOString(),
  });
  // Optional user-selected model route for THIS run (resolution: run > active default > env chain).
  const runOpts: { providerConfigId?: string } = {};
  if (body.providerConfigId !== undefined) {
    const providerConfigId = body.providerConfigId;
    if (typeof providerConfigId !== 'string' || !MODEL_CONFIG_ID_RE.test(providerConfigId)) {
      throw validation('field "providerConfigId" must be a model config id (mcfg_...)');
    }
    if (app.store.getObject('model_config', providerConfigId) === null) {
      throw notFound(`model config not found: ${providerConfigId}`);
    }
    runOpts.providerConfigId = providerConfigId;
  }
  const run = app.store.createRun(question, runOpts);
  // R1 entry upgrade: user-provided seed sources (PDF text / a parsed
  // citation / a Zotero item) join the corpus as guaranteed, provenance-
  // marked documents — the retrieve stage never searches for them, it
  // includes them and the verify stage resolves their identifiers honestly.
  const seeds = parseSeedSources(body.seeds);
  if (typeof seeds === 'string') throw validation(seeds);
  for (const seed of seeds) {
    app.store.putObject('source_document', SourceDocument.parse({
      id: newId('src'),
      runId: run.id,
      family: 'user_provided',
      identifiers: seed.identifiers,
      title: seed.title,
      ...(seed.year !== undefined ? { publicationYear: seed.year } : {}),
      ...(seed.authors.length > 0 ? { authors: seed.authors } : {}),
      contentDepth: seed.text !== undefined ? 'abstract' : 'metadata_only',
      accessState: 'unknown',
      contentHash: canonicalSha256({ title: seed.title, text: seed.text, identifiers: seed.identifiers }),
      retrievedAt: new Date().toISOString(),
      parseStatus: 'ok',
      ...(seed.text !== undefined ? { abstractText: seed.text } : {}),
    }));
  }
  if (body.draft === true) {
    // §8.2 draft: persisted, NOT started — the studies index sees status
    // 'created' and the pre-launch journey (proposal/edit/resume) owns it.
    app.store.appendEvent(run.id, {
      type: 'note',
      detail: { reason: 'run_created_draft', actor: 'human' },
    });
    return run.id;
  }
  startRun(run.id); // async execution — the 202 returns immediately; failures land in run state
  return run.id;
};
