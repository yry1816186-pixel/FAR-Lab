import { canonicalSha256 } from '../../../src/shared/crypto.js';
import { UNTRUSTED_DATA_RULE } from '../../../src/shared/untrusted.js';

/**
 * PROMPT ASSET REGISTRY (model-plane lane, 2026-08-24).
 *
 * Prompts are software assets: named, versioned, fingerprinted, with provenance.
 * Discipline (enforced, not advisory):
 *  - A prompt id registers ONE text per version. Re-registering the same id+version
 *    with DIFFERENT text throws — content edits REQUIRE a version bump (audit trail).
 *  - Fingerprints are canonical sha256 over {id, version, text} — stable across
 *    processes, usable in receipts/regression snapshots.
 *  - Template materialization is deterministic: {{var}} substitution; a missing or
 *    extra variable throws (silent partial fills are how prompt regressions ship).
 *
 * Layering: stage-level SYSTEM_PROMPT constants keep their single-source owners in
 * the stage files (eval/prompt-regression.mjs already snapshots them by file+name).
 * This registry owns the PLANE-level canonical prompts and provides the shared
 * asset machinery for migrating stage prompts in place (adoption path in
 * .planning/handoffs/MODEL.md §prompts).
 */

export interface PromptProvenance {
  /** Owning module (single source of truth for the text). */
  origin: string;
  /** ISO date of the current text's last intentional change. */
  lastChanged: string;
  /** Why the prompt exists / decision reference, one line. */
  note?: string;
}

export interface PromptAsset {
  readonly id: string;
  readonly version: number;
  readonly text: string;
  readonly provenance: PromptProvenance;
  readonly fingerprint: string;
}

export const promptFingerprint = (id: string, version: number, text: string): string =>
  canonicalSha256({ id, version, text });

export const definePrompt = (
  id: string,
  version: number,
  text: string,
  provenance: PromptProvenance,
): PromptAsset => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`prompt id must be kebab-case: ${id}`);
  if (!Number.isInteger(version) || version < 1) throw new Error(`prompt version must be a positive integer: ${id}@${version}`);
  if (text.trim().length === 0) throw new Error(`prompt text must be non-empty: ${id}`);
  return Object.freeze({ id, version, text, provenance, fingerprint: promptFingerprint(id, version, text) });
};

export class PromptRegistry {
  private readonly byKey = new Map<string, PromptAsset>();
  private readonly latest = new Map<string, PromptAsset>();

  register(asset: PromptAsset): PromptAsset {
    const key = `${asset.id}@${asset.version}`;
    const existing = this.byKey.get(key);
    if (existing !== undefined && existing.fingerprint !== asset.fingerprint) {
      throw new Error(
        `prompt asset conflict: ${key} already registered with different text — bump the version to change content`,
      );
    }
    this.byKey.set(key, asset);
    const currentLatest = this.latest.get(asset.id);
    if (currentLatest === undefined || asset.version > currentLatest.version) {
      this.latest.set(asset.id, asset);
    }
    return asset;
  }

  get(id: string, version?: number): PromptAsset {
    const asset = version === undefined ? this.latest.get(id) : this.byKey.get(`${id}@${version}`);
    if (asset === undefined) {
      throw new Error(version === undefined ? `unknown prompt asset: ${id}` : `unknown prompt asset: ${id}@${version}`);
    }
    return asset;
  }

  list(): PromptAsset[] {
    return [...this.latest.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}

/**
 * Deterministic template fill: every {{var}} in the template must be supplied, and
 * every supplied variable must appear in the template — both directions checked so a
 * refactor that renames one side fails at materialization, not in the model output.
 */
export const materializePrompt = (template: string, vars: Record<string, string>): string => {
  const declared = new Set<string>();
  const filled = template.replace(/\{\{([a-z][a-z0-9-]*)\}\}/g, (_m, name: string) => {
    declared.add(name);
    if (!(name in vars)) throw new Error(`prompt template variable not supplied: {{${name}}}`);
    return vars[name]!;
  });
  const extra = Object.keys(vars).filter((k) => !declared.has(k));
  if (extra.length > 0) throw new Error(`prompt template variables not present in template: ${extra.join(', ')}`);
  return filled;
};

/**
 * THE plane-level registry instance. Plane-owned prompts (canonical across every
 * caller) live here; their text owners stay in their original modules — this registry
 * references, never forks.
 */
export const planePrompts = new PromptRegistry();

/** RU-3 T1 canonical untrusted-content discipline (owner: src/shared/untrusted.ts). */
planePrompts.register(definePrompt(
  'untrusted-data-rule', 1, UNTRUSTED_DATA_RULE,
  { origin: 'src/shared/untrusted.ts', lastChanged: '2026-08-22', note: 'RU-3 COGSEC T1 choke-point rule appended by invokeStructured + agent kernel' },
));

/**
 * Registry view compatible with eval/prompt-snapshot.json entries (file/name/chars/
 * sha256/sample) so the offline regression gate can fold registry assets into its
 * snapshot set without a format change (adoption path, see handoff).
 */
export const regressionSnapshotEntries = (registry: PromptRegistry): Array<{
  file: string; name: string; chars: number; sha256: string; sample: string;
}> =>
  registry.list().map((a) => ({
    file: a.provenance.origin,
    name: `${a.id}@v${a.version}`,
    chars: a.text.length,
    sha256: a.fingerprint.slice(0, 16),
    sample: a.text.slice(0, 60),
  }));
