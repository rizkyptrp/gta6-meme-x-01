// generate-meme.ts — draws the GTA 6 launch-week meme as a 1024x1024 PNG.
//
// The picture is a Vice City sunset beach: the make.fun ghost (white, black
// outline, four-pointed sparkle eyes, round little hand) lounging on a
// magenta beach towel in a straw hat, holding up its magenta star coin.
// Behind it a synthwave sun, palm trees, a "GTA VI" billboard and a
// "LEONIDA" sign. Top caption: WAITED 13 YEARS FOR GTA 6. Bottom caption:
// 1 SICK DAY. WORTH IT.
//
// Node 22, standard library only. Fully deterministic: no clock, no
// unseeded randomness anywhere. Every pixel is computed in code — no image
// files are read, no network, no canvas library. The PNG bytes (headers,
// deflate via node:zlib, CRC32 checksums) are assembled by hand, and the
// letters come from a bitmap font defined glyph by glyph below.
//
// Usage: run from this directory with Node 22:
//   node generate-meme.ts
// It writes meme.png next to itself.

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// The whole picture lives in one RGB buffer, 3 bytes per pixel.
const img = new Uint8Array(W * H * 3);

// A colour is a plain [r, g, b] triple, each channel 0-255.
function px(x, y, c) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  const off = (iy * W + ix) * 3;
  img[off] = c[0];
  img[off + 1] = c[1];
  img[off + 2] = c[2];
}

function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let off = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      img[off] = c[0];
      img[off + 1] = c[1];
      img[off + 2] = c[2];
      off += 3;
    }
  }
}

// Linear interpolation between two numbers, and between two colours.
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// A multi-stop vertical gradient: stops are [y, colour] pairs, sorted by y.
function gradientAt(stops, y) {
  if (y <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i][0]) {
      const [y0, c0] = stops[i - 1];
      const [y1, c1] = stops[i];
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return mix(c0, c1, t);
    }
  }
  return stops[stops.length - 1][1];
}

// Tiny deterministic pseudo-random generator (mulberry32) with a fixed
// seed, used only for harmless texture speckles and window lights. Same
// seed in, same picture out — the output never changes between runs.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261120);

// ---------------------------------------------------------------------------
// PNG encoding, done by hand. A PNG file is:
//   8-byte signature, then chunks: [4-byte length][4-byte type][data][CRC32]
// We write IHDR (size + colour type 2 = truecolour RGB), one IDAT holding
// the zlib-deflated scanlines (each scanline starts with filter byte 0),
// and IEND. Deflate itself comes from node:zlib; everything else is ours.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  const crcInput = Buffer.concat([Buffer.from(type, "ascii"), data]);
  out.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return out;
}

function savePng(path) {
  // Build the raw image data: one filter byte (0 = none) per scanline,
  // then the RGB bytes of that row.
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const dst = y * (1 + W * 3);
    raw[dst] = 0;
    Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, dst + 1);
  }
  const compressed = deflateSync(raw, { level: 9 });

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const file = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, file);
  return file.length;
}

// ---------------------------------------------------------------------------
// Bitmap font. Every glyph is 5 columns wide and 7 rows tall, written out
// here by hand: "#" is an inked pixel, "." is empty. Letters are drawn
// big and bold (each font pixel becomes a scale x scale block, with an
// optional one-pixel bold fattening) so captions stay readable when the
// picture is shrunk to 480x480.
// ---------------------------------------------------------------------------

const FONT = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["###..", "#..#.", "#...#", "#...#", "#...#", "#..#.", "###.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
};

Object.assign(FONT, {
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "#.#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
});

// Each glyph cell is 6 font pixels wide (5 for the letter, 1 of space),
// so a string's width in picture pixels is easy to measure.
function textWidth(str, scale) {
  if (str.length === 0) return 0;
  return str.length * 6 * scale - scale;
}

