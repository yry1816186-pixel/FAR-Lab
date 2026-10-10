import { deflateRawSync } from 'node:zlib';
import { centralDirectoryHeader, crc32, endOfCentralDirectory, localFileHeader } from '../shared/zip-format.js';

/**
 * Minimal ZIP writer (goal §CPS-7 Web package download): deflate method, CRC-32,
 * local file headers + central directory + EOCD. One owner for the whole product
 * (the runtime zod-only invariant forbids archiver/yazl deps; Node zlib is the
 * compression authority and ALSO the independent verification path —
 * tests round-trip entries through zlib.inflateRawSync, not through this module's
 * own reader). Names are UTF-8 (flag bit 11); no zip64 (package sizes are MBs).
 *
 * Binary-format primitives (CRC table, header serialization) live in
 * shared/zip-format.ts (ARCH-003); this module owns the ENTRY policy:
 * deflate-when-smaller at level 9, UTF-8 name flags and the deterministic
 * 2026-01-01 DOS timestamp.
 */

export { crc32 } from '../shared/zip-format.js';

export interface ZipEntry {
  /** Forward-slash logical path inside the archive. */
  name: string;
  content: Buffer;
}

const DOS_TIME = (() => {
  // Fixed timestamp (2026-01-01 00:00:00): deterministic archives — the package's
  // own MANIFEST carries real content hashes; zip mtimes would add noise.
  return { time: 0, date: ((2026 - 1980) << 9) | (1 << 5) | 1 };
})();

/** Build a ZIP archive buffer from entries (deflated; stored when deflate loses). */
export const buildZip = (entries: readonly ZipEntry[]): Buffer => {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.content);
    const deflated = deflateRawSync(entry.content, { level: 9 });
    const useDeflate = deflated.length < entry.content.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : entry.content;

    const sizes = {
      method,
      crc,
      compressedSize: payload.length,
      uncompressedSize: entry.content.length,
      nameLength: nameBuf.length,
    };
    const local = localFileHeader(sizes, DOS_TIME, 0x0800); // flags: UTF-8 names
    chunks.push(local, nameBuf, payload);

    const cd = centralDirectoryHeader(sizes, DOS_TIME, 0x0800, offset);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = endOfCentralDirectory(entries.length, centralBuf.length, offset);
  return Buffer.concat([...chunks, centralBuf, eocd]);
};

/** Parse a ZIP back into name → raw (compressed) payload + method (test/verification path). */
export const readZipEntries = (zip: Buffer): Array<{ name: string; method: number; raw: Buffer; crc: number; size: number }> => {
  const out: Array<{ name: string; method: number; raw: Buffer; crc: number; size: number }> = [];
  let i = 0;
  while (i + 4 <= zip.length && zip.readUInt32LE(i) === 0x04034b50) {
    const method = zip.readUInt16LE(i + 8);
    const crc = zip.readUInt32LE(i + 14);
    const compressedSize = zip.readUInt32LE(i + 18);
    const size = zip.readUInt32LE(i + 22);
    const nameLen = zip.readUInt16LE(i + 26);
    const extraLen = zip.readUInt16LE(i + 28);
    const name = zip.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const rawStart = i + 30 + nameLen + extraLen;
    out.push({ name, method, raw: zip.subarray(rawStart, rawStart + compressedSize), crc, size });
    i = rawStart + compressedSize;
  }
  return out;
};
