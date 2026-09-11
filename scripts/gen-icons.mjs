// Generates the extension's PNG icons (green circle + white accessibility-style
// "head + arc" mark) with no image library — a minimal raw-PNG writer.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const GREEN = [47, 133, 90, 255]; // #2f855a
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

function inArc(x, y, cx, cy, r0, r1, angleStartDeg, angleEndDeg) {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist < r0 || dist > r1) return false;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
  let a = ang;
  while (a < angleStartDeg) a += 360;
  return a <= angleEndDeg;
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const min = size * 0.06;
  const max = size * 0.46;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot((x - c) / size, (y - c) / size);
      const i = (y * size + x) * 4;
      if (dist < min || dist > max || (y < c && dist < size * 0.30 && (x < c || x > c))) {
        px.set(CLEAR, i);
        continue;
      }
      px.set(GREEN, i);
    }
  }
  const n = size - 1;
  const head = { x: c, y: n * 0.34, r: n * 0.115 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inHead = Math.hypot(x - head.x, y - head.y) <= head.r;
      const inBody = inArc(x, y, c, n * 0.68, n * 0.26, n * 0.40, -20, 200);
      if (inHead || inBody) px.set(WHITE, i);
    }
  }
  return px;
}

const out = resolve(root, 'dist/icons');
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(
    resolve(out, `icon${size}.png`),
    encodePng(size, size, draw(size)),
  );
}
console.log('icons:', Object.keys({}).length === 0 ? 'generated' : 'generated');