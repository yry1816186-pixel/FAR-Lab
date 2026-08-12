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

/** Parse `far ground` args. */
export function parseGroundArgs(args: readonly string[]): GroundOptions | { error: string } {
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length === 0) {
    return { error: 'far ground: a research question is required (e.g. far ground "does dark energy exist")' };
  }
  const question = positional.join(' ').trim();
  if (question.length === 0) {
    return { error: 'far ground: research question must be non-empty' };
  }
  const sourceArg = args.find((a) => a.startsWith('--source='))?.slice('--source='.length);
  let source: 'openalex' | 'arxiv' | 'crossref' = 'openalex';
  if (sourceArg === 'arxiv' || sourceArg === 'crossref' || sourceArg === 'openalex') {
    source = sourceArg;
  } else if (sourceArg !== undefined) {
    return { error: `far ground: --source must be openalex|arxiv|crossref, got '${sourceArg}'` };
  }
  const maxArg = args.find((a) => a.startsWith('--max-per-query='))?.slice('--max-per-query='.length);
  let maxPerQuery = 5;
  if (maxArg !== undefined) {
    const n = Number(maxArg);
    if (!Number.isInteger(n) || n < 1 || n > 25) {
      return { error: `far ground: --max-per-query must be an integer in [1,25], got '${maxArg}'` };
    }
    maxPerQuery = n;
  }
  return {
    question,
    source,
    maxPerQuery,
    includeCounterEvidence: !args.includes('--no-counter-evidence'),
    json: args.includes('--json'),
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
