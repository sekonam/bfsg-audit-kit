#!/usr/bin/env node
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regenerate `test/fixtures/shop/img/*.png`.
 *
 * The fixture shop needs real images for one reason: the report embeds element
 * screenshots, and a screenshot is only worth asserting on if there was
 * something to photograph. The fixture used to reference images that 404'd, so
 * every `image-alt` finding illustrated itself with a picture of a broken-image
 * icon — "the embedded screenshots resolve" passed while the report showed the
 * customer an empty box.
 *
 * Written by hand rather than with an image library: this is a one-off
 * generator for three 400-byte files, and a build-time image dependency would
 * cost more than it saves. Output is deterministic, so re-running it produces
 * byte-identical files and no spurious diff.
 */

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'shop',
  'img',
);

type Rgb = readonly [number, number, number];

let crcTable: Int32Array | undefined;

function crc32(buffer: Buffer): number {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const byte of buffer) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return c ^ -1;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** Minimal 8-bit truecolour PNG. */
function png(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter type: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x / width, y / height);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CARD: Rgb = [242, 243, 246];
const SOLE: Rgb = [40, 44, 52];

/** A crude shoe silhouette — recognisable enough to look like a product photo. */
const shoe =
  (upperColour: Rgb) =>
  (x: number, y: number): Rgb => {
    if (y > 0.72 && y < 0.9 && x > 0.08 && x < 0.92) return SOLE;
    const heel = (x - 0.34) ** 2 / 0.09 + (y - 0.72) ** 2 / 0.22 < 1 && y < 0.75;
    const toe = x > 0.3 && x < 0.9 && y > 0.55 && y < 0.75 && (y - 0.55) * 2.2 > 0.9 - x;
    return heel || toe ? upperColour : CARD;
  };

const IMAGES = [
  { file: 'teaser.png', width: 200, height: 100, colour: [25, 92, 158] as Rgb },
  { file: 'rot.png', width: 120, height: 120, colour: [170, 40, 40] as Rgb },
  { file: 'blau.png', width: 120, height: 120, colour: [40, 70, 160] as Rgb },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const image of IMAGES) {
  const bytes = png(image.width, image.height, shoe(image.colour));
  writeFileSync(join(OUT_DIR, image.file), bytes);
  console.log(`${image.file}: ${image.width}×${image.height}, ${bytes.byteLength} bytes`);
}