// Draw one string at (x, y), top-left corner, in one flat colour. With
// bold on, every inked font pixel is also stamped one pixel to the right,
// which fattens the strokes so letters read as heavy meme type.
function drawString(str, x, y, scale, c, bold) {
  let cx = x;
  for (const ch of str) {
    const glyph = FONT[ch] || FONT[" "];
    for (let row = 0; row < 7; row++) {
      const line = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (line[col] === "#") {
          fillRect(cx + col * scale, y + row * scale, scale, scale, c);
          if (bold) {
            fillRect(cx + (col + 1) * scale, y + row * scale, scale, scale, c);
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

// Draw a string with a thick outline: stamp it in the outline colour at
// eight offsets around the target position, then once in the fill colour
// on top. The outline is what keeps white letters readable over a busy
// sunset sky.
function drawText(str, x, y, scale, c, outline, thick, bold) {
  for (let dy = -thick; dy <= thick; dy += thick) {
    for (let dx = -thick; dx <= thick; dx += thick) {
      if (dx === 0 && dy === 0) continue;
      drawString(str, x + dx, y + dy, scale, outline, bold);
    }
  }
  drawString(str, x, y, scale, c, bold);
}

function drawCentered(str, y, scale, c, outline, thick, bold) {
  const w = textWidth(str, scale);
  drawText(str, Math.round((W - w) / 2), y, scale, c, outline, thick, bold);
}

// ---------------------------------------------------------------------------
// Shape helpers. Everything is filled by scanning pixels and testing them
// against the shape's own rule, which keeps the code small and exact.
// ---------------------------------------------------------------------------

function fillCircle(cx, cy, r, c) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) px(x, y, c);
    }
  }
}

function fillEllipse(cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(x, y, c);
    }
  }
}

// Scanline polygon fill (even-odd rule). Points are [x, y] pairs.
function fillPoly(points, c) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      fillRect(Math.ceil(xs[i]), y, Math.floor(xs[i + 1]) - Math.ceil(xs[i]) + 1, 1, c);
    }
  }
}

// A thick line, drawn as a chain of small filled circles along the segment.
function drawLine(x0, y0, x1, y1, thick, c) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const steps = Math.ceil(len);
  const r = thick / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x0 + dx * t, y0 + dy * t, r, c);
  }
}

// A five-pointed star (the white star on the magenta coin).
function starPoints(cx, cy, outerR, innerR, rotation) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = rotation + (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  return pts;
}

