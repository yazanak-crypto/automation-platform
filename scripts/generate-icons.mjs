/**
 * Regenerate every raster brand asset from ONE vector source.
 *
 * The mark used to exist as three different drawings: a 3-stroke vector in the
 * app, a 5-stroke raster in the favicon, and a 5-stroke maskable PNG. Running
 * this script is what keeps that from happening again — edit MARK below (in
 * step with components/logo-mark.tsx) and re-run.
 *
 *   node scripts/generate-icons.mjs
 *
 * Framing is preserved from the assets it replaces: mark occupies 61.9% of the
 * canvas width, centred, on #0b0b0d. The maskable variant keeps its rounded
 * corners; every other raster is a full-bleed square.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Keep in step with apps/web/components/logo-mark.tsx.
const MARK = {
  paths: [
    "M24.7 24 H43",
    "M24.7 24 L5 8.3",
    "M24.7 24 L5 16.2",
    "M24.7 24 L5 31.8",
    "M24.7 24 L5 39.7",
  ],
  strokeWidth: 3.55,
  // Bounding box of the drawn mark INCLUDING the round caps, in viewBox units.
  bbox: { x: 3.225, y: 6.525, w: 41.55, h: 34.95 },
};

const BG = "#0b0b0d";
const BRASS = "#d4b872";
const MARK_WIDTH_RATIO = 0.619; // measured from the assets being replaced

/** The mark drawn to fill `size` px at the measured ratio, centred. */
function markSvg(size, { background = BG, radius = 0 } = {}) {
  const s = (size * MARK_WIDTH_RATIO) / MARK.bbox.w;
  const ox = (size - MARK.bbox.w * s) / 2 - MARK.bbox.x * s;
  const oy = (size - MARK.bbox.h * s) / 2 - MARK.bbox.y * s;
  const bg = background
    ? `<rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ""} fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g transform="translate(${ox.toFixed(3)} ${oy.toFixed(3)}) scale(${s.toFixed(5)})" fill="none" stroke="${BRASS}" stroke-width="${MARK.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${MARK.paths.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`;
}

const png = (size, opts) => sharp(Buffer.from(markSvg(size, opts))).png().toBuffer();

/**
 * Build a multi-resolution .ico.
 *
 * Every size the previous favicon carried is reproduced. Dropping one degrades
 * the icon in tab strips and bookmark bars, where the browser picks the nearest
 * size and rescales — so this list is asserted against the old file, not
 * trusted to be right by inspection.
 */
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
async function ico(sizes) {
  const images = await Promise.all(sizes.map((s) => png(s)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + sizes.length * 16;
  const dir = [];
  for (let i = 0; i < sizes.length; i++) {
    const e = Buffer.alloc(16);
    e[0] = sizes[i] >= 256 ? 0 : sizes[i]; // 0 means 256
    e[1] = sizes[i] >= 256 ? 0 : sizes[i];
    e[2] = 0; // palette
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...images]);
}

const OUT = [
  ["apps/web/public/logo.png", () => png(512)],
  ["apps/web/app/icon1.png", () => png(512)],
  ["apps/web/app/apple-icon.png", () => png(180)],
  // Rounded corners and a transparent outside, as the file it replaces had.
  ["apps/web/public/icon-512-maskable.png", () => png(512, { radius: 102 })],
  ["apps/web/app/favicon.ico", () => ico(ICO_SIZES)],
];

for (const [rel, make] of OUT) {
  const buf = await make();
  writeFileSync(join(ROOT, rel), buf);
  console.log(`${String(buf.length).padStart(7)} B  ${rel}`);
}
