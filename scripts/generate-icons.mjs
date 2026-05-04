#!/usr/bin/env node
/**
 * Generate PWA placeholder icons using pure Node.js (no external deps).
 * Produces 192x192 and 512x512 PNG files with a #475569 background and "K" text.
 *
 * PNG structure: signature + IHDR + IDAT (zlib-deflated) + IEND
 * Text rendering is approximated via a 7x9 bitmap font for the letter "K".
 */

import { writeFileSync, mkdirSync } from "fs";
import { createDeflateRaw } from "zlib";
import { promisify } from "util";

const deflateRaw = promisify(createDeflateRaw().constructor);

// zlib deflate helper
async function deflate(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const d = createDeflateRaw({ level: 9 });
    d.on("data", (c) => chunks.push(c));
    d.on("end", () => resolve(Buffer.concat(chunks)));
    d.on("error", reject);
    d.end(data);
  });
}

// CRC32 table
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf, initial = 0xffffffff) {
  let c = initial;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const payload = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Minimal 7x9 bitmap for letter "K"
// Each row is a bitmask (7 bits wide, bit 6 = leftmost)
const GLYPH_K = [
  0b1000010,
  0b1000100,
  0b1001000,
  0b1010000,
  0b1100000,
  0b1010000,
  0b1001000,
  0b1000100,
  0b1000010,
];
const GLYPH_W = 7;
const GLYPH_H = 9;

async function generatePng(size, maskable) {
  // Background: #475569 = R71 G85 B105
  const bgR = 0x47, bgG = 0x55, bgB = 0x69;
  // Foreground (text): white #FFFFFF, with slight padding for maskable safe zone
  const fgR = 0xff, fgG = 0xff, fgB = 0xff;

  // Scale the glyph
  const scale = Math.floor(size / 24);
  const gW = GLYPH_W * scale;
  const gH = GLYPH_H * scale;
  const ox = Math.floor((size - gW) / 2);
  const oy = Math.floor((size - gH) / 2);

  // For maskable icons, restrict content to the 80% safe zone (center 80%)
  const safeInset = maskable ? Math.floor(size * 0.1) : 0;

  // Build raw pixel rows (RGB, filter byte prepended = filter type 0 = None)
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      // maskable: fill safe zone background solidly (same color), text only inside safe zone
      const inSafe = x >= safeInset && x < size - safeInset && y >= safeInset && y < size - safeInset;

      let r = bgR, g = bgG, b = bgB;

      if (!maskable || inSafe) {
        // Check if this pixel is part of the glyph
        const gx = x - ox;
        const gy = y - oy;
        if (gx >= 0 && gx < gW && gy >= 0 && gy < gH) {
          const row_idx = Math.floor(gy / scale);
          const col_idx = Math.floor(gx / scale);
          const bit = (GLYPH_K[row_idx] >> (GLYPH_W - 1 - col_idx)) & 1;
          if (bit) { r = fgR; g = fgG; b = fgB; }
        }
      }

      const off = 1 + x * 3;
      row[off] = r;
      row[off + 1] = g;
      row[off + 2] = b;
    }
    rows.push(row);
  }

  const rawData = Buffer.concat(rows);
  const compressed = await deflate(rawData);

  // zlib wrap: add zlib header (0x78 0x01) and adler32 checksum
  let adler = 1;
  const MOD_ADLER = 65521;
  let s1 = 1, s2 = 0;
  for (let i = 0; i < rawData.length; i++) {
    s1 = (s1 + rawData[i]) % MOD_ADLER;
    s2 = (s2 + s1) % MOD_ADLER;
  }
  adler = ((s2 << 16) | s1) >>> 0;

  const zlibData = Buffer.alloc(2 + compressed.length + 4);
  zlibData[0] = 0x78; // CMF: deflate, window size 32K
  zlibData[1] = 0x01; // FLG: no dict, check bits
  compressed.copy(zlibData, 2);
  zlibData.writeUInt32BE(adler, 2 + compressed.length);

  // PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // width
  ihdrData.writeUInt32BE(size, 4);  // height
  ihdrData[8] = 8;                  // bit depth
  ihdrData[9] = 2;                  // color type: RGB
  ihdrData[10] = 0;                 // compression: deflate
  ihdrData[11] = 0;                 // filter: adaptive
  ihdrData[12] = 0;                 // interlace: none

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdrData),
    pngChunk("IDAT", zlibData),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const outDir = new URL("../public/icons", import.meta.url).pathname;
  mkdirSync(outDir, { recursive: true });

  const files = [
    { name: "icon-192.png",          size: 192, maskable: false },
    { name: "icon-512.png",          size: 512, maskable: false },
    { name: "icon-maskable-192.png", size: 192, maskable: true  },
    { name: "icon-maskable-512.png", size: 512, maskable: true  },
  ];

  for (const { name, size, maskable } of files) {
    const buf = await generatePng(size, maskable);
    const dest = `${outDir}/${name}`;
    writeFileSync(dest, buf);
    console.log(`Generated ${dest} (${buf.length} bytes)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