// A four-pointed sparkle: long vertical points, shorter horizontal ones,
// pinched at the diagonals. Used for the ghost's eyes and for sky sparkles.
function sparklePoints(cx, cy, vertR, horizR, innerR) {
  const pts = [];
  const radii = [horizR, innerR, vertR, innerR, horizR, innerR, vertR, innerR];
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4;
    pts.push([cx + Math.cos(ang) * radii[i], cy + Math.sin(ang) * radii[i]]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The scene, back to front: sky, sun, ocean, sand.
// ---------------------------------------------------------------------------

const SKY_STOPS = [
  [0, [22, 10, 46]],
  [180, [66, 22, 92]],
  [360, [150, 44, 124]],
  [500, [255, 107, 157]],
  [640, [255, 178, 102]],
];
const OCEAN_STOPS = [
  [640, [80, 38, 112]],
  [780, [30, 58, 122]],
];
const SAND_STOPS = [
  [780, [246, 216, 152]],
  [1024, [228, 180, 112]],
];

const SUN_CX = 512;
const SUN_CY = 420;
const SUN_R = 165;

function drawSky() {
  for (let y = 0; y < 640; y++) {
    fillRect(0, y, W, 1, gradientAt(SKY_STOPS, y));
  }
}

// The synthwave sun: a radial-gradient disc with horizontal stripe gaps
// cut across its lower half, the gaps widening toward the bottom. The
// stripes are painted with the sky colour sampled at the same height, so
// they read as real gaps in the sun.
function drawSun() {
  const core = [255, 238, 150];
  const mid = [255, 170, 64];
  const edge = [255, 96, 122];
  for (let y = SUN_CY - SUN_R; y <= SUN_CY + SUN_R; y++) {
    for (let x = SUN_CX - SUN_R; x <= SUN_CX + SUN_R; x++) {
      const d = Math.hypot(x - SUN_CX, y - SUN_CY);
      if (d > SUN_R) continue;
      const t = d / SUN_R;
      const c = t < 0.55 ? mix(core, mid, t / 0.55) : mix(mid, edge, (t - 0.55) / 0.45);
      px(x, y, c);
    }
  }
  let stripeY = SUN_CY + 18;
  let stripeH = 5;
  while (stripeY < SUN_CY + SUN_R) {
    const half = Math.sqrt(Math.max(0, SUN_R * SUN_R - (stripeY - SUN_CY) ** 2));
    fillRect(SUN_CX - half, stripeY, half * 2, stripeH, gradientAt(SKY_STOPS, stripeY));
    stripeY += stripeH + 16;
    stripeH += 3;
  }
}

function drawOcean() {
  for (let y = 640; y < 780; y++) {
    fillRect(0, y, W, 1, gradientAt(OCEAN_STOPS, y));
  }
  // The sun's reflection: a column of short horizontal dashes under the
  // sun, widening as it comes toward the viewer, in warm gold and pink.
  for (let y = 648; y < 776; y += 11) {
    const t = (y - 648) / 128;
    const w = 26 + t * 64;
    const jitter = (rnd() - 0.5) * 14;
    const c = rnd() < 0.5 ? [255, 209, 102] : [255, 143, 163];
    fillRect(SUN_CX - w / 2 + jitter, y, w, 4, c);
  }
  // A few long, thin horizon streaks.
  for (let i = 0; i < 9; i++) {
    const y = 652 + Math.floor(rnd() * 110);
    const x = Math.floor(rnd() * 800);
    const w = 40 + Math.floor(rnd() * 90);
    fillRect(x, y, w, 2, [255, 190, 200]);
  }
}

function drawSand() {
  for (let y = 780; y < 1024; y++) {
    fillRect(0, y, W, 1, gradientAt(SAND_STOPS, y));
  }
  // Speckles of slightly darker sand for texture.
  for (let i = 0; i < 240; i++) {
    const x = Math.floor(rnd() * W);
    const y = 786 + Math.floor(rnd() * 230);
    fillRect(x, y, 2, 2, [214, 164, 100]);
  }
}

// Small white four-pointed sparkles scattered high in the sky, plus a few
// distant gulls drawn as simple two-stroke "v" marks.
function drawSkyDetails() {
  const spots = [
    [140, 250, 9], [230, 330, 7], [330, 250, 6], [700, 240, 8],
    [820, 330, 6], [920, 250, 9], [90, 400, 6], [960, 420, 7],
  ];
  for (const [x, y, r] of spots) {
    fillPoly(sparklePoints(x, y, r, r * 0.7, r * 0.22), [255, 255, 255]);
  }
  const birds = [
    [190, 300], [260, 268], [830, 300],
  ];
  for (const [x, y] of birds) {
    drawLine(x - 13, y, x, y - 8, 3, [30, 12, 40]);
    drawLine(x, y - 8, x + 13, y, 3, [30, 12, 40]);
  }
}

// ---------------------------------------------------------------------------
// Midground: Vice City skyline, billboard, palms, LEONIDA sign.
// ---------------------------------------------------------------------------

const SKYLINE = [26, 12, 46];
const PALM = [36, 18, 54];

function drawSkyline() {
  // A row of dark buildings along the horizon, heights fixed by hand so
  // the silhouette is the same every run.
  const buildings = [
    [0, 44], [52, 70], [108, 38], [158, 88], [214, 56], [268, 78], [330, 46],
    [384, 66], [446, 40], [500, 82], [556, 52], [612, 74], [668, 44],
    [724, 92], [782, 58], [838, 80], [894, 48], [950, 68], [1002, 40],
  ];
  for (const [x, h] of buildings) {
    fillRect(x, 640 - h, 54, h, SKYLINE);
  }
  // Rooftop antennae on the two tallest towers.
  drawLine(186, 552, 186, 528, 3, SKYLINE);
  drawLine(768, 548, 768, 522, 3, SKYLINE);
  // A scatter of tiny lit windows, placed by the seeded generator.
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * 1000);
    const y = 566 + Math.floor(rnd() * 66);
    const c = rnd() < 0.6 ? [255, 214, 120] : [255, 140, 190];
    fillRect(x, y, 4, 5, c);
  }
}

// A roadside billboard on the right: dark panel, magenta frame, "GTA VI"
// in glowing pink letters, on two legs down to the skyline.
function drawBillboard() {
  const x0 = 716;
  const y0 = 288;
  const w = 252;
  const h = 118;
  fillRect(x0 + 26, y0 + h, 10, 640 - (y0 + h) - 40, [40, 20, 60]);
  fillRect(x0 + w - 36, y0 + h, 10, 640 - (y0 + h) - 40, [40, 20, 60]);
  fillRect(x0, y0, w, h, [224, 33, 138]);
  fillRect(x0 + 8, y0 + 8, w - 16, h - 16, [20, 10, 36]);
  // Neon glow: the same text stamped in pink at small offsets first.
  const label = "GTA VI";
  const scale = 5;
  const tw = textWidth(label, scale);
  const tx = x0 + Math.round((w - tw) / 2);
  const ty = y0 + 34;
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2]]) {
    drawString(label, tx + dx, ty + dy, scale, [255, 60, 160], true);
  }
  drawString(label, tx, ty, scale, [255, 205, 235], true);
}

