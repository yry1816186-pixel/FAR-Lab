/**
 * Lane-07 RO-Crate 1.1 metadata for the reproducibility package. Structure verified
 * against the 1.1 spec (root-data-entity + data-entities pages, 2026-08): context
 * `https://w3id.org/ro/crate/1.1/context`, self-describing descriptor with
 * `about` -> `./`, `conformsTo` -> `https://w3id.org/ro/crate/1.1`. File checksums use a
 * plain `sha256` property: the 1.1 context has no sha256 term (verified by fetching the
 * context JSON), but 1.2 maps it to schema.org — plain sha256 is forward-compatible and
 * ignored harmlessly by strict 1.1 consumers. MANIFEST.json remains the authoritative
 * checksum contract; this crate is interoperability metadata.
 */

export interface CrateFile {
  /** Relative path from the crate root, `/`-separated. */
  path: string;
  sha256: string;
  encodingFormat: string;
  name: string;
}

export interface RoCrateInput {
  name: string;
  description: string;
  /** ISO 8601 date (day precision or finer) — spec requires at least day precision. */
  datePublished: string;
  license: { '@id': string; name: string; description?: string };
  files: readonly CrateFile[];
  /** Versioned software provenance (FAR-Lab itself). */
  software: { name: string; version: string };
}

export const buildRoCrate = (input: RoCrateInput): Record<string, unknown> => ({
  '@context': 'https://w3id.org/ro/crate/1.1/context',
  '@graph': [
    {
      '@type': 'CreativeWork',
      '@id': 'ro-crate-metadata.json',
      conformsTo: { '@id': 'https://w3id.org/ro/crate/1.1' },
      about: { '@id': './' },
    },
    {
      '@id': './',
      '@type': 'Dataset',
      name: input.name,
      description: input.description,
      datePublished: input.datePublished,
      license: { '@id': input.license['@id'] },
      hasPart: input.files.map((f) => ({ '@id': f.path })),
    },
    ...input.files.map((f) => ({
      '@id': f.path,
      '@type': 'File',
      name: f.name,
      encodingFormat: f.encodingFormat,
      sha256: f.sha256,
    })),
    {
      '@id': input.license['@id'],
      '@type': 'CreativeWork',
      name: input.license.name,
      ...(input.license.description !== undefined ? { description: input.license.description } : {}),
    },
    {
      '@id': 'https://github.com/yry1816186-pixel/FAR-Lab',
      '@type': 'SoftwareApplication',
      name: input.software.name,
      softwareVersion: input.software.version,
    },
  ],
});

export const APACHE_2_LICENSE = {
  '@id': 'https://spdx.org/licenses/Apache-2.0',
  name: 'Apache License 2.0',
  description: 'The adjudicated license of the exporting workspace (D-070).',
} as const;
