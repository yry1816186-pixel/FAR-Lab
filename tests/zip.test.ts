import { describe, it, expect } from 'vitest';
import { crc32 as zlibCrc32, inflateRawSync } from 'node:zlib';
import { buildZip, readZipEntries, type ZipEntry } from '../src/server/zip.js';

/**
 * CPS-7 minimal ZIP writer. Verification is INDEPENDENT of the writer's own
 * logic on BOTH axes (audit P1-2 hardening): bytes are re-inflated through
 * node:zlib, and every header CRC-32 is asserted against zlib.crc32 — Node's
 * C++ implementation, not this module's table. (The earlier revision compared
 * the header CRC against the writer's own crc32() — a circular assertion that
 * hid a real index-masking bug rejected by bsdtar.)
 */

const entry = (name: string, content: string | Buffer): ZipEntry => ({ name, content: typeof content === 'string' ? Buffer.from(content, 'utf8') : content });

describe('buildZip — minimal deterministic ZIP writer', () => {
  it('round-trips entries with zlib-verified bytes AND zlib.crc32-verified headers (independent paths)', () => {
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
      // independent verification #1: bytes identical after zlib re-inflate
      expect(restored.equals(original), `entry ${p.name}`).toBe(true);
      expect(p.size).toBe(original.length);
      // independent verification #2: header CRC equals Node's own crc32
      expect(p.crc, `entry ${p.name}`).toBe(zlibCrc32(original));
    }
  });

  it('known-answer CRC vector (protocol-standard test string)', () => {
    // canonical CRC-32 test vector: "123456789" -> 0xCBF43926
    const zip = buildZip([entry('vec.txt', '123456789')]);
    const [parsed] = readZipEntries(zip);
    expect(parsed!.crc).toBe(0xcbf43926);
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
