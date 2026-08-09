// Generates the Android launcher icons from brand/rakshapay-mark.svg.
//
// Run from the repository root:   node tools/build-icons.mjs
//
// Uses the `sharp` that already sits in web/node_modules rather than adding a
// dependency for something run a handful of times.
//
// The mark is drawn in white on the brand navy with generous padding: Android
// crops launcher icons to a circle, a squircle or a rounded square depending on
// the launcher, and a mark drawn edge to edge loses its corners on the first
// two.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const require = createRequire(join(repoRoot, 'web', 'node_modules', 'sharp', 'package.json'));
const sharp = require('sharp');

const NAVY = '#16224A';

// Densities Android expects, and the pixel size of a launcher icon at each.
const DENSITIES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

/** The mark on its navy tile, at an arbitrary size. */
function tile(size) {
  // 56% of the tile, centred: enough margin to survive a circular mask.
  const inset = size * 0.22;
  const inner = size - inset * 2;
  const scale = inner / 48;
  const stroke = 3.5 * scale;

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="${NAVY}"/>
      <g transform="translate(${inset} ${inset}) scale(${scale})"
         fill="none" stroke="#FFFFFF" stroke-width="${3.5}"
         stroke-linejoin="round" stroke-linecap="round">
        <path d="M24 4 L42 11 V24 C42 34.5 34.8 43.6 24 46.6 C13.2 43.6 6 34.5 6 24 V11 Z"/>
        <path d="M15.5 24.5 L21.5 30.5 L33 18.5"/>
      </g>
    </svg>
  `.replace('stroke-width="3.5"', `stroke-width="${(stroke / scale).toFixed(3)}"`));
}

const resDir = join(repoRoot, 'app', 'android', 'app', 'src', 'main', 'res');
let written = 0;

for (const [folder, size] of Object.entries(DENSITIES)) {
  const dir = join(resDir, folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const png = await sharp(tile(size)).png().toBuffer();
  writeFileSync(join(dir, 'ic_launcher.png'), png);
  written++;
}

// A large flat copy for slides, the README and anywhere a raster is easier.
const brandDir = join(repoRoot, 'brand');
if (!existsSync(brandDir)) mkdirSync(brandDir, { recursive: true });
writeFileSync(join(brandDir, 'rakshapay-icon-512.png'), await sharp(tile(512)).png().toBuffer());
written++;

console.log(`[build-icons] wrote ${written} file(s)`);
