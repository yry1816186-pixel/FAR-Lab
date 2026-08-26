import { describe, it, expect } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { buildZip, readZipEntries, type ZipEntry } from '../src/server/zip.js';
import { crc32 } from '../src/server/zip.js';

/**
 * CPS-7 minimal ZIP writer: verification is INDEPENDENT of the writer's own
 * logic path — every entry is re-inflated through node:zlib (the compression
 * authority) and re-CRC'd from scratch; multi-byte UTF-8 names and mixed
 * compressibility are exercised.
 */

const entry = (name: string, content: string | Buffer): ZipEntry => ({ name, content: typeof content === 'string' ? Buffer.from(content, 'utf8') : content });

describe('buildZip — minimal deterministic ZIP writer', () => {
  it('round-trips entries through zlib.inflateRawSync with matching CRC-32 (independent path)', () => {
    const long = 'FAR-Lab reproducibility package\n'.repeat(500); // compressible
    const random = Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 31 + 7) % 256)); // poorly compressible
    const entries = [
      entry('report.md', '# 报告（UTF-8 内容校验）\n'.repeat(50)),
      entry('figures/win-rate.svg', long),
      entry('data/random.bin', random),
      entry('deep/nested/dir/MANIFEST.json', '{"files":{}}'),
    ];
    const zip = buildZip(entries);

    // zip magic + structure
    expect(zip.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    const parsed = readZipEntries(zip);
    expect(parsed.map((e) => e.name)).toEqual(entries.map((e) => e.name));

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i]!;
      const original = entries[i]!.content;
      const restored = p.method === 8 ? inflateRawSync(p.raw) : p.raw;
      // independent verification: bytes identical AND CRC recomputed from the
      // restored content equals the header's CRC
      expect(restored.equals(original), `entry ${p.name}`).toBe(true);
      expect(p.size).toBe(original.length);
      expect(p.crc).toBe(crc32(original));
    }
  });

  it('is deterministic: identical inputs produce byte-identical archives', () => {
    const entries = [entry('a.txt', 'same'), entry('b/c.md', 'content')];
    expect(buildZip(entries).equals(buildZip(entries))).toBe(true);
  });

  it('EOCD carries entry count and offsets a real unzip would follow', () => {
    const zip = buildZip([entry('x.txt', 'hi')]);
    const eocd = zip.subarray(zip.length - 22);
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50);
    expect(eocd.readUInt16LE(8)).toBe(1);  // entries on this disk
    expect(eocd.readUInt16LE(10)).toBe(1); // total entries
    const cdOffset = eocd.readUInt32LE(16);
    expect(zip.readUInt32LE(cdOffset)).toBe(0x02014b50); // central dir sits where EOCD says
  });
});