// One palm frond: a curved, tapering blade built from a quadratic spine
// with a perpendicular width that shrinks to a point at the tip.
function drawFrond(x, y, angleDeg, length, droop, c) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const mx = x + dx * length * 0.55;
  const my = y + dy * length * 0.55 - 14;
  const ex = x + dx * length;
  const ey = y + dy * length + droop;
  const left = [];
  const right = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px0 = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * mx + t * t * ex;
    const py0 = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * my + t * t * ey;
    // Tangent of the quadratic curve at t, for the perpendicular offset.
    const tx = 2 * (1 - t) * (mx - x) + 2 * t * (ex - mx);
    const ty = 2 * (1 - t) * (my - y) + 2 * t * (ey - my);
    const tl = Math.max(0.001, Math.hypot(tx, ty));
    const nx = -ty / tl;
    const ny = tx / tl;
    const half = 9 * (1 - t) + 0.5;
    left.push([px0 + nx * half, py0 + ny * half]);
    right.push([px0 - nx * half, py0 - ny * half]);
  }
  fillPoly([...left, ...right.reverse()], c);
}

function drawPalm(baseX, baseY, topX, topY, lean) {
  // A gently curving trunk, drawn as three thick segments.
  const mx = (baseX + topX) / 2 + lean;
  const my = (baseY + topY) / 2;
  drawLine(baseX, baseY, mx, my, 16, PALM);
  drawLine(mx, my, topX, topY, 13, PALM);
  // Seven fronds fanning out from the crown.
  const angles = [-168, -140, -112, -84, -56, -28, -8];
  for (let i = 0; i < angles.length; i++) {
    const len = 96 + ((i * 37) % 42);
    drawFrond(topX, topY, angles[i], len, 34 + ((i * 23) % 26), PALM);
  }
  // Two coconuts tucked under the crown.
  fillCircle(topX - 10, topY + 12, 8, PALM);
  fillCircle(topX + 12, topY + 10, 7, PALM);
}

// A small wooden sign planted in the sand on the right, reading LEONIDA.
function drawLeonidaSign() {
  fillRect(868, 812, 10, 84, [120, 78, 44]);
  fillRect(800, 806, 156, 46, [222, 184, 135]);
  fillRect(800, 806, 156, 5, [150, 104, 60]);
  fillRect(800, 847, 156, 5, [150, 104, 60]);
  const label = "LEONIDA";
  const scale = 3;
  const tw = textWidth(label, scale);
  drawString(label, 800 + Math.round((156 - tw) / 2), 818, scale, [90, 55, 25], true);
}

// ---------------------------------------------------------------------------
// Foreground: the towel, the make.fun ghost, its hat and its coin.
// ---------------------------------------------------------------------------

const GHOST_CX = 512;
const GHOST_DOME_Y = 640; // centre of the dome circle
const GHOST_R = 145; // dome radius = body half-width
const GHOST_BOTTOM = 870; // lowest point of the wavy hem
const GHOST_WAVE = 22; // hem wave amplitude
const GHOST_WAVE_LEN = 72.5; // hem wavelength (4 bumps across the body)
const OUTLINE = [10, 10, 12];
const GHOST_WHITE = [255, 255, 255];

// The ghost's shape as a test: dome circle on top, straight-sided body
// below, and a wavy hem along the bottom edge. `grow` inflates the whole
// shape, which is how the thick black outline is made — draw the shape
// grown by the outline thickness in black, then the true shape in white
// on top.
function ghostInside(x, y, grow) {
  const r = GHOST_R + grow;
  if (y <= GHOST_DOME_Y) {
    const dx = x - GHOST_CX;
    const dy = y - GHOST_DOME_Y;
    return dx * dx + dy * dy <= r * r;
  }
  if (Math.abs(x - GHOST_CX) > r) return false;
  const bottom =
    GHOST_BOTTOM + grow -
    GHOST_WAVE * (0.5 - 0.5 * Math.cos((2 * Math.PI * (x - GHOST_CX)) / GHOST_WAVE_LEN));
  return y <= bottom;
}

function drawGhostShape(grow, c) {
  const r = GHOST_R + grow;
  const x0 = Math.floor(GHOST_CX - r);
  const x1 = Math.ceil(GHOST_CX + r);
  const y0 = Math.floor(GHOST_DOME_Y - r);
  const y1 = Math.ceil(GHOST_BOTTOM + grow);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ghostInside(x, y, grow)) px(x, y, c);
    }
  }
}

