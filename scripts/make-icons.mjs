#!/usr/bin/env node
/**
 * Draws the placeholder toolbar icon (teal rounded square, white "T" with a
 * euro-style bar) as PNGs without any image library. Replace with designed
 * artwork in phase 4 (Web Store assets).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../apps/extension/public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const S = 4; // supersampling
  const N = size * S;
  const r = N * 0.22;
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, r), N - r);
    const cy = Math.min(Math.max(y, r), N - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const inT = (x, y) => {
    const u = x / N;
    const v = y / N;
    const bar = v >= 0.2 && v <= 0.34 && u >= 0.2 && u <= 0.8;
    const stem = u >= 0.43 && u <= 0.57 && v >= 0.2 && v <= 0.8;
    const euro = v >= 0.5 && v <= 0.58 && u >= 0.3 && u <= 0.7;
    return bar || stem || euro;
  };
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const x = px * S + sx + 0.5;
          const y = py * S + sy + 0.5;
          if (inRounded(x, y)) {
            bg++;
            if (inT(x, y)) fg++;
          }
        }
      const a = bg / (S * S);
      const f = bg ? fg / bg : 0;
      const teal = [15, 107, 98];
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = Math.round(teal[0] * (1 - f) + 255 * f);
      raw[o + 1] = Math.round(teal[1] * (1 - f) + 255 * f);
      raw[o + 2] = Math.round(teal[2] * (1 - f) + 255 * f);
      raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`icon-${size}.png`, OUT), png(size));
console.log('icons written');
