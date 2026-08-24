import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Minimal ZIP container reader (MULTIMODAL lane). Shared by every zip-based
 * scientific container format — xlsx supplements (SheetML), docx/pptx (OOXML),
 * epub (OCF) — so they all share the same caps and the same honest failure
 * taxonomy. Zero runtime dependencies (zod-only invariant): EOCD scan +
 * central-directory walk + node:zlib inflateRaw.
 *
 * Honesty rules: unsupported constructs (zip64, exotic compression) fail by
 * name; declared-vs-inflated size mismatches are refused, not truncated.
 */

const MAX_ENTRIES = 512;
const MAX_UNCOMPRESSED_PER_ENTRY = 64 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED = 256 * 1024 * 1024;

export const ZIP_LIMITS = {
  maxEntries: MAX_ENTRIES,
  maxUncompressedPerEntry: MAX_UNCOMPRESSED_PER_ENTRY,
  maxTotalUncompressed: MAX_TOTAL_UNCOMPRESSED,
} as const;

export type ZipReadResult =
  | { ok: true; entries: Map<string, Buffer> }
  | { ok: false; reason: string };

export const readZip = (buf: Buffer): ZipReadResult => {
  if (buf.length < 22) {
    return { ok: false, reason: 'not a zip archive: shorter than an end-of-central-directory record' };
  }
  // EOCD sits in the last 22 bytes + up to 64KiB comment.
  let eocd = -1;
  const scanFloor = Math.max(0, buf.length - 22 - 65_535);
  for (let i = buf.length - 22; i >= scanFloor; i -= 1) {
    if (buf.readUInt32LE(i) === 0x0605_4b50) { eocd = i; break; }
  }
  if (eocd < 0) {
    return { ok: false, reason: 'zip end-of-central-directory signature not found — file is not a zip container or is truncated' };
  }
  const entryCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entryCount > MAX_ENTRIES) {
    return { ok: false, reason: `zip declares ${entryCount} entries (cap ${MAX_ENTRIES}) — refusing` };
  }
  const entries = new Map<string, Buffer>();
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < entryCount; n += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x0201_4b50) {
      return { ok: false, reason: `zip central directory entry ${n} corrupt (offset ${p})` };
    }
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    if (csize === 0xFFFF_FFFF || usize === 0xFFFF_FFFF || lho === 0xFFFF_FFFF) {
      return { ok: false, reason: 'zip64 archive not supported (scientific writers rarely emit it) — refusing honestly' };
    }
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (usize > MAX_UNCOMPRESSED_PER_ENTRY) {
      return { ok: false, reason: `zip entry ${name} declares ${usize} uncompressed bytes (cap ${MAX_UNCOMPRESSED_PER_ENTRY})` };
    }
    total += usize;
    if (total > MAX_TOTAL_UNCOMPRESSED) {
      return { ok: false, reason: `zip total uncompressed size exceeds ${MAX_TOTAL_UNCOMPRESSED} bytes — refusing` };
    }
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x0403_4b50) {
      return { ok: false, reason: `zip local header for ${name} corrupt (offset ${lho})` };
    }
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lnlen + lelen;
    const data = buf.subarray(dataStart, dataStart + csize);
    let out: Buffer;
    if (method === 0) {
      out = Buffer.from(data);
    } else if (method === 8) {
      try {
        out = inflateRawSync(data, { maxOutputLength: MAX_UNCOMPRESSED_PER_ENTRY + 1 });
      } catch (e) {
        return { ok: false, reason: `zip entry ${name} inflate failed: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (usize > 0 && out.length !== usize) {
        return { ok: false, reason: `zip entry ${name} inflated to ${out.length} bytes but directory declares ${usize}` };
      }
    } else {
      return { ok: false, reason: `zip entry ${name}: unsupported compression method ${method} (only store/deflate)` };
    }
    entries.set(name, out);
    p += 46 + nlen + elen + clen;
  }
  return { ok: true, entries };
};

/** Test/benchmark helper: build a real zip container (store or deflate) so the
 *  suites exercise the actual container format, not a mock of it. */
export const writeZip = (parts: Array<{ name: string; data: Buffer | string; deflate?: boolean }>): Buffer => {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const enc = (s: string): Buffer => Buffer.from(s, 'utf8');
  for (const part of parts) {
    const nameBuf = enc(part.name);
    const raw = typeof part.data === 'string' ? enc(part.data) : part.data;
    const method = part.deflate === true ? 8 : 0;
    let stored: Buffer;
    let crc: number;
    if (method === 8) {
      stored = deflateRawSync(raw);
      crc = crc32(raw);
    } else {
      stored = raw;
      crc = crc32(raw);
    }
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x0403_4b50, 0);
    lfh.writeUInt16LE(20, 4);          // version needed
    lfh.writeUInt16LE(0, 6);           // flags
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10); lfh.writeUInt16LE(0, 12); // dos time/date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(stored.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);
    chunks.push(lfh, nameBuf, stored);
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x0201_4b50, 0);
    cdh.writeUInt16LE(20, 4);          // version made by
    cdh.writeUInt16LE(20, 6);          // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12); cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(stored.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);          // disk number start
    cdh.writeUInt16LE(0, 36);          // internal attrs
    cdh.writeUInt32LE(0, 38);          // external attrs
    cdh.writeUInt32LE(offset, 42);     // local header offset
    central.push(Buffer.concat([cdh, nameBuf]));
    offset += 30 + nameBuf.length + stored.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x0605_4b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, cd, eocd]);
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xEDB8_8320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf: Buffer): number => {
  let c = 0xFFFF_FFFF;
  for (let i = 0; i < buf.length; i += 1) {
    c = (CRC_TABLE[(c ^ buf[i]!) & 0xFF] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xFFFF_FFFF) >>> 0;
};