function drawGhost() {
  // Thick black outline, then the white body.
  drawGhostShape(10, OUTLINE);
  drawGhostShape(0, GHOST_WHITE);
  // Rosy cheeks.
  fillCircle(420, 688, 17, [255, 158, 187]);
  fillCircle(604, 688, 17, [255, 158, 187]);
  // The mascot's two black four-pointed sparkle eyes.
  fillPoly(sparklePoints(455, 640, 32, 22, 8), [12, 12, 14]);
  fillPoly(sparklePoints(569, 640, 32, 22, 8), [12, 12, 14]);
  // A small smiling mouth, an arc of short thick segments.
  const mx = 512;
  const my = 682;
  const mr = 30;
  let prevX = null;
  let prevY = null;
  for (let deg = 25; deg <= 155; deg += 10) {
    const a = (deg * Math.PI) / 180;
    const x = mx + Math.cos(a) * mr;
    const y = my + Math.sin(a) * mr;
    if (prevX !== null) drawLine(prevX, prevY, x, y, 6, [12, 12, 14]);
    prevX = x;
    prevY = y;
  }
}

// A straw hat sitting on the ghost's dome: a round crown and a wide
// brim, both tan with a black outline, plus a little magenta flower.
function drawHat() {
  // The crown is sized so its bottom edge stays tucked behind the brim.
  fillCircle(512, 462, 76, OUTLINE);
  fillCircle(512, 462, 70, [235, 203, 127]);
  fillEllipse(512, 505, 181, 36, OUTLINE);
  fillEllipse(512, 505, 175, 30, [235, 203, 127]);
  // Flower: five magenta petals around a yellow centre, on the brim.
  const fx = 618;
  const fy = 492;
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    fillCircle(fx + Math.cos(a) * 10, fy + Math.sin(a) * 10, 7, [224, 33, 138]);
  }
  fillCircle(fx, fy, 6, [255, 225, 53]);
}

// The ghost's round little hand, floating up beside it, holding the
// magenta coin with its white star.
function drawCoinAndHand() {
  // Hand: a white circle with a black outline, just under the coin.
  fillCircle(695, 690, 30, OUTLINE);
  fillCircle(695, 690, 24, GHOST_WHITE);
  // Coin: dark magenta rim, bright magenta face, white five-point star.
  fillCircle(735, 625, 52, [194, 24, 91]);
  fillCircle(735, 625, 46, [224, 33, 138]);
  fillPoly(starPoints(735, 625, 28, 12, 0), [255, 255, 255]);
  // A small shine spot on the coin's upper-left edge.
  fillEllipse(718, 606, 10, 6, [255, 150, 205]);
}

// The magenta beach towel the ghost lounges on, with white stripes and
// MAKE.FUN written across it in white.
function drawTowel() {
  fillRect(300, 845, 424, 85, [224, 33, 138]);
  fillRect(300, 845, 424, 6, [255, 255, 255]);
  fillRect(300, 872, 424, 6, [255, 255, 255]);
  fillRect(300, 924, 424, 6, [255, 255, 255]);
  // The name sits on plain magenta between the stripes, so every letter
  // stays fully readable.
  const label = "MAKE.FUN";
  const scale = 4;
  const tw = textWidth(label, scale);
  drawString(label, 300 + Math.round((424 - tw) / 2), 884, scale, [255, 255, 255], true);
}

// ---------------------------------------------------------------------------
// Captions and the main draw.
// ---------------------------------------------------------------------------

function drawCaptions() {
  // Top: the setup, in two big white lines with a heavy black outline.
  drawCentered("WAITED 13 YEARS", 48, 8, [255, 255, 255], OUTLINE, 5, true);
  drawCentered("FOR GTA 6", 124, 8, [255, 255, 255], OUTLINE, 5, true);
  // Bottom: the punchline, in bright yellow so it pops off the sand.
  drawCentered("1 SICK DAY. WORTH IT.", 948, 7, [255, 225, 53], OUTLINE, 4, true);
}

function main() {
  drawSky();
  drawSun();
  drawSkyDetails();
  drawOcean();
  drawSand();
  drawSkyline();
  drawBillboard();
  drawPalm(95, 800, 130, 540, -8);
  drawPalm(930, 800, 895, 550, 8);
  drawLeonidaSign();
  drawTowel();
  drawGhost();
  drawHat();
  drawCoinAndHand();
  drawCaptions();
  const bytes = savePng("meme.png");
  console.log("wrote meme.png (" + bytes + " bytes)");
}

main();
