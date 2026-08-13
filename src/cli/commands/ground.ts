// src/cli/commands/ground.ts
// far ground —— ground a research question in real literature + counter-evidence.
//
// The acquisition-layer demo (K1 Phase 4). Given a research question, retrieves
// SUPPORTING evidence from an authoritative source AND adversarial counter-evidence
// (directive §16), builds an immutable corpus snapshot, and prints it. This is the
// real, evidence-grounded foundation a hypothesis should cite — NOT parametric
// LLM memory.
//
// Design:
//   · Real network fetch (OpenAlex by default; --source arxiv|crossref). Uses the
//     allowlisted, rate-limited, SSRF-fail-closed http helper.
//   · --json emits the GroundedCorpus machine-readably.
//   · Fail-closed: any retrieval error → non-zero exit + stderr (never silently
//     produce a partial corpus masquerading as complete).
//   · --max-per-query N (default 5); --no-counter-evidence disables the adversarial
//     queries (rarely wanted; counter-evidence is the thesis differentiator).
//
// Exit codes: 0 success · 1 bad args · 2 retrieval/network failure.

import { groundResearchQuestion, type GroundedCorpus } from '../../retrieval/index.ts';

/** Parsed options for the ground command. */
export interface GroundOptions {
  readonly question: string;
  readonly source: 'openalex' | 'arxiv' | 'crossref';
  readonly maxPerQuery: number;
  readonly includeCounterEvidence: boolean;
  readonly json: boolean;
}

/** Parse `far ground` args (both `--flag value` and `--flag=value` forms). */
export function parseGroundArgs(args: readonly string[]): GroundOptions | { error: string } {
  const positional: string[] = [];
  let source: 'openalex' | 'arxiv' | 'crossref' = 'openalex';
  let maxPerQuery = 5;
  let includeCounterEvidence = true;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === '--json') {
      json = true;
      continue;
    }
    if (a === '--no-counter-evidence') {
      includeCounterEvidence = false;
      continue;
    }
    if (a.startsWith('--source')) {
      const inline = a.startsWith('--source=') ? a.slice('--source='.length) : args[i + 1];
      if (inline === undefined || inline.startsWith('--')) {
        return { error: `far ground: --source needs openalex|arxiv|crossref (got: ${inline ?? '<missing>'})` };
      }
      if (inline !== 'openalex' && inline !== 'arxiv' && inline !== 'crossref') {
        return { error: `far ground: --source must be openalex|arxiv|crossref, got '${inline}'` };
      }
      source = inline;
      if (!a.startsWith('--source=')) i += 1;
      continue;
    }
    if (a.startsWith('--max-per-query')) {
      const inline = a.startsWith('--max-per-query=') ? a.slice('--max-per-query='.length) : args[i + 1];
      if (inline === undefined) {
        return { error: 'far ground: --max-per-query needs an integer in [1,25]' };
      }
      const n = Number(inline);
      if (!Number.isInteger(n) || n < 1 || n > 25) {
        return { error: `far ground: --max-per-query must be an integer in [1,25], got '${inline}'` };
      }
      maxPerQuery = n;
      if (!a.startsWith('--max-per-query=')) i += 1;
      continue;
    }
    if (a.startsWith('--')) {
      return { error: `far ground: unknown argument '${a}'` };
    }
    positional.push(a);
  }

  if (positional.length === 0) {
    return { error: 'far ground: a research question is required (e.g. far ground "does dark energy exist")' };
  }
  const question = positional.join(' ').trim();
  if (question.length === 0) {
    return { error: 'far ground: research question must be non-empty' };
  }
  return {
    question,
    source,
    maxPerQuery,
    includeCounterEvidence,
    json,
  };
}

/** Format a GroundedCorpus for human-readable display. */
function formatHuman(g: GroundedCorpus): string {
  const lines: string[] = [];
  lines.push(`Grounded corpus for: "${g.supportingQuery}"`);
  lines.push(`  source         ${g.fetchMode === 'live' ? 'live fetch' : 'replay (injected adapter)'}`);
  lines.push(`  groundedAt     ${g.groundedAt}`);
  lines.push(`  documents      ${g.corpus.documentCount} (snapshotId ${g.corpus.snapshotId.slice(0, 12)}… / rootHash ${g.corpus.rootHash.slice(0, 12)}…)`);
  lines.push(`  queries issued:`);
  for (const qc of g.perQueryCounts) {
    lines.push(`    · [${qc.count}] ${qc.query}`);
  }
  lines.push(`  documents (first 10):`);
  for (const d of g.corpus.documents.slice(0, 10)) {
    const doi = d.doi ? ` · doi:${d.doi}` : '';
    lines.push(`    - [${d.sourceType}] ${d.title}${doi}`);
    lines.push(`        ${d.canonicalUrl} · authors: ${d.authors.slice(0, 3).join(', ')}${d.authors.length > 3 ? ' et al.' : ''}`);
  }
  if (g.corpus.documentCount > 10) {
    lines.push(`    … and ${g.corpus.documentCount - 10} more`);
  }
  return lines.join('\n');
}

/** Run `far ground`. */
export async function runGround(args: readonly string[]): Promise<number> {
  const parsed = parseGroundArgs(args);
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }
  let grounded: GroundedCorpus;
  try {
    grounded = await groundResearchQuestion({
      question: parsed.question,
      source: parsed.source,
      maxPerQuery: parsed.maxPerQuery,
      includeCounterEvidence: parsed.includeCounterEvidence,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`far ground: retrieval failed (fail-closed): ${msg}\n`);
    return 2;
  }
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify({
      supportingQuery: grounded.supportingQuery,
      fetchMode: grounded.fetchMode,
      groundedAt: grounded.groundedAt,
      corpus: {
        snapshotId: grounded.corpus.snapshotId,
        rootHash: grounded.corpus.rootHash,
        documentCount: grounded.corpus.documentCount,
        sourceQueries: grounded.corpus.sourceQueries,
      },
      perQueryCounts: grounded.perQueryCounts,
      documents: grounded.corpus.documents.map((d) => ({
        documentId: d.documentId,
        sourceType: d.sourceType,
        doi: d.doi,
        title: d.title,
        authors: d.authors,
        canonicalUrl: d.canonicalUrl,
        publicationDate: d.publicationDate,
        abstract: d.abstract,
      })),
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatHuman(grounded)}\n`);
  }
  return 0;
}
