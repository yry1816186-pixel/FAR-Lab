// Generates src-tauri/icons/icon.ico — 256x256 PNG embedded in ICO (Vista+ format).
// Placeholder visual: brand-ink square + white frame (final brand icon is a design follow-up).
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const S = 256;
const px = new Uint8Array(S * S * 4);
const INK = [15, 18, 21];    // #0f1215 brand ink (v2 token)
const WHITE = [255, 255, 255];
const set = (x, y, [r, g, b], a = 255) => {
  const i = (y * S + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const frame = x >= 24 && x < S - 24 && y >= 24 && y < S - 24;
    const inner = x >= 56 && x < S - 56 && y >= 56 && y < S - 56;
    const notch = x >= 56 && x < 200 && y >= 56 && y < 96; // abstract "F" top bar
    const stem = x >= 56 && x < 96 && y >= 56 && y < 200;
    const mark = notch || stem;
    set(x, y, frame ? WHITE : INK, 255);
    if (inner && mark) set(x, y, WHITE, 255);
    if (inner && !mark) set(x, y, INK, 255);
  }
}
// PNG encode (RGBA, filter 0 per scanline)
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
}
const idat = deflateSync(raw, { level: 9 });
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
let crcT = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
]);
// ICO: header(6) + one dir entry(16) + PNG payload
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 0; ico[7] = 0; // 256x256
ico.writeUInt16LE(1, 8); ico.writeUInt16LE(32, 10); // planes, bpp
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'src-tauri', 'icons', 'icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([ico, png]));
console.log('icon written:', out, fs.statSync(out).size, 'bytes');
