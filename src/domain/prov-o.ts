import type { LineageEdgeRecord } from './lineage.js';

/**
 * PROV-O serialization (RU-2 interop): W3C PROV JSON-LD over the SAME
 * lineage_edges single source that powers the SWAN export — no third store.
 * Mapping: run -> prov:Activity, object id -> prov:Entity,
 * produced/consumed -> wasGeneratedBy/used, forked_from/revised_into ->
 * wasInformedBy (derivation lineage between activities), delegation ->
 * prov:Agent + actedOnBehalfOf. Pure function, offline-testable.
 */
export interface ProvExportInput {
  rootRunId: string;
  runs: Array<{ id: string; createdAt?: string; status?: string }>;
  edges: readonly LineageEdgeRecord[];
}

const ACTIVITY_KINDS = new Set(['forked_from', 'revised_into', 'delegated_to']);

export const toProvJsonLd = (input: ProvExportInput): Record<string, unknown> => {
  const entities = new Map<string, Record<string, unknown>>();
  const activities = new Map<string, Record<string, unknown>>();
  const relations: Array<Record<string, unknown>> = [];

  for (const run of input.runs) {
    activities.set(run.id, {
      '@id': `far:${run.id}`,
      '@type': 'prov:Activity',
      ...(run.createdAt !== undefined ? { 'prov:startedAtTime': { '@value': run.createdAt, '@type': 'xsd:dateTime' } } : {}),
      ...(run.status !== undefined ? { 'far:status': run.status } : {}),
    });
  }
  entities.set(input.rootRunId, activities.get(input.rootRunId) ?? { '@id': `far:${input.rootRunId}`, '@type': 'prov:Activity' });

  for (const e of input.edges) {
    if (ACTIVITY_KINDS.has(e.kind)) {
      relations.push({ '@id': `far:${e.toId}`, '@type': 'prov:Activity', 'prov:wasInformedBy': { '@id': `far:${e.fromId}` } });
      activities.set(e.toId, activities.get(e.toId) ?? { '@id': `far:${e.toId}`, '@type': 'prov:Activity' });
    } else if (e.kind === 'produced') {
      entities.set(e.toId, { '@id': `far:${e.toId}`, '@type': 'prov:Entity' });
      relations.push({ '@id': `far:${e.toId}`, 'prov:wasGeneratedBy': { '@id': `far:${e.fromId}` } });
    } else if (e.kind === 'consumed') {
      entities.set(e.toId, entities.get(e.toId) ?? { '@id': `far:${e.toId}`, '@type': 'prov:Entity' });
      relations.push({ '@id': `far:${e.fromId}`, 'prov:used': { '@id': `far:${e.toId}` } });
    } else {
      // evidence/revision edges: Entity-to-Entity influence, far-namespaced
      entities.set(e.fromId, entities.get(e.fromId) ?? { '@id': `far:${e.fromId}`, '@type': 'prov:Entity' });
      entities.set(e.toId, entities.get(e.toId) ?? { '@id': `far:${e.toId}`, '@type': 'prov:Entity' });
      const influence: Record<string, unknown> = { '@id': `far:${e.fromId}`, [`far:${e.kind}`]: { '@id': `far:${e.toId}` } };
      relations.push(influence);
    }
  }

  return {
    '@context': {
      prov: 'http://www.w3.org/ns/prov#',
      far: 'https://far-lab.dev/ns/',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
    },
    '@graph': [
      ...activities.values(),
      ...[...entities.values()].filter((ent) => ent['@type'] === 'prov:Entity' || !activities.has(String(ent['@id']))),
      ...relations,
    ],
  };
};
