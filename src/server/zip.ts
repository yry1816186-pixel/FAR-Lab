import { deflateRawSync } from 'node:zlib';

/**
 * Minimal ZIP writer (goal §CPS-7 Web package download): deflate method, CRC-32,
 * local file headers + central directory + EOCD. One owner for the whole product
 * (the runtime zod-only invariant forbids archiver/yazl deps; Node zlib is the
 * compression authority and ALSO the independent verification path —
 * tests round-trip entries through zlib.inflateRawSync, not through this module's
 * own reader). Names are UTF-8 (flag bit 11); no zip64 (package sizes are MBs).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!)!]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

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

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);          // local file header signature
    local.writeUInt16LE(20, 4);                  // version needed
    local.writeUInt16LE(0x0800, 6);              // flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME.time, 10);
    local.writeUInt16LE(DOS_TIME.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);     // compressed size
    local.writeUInt32LE(entry.content.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);                  // extra length
    chunks.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);             // central directory signature
    cd.writeUInt16LE(20, 4);                     // version made by
    cd.writeUInt16LE(20, 6);                     // version needed
    cd.writeUInt16LE(0x0800, 8);                 // flags: UTF-8
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME.time, 12);
    cd.writeUInt16LE(DOS_TIME.date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(entry.content.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    // extra/comment/disk/attrs all zero
    cd.writeUInt32LE(offset, 42);                // local header offset
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);                // central dir offset
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
