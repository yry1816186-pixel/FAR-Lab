/**
 * Single owner of the ZIP binary-format write primitives (ARCH-003): the CRC-32
 * table and the local-file-header / central-directory / end-of-central-directory
 * serializations shared by every ZIP writer in the tree. Entry POLICY stays with
 * each caller — src/server/zip.ts pins deterministic DOS dates (2026-01-01) and
 * UTF-8 name flags for reproducibility packages; src/ingest/zip.ts writes
 * zero-dated archives for the test/benchmark fixtures. One table, one header
 * layout: silent divergence between writers is no longer possible.
 *
 * Verification stays independent of this module: the suites assert header CRCs
 * against node:zlib's crc32 and re-inflate payloads through node:zlib.
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[((c ^ buf[i]!) & 0xff)!]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** DOS timestamp policy: (time, date) words exactly as they land in the headers. */
export interface ZipDosTimestamp {
  time: number;
  date: number;
}

export interface ZipEntrySizes {
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  nameLength: number;
}

/** 30-byte local file header (extra-field length fixed at 0 — both writers emit none). */
export const localFileHeader = (sizes: ZipEntrySizes, ts: ZipDosTimestamp, flags: number): Buffer => {
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);          // local file header signature
  local.writeUInt16LE(20, 4);                  // version needed
  local.writeUInt16LE(flags, 6);               // general-purpose flags (e.g. UTF-8 names)
  local.writeUInt16LE(sizes.method, 8);
  local.writeUInt16LE(ts.time, 10);
  local.writeUInt16LE(ts.date, 12);
  local.writeUInt32LE(sizes.crc, 14);
  local.writeUInt32LE(sizes.compressedSize, 18);
  local.writeUInt32LE(sizes.uncompressedSize, 22);
  local.writeUInt16LE(sizes.nameLength, 26);
  local.writeUInt16LE(0, 28);                  // extra length
  return local;
};

/** 46-byte central directory header (extra/comment/disk/attrs fixed at 0 — both
 *  writers emit none; only the local-header offset varies per entry). */
export const centralDirectoryHeader = (sizes: ZipEntrySizes, ts: ZipDosTimestamp, flags: number, offset: number): Buffer => {
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);             // central directory signature
  cd.writeUInt16LE(20, 4);                     // version made by
  cd.writeUInt16LE(20, 6);                     // version needed
  cd.writeUInt16LE(flags, 8);
  cd.writeUInt16LE(sizes.method, 10);
  cd.writeUInt16LE(ts.time, 12);
  cd.writeUInt16LE(ts.date, 14);
  cd.writeUInt32LE(sizes.crc, 16);
  cd.writeUInt32LE(sizes.compressedSize, 20);
  cd.writeUInt32LE(sizes.uncompressedSize, 24);
  cd.writeUInt16LE(sizes.nameLength, 28);
  // extra/comment length, disk number start, internal/external attrs: all zero
  cd.writeUInt32LE(offset, 42);                // local header offset
  return cd;
};

/** 22-byte end-of-central-directory record (single-disk, no comment). */
export const endOfCentralDirectory = (entryCount: number, centralSize: number, centralOffset: number): Buffer => {
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entryCount, 8);
  eocd.writeUInt16LE(entryCount, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);       // central dir offset
  return eocd;
};
