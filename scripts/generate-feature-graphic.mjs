#!/usr/bin/env node
/**
 * Regenerate the Play Store feature graphic from assets/brand/app-icon.svg.
 *
 * Play Store requires exactly 1024x500, JPEG or 24-bit PNG with no alpha
 * channel. This reuses the icon artwork (stripped of its plate, same
 * technique as scripts/generate-icons.mjs) on a fresh gradient sized for
 * the banner, next to the wordmark, so the graphic stays in sync with the
 * app icon instead of drifting as a hand-made asset.
 *
 * Usage:  npm run gen:feature-graphic
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'assets', 'brand', 'app-icon.svg');
const OUT = path.join(ROOT, 'public', 'store-assets', 'feature-graphic.png');

const full = fs.readFileSync(SRC, 'utf8');

const defsMatch = full.match(/<defs>[\s\S]*?<\/defs>/);
const artMatch = full.match(/<g transform="translate\(256,256\)[\s\S]*<\/g>\s*<\/svg>/);
if (!defsMatch || !artMatch) throw new Error('could not extract artwork from app-icon.svg');
const defs = defsMatch[0];
const art = artMatch[0].replace(/<\/svg>\s*$/, '');

const W = 1024, H = 500;
const ICON = 420;
const iconX = W - ICON - 56;
const iconY = (H - ICON) / 2;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2E1D6B"/>
      <stop offset="1" stop-color="#150C33"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.86" cy="0.5" r="0.6">
      <stop offset="0" stop-color="#6B57C9" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#6B57C9" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <g font-family="DejaVu Sans, sans-serif">
    <text x="64" y="212" font-size="58" font-weight="bold" fill="#FFFFFF">Commodity Hub</text>
    <text x="66" y="256" font-size="27" fill="#C7BEEA">Live prices, charts &amp; market insights</text>
    <text x="66" y="290" font-size="21" fill="#9C8FD6">Energy · Metals · Grains · Softs · Livestock</text>
  </g>

  <svg x="${iconX}" y="${iconY}" width="${ICON}" height="${ICON}" viewBox="0 0 512 512">
    ${defs}
    ${art}
  </svg>
</svg>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });

await sharp(Buffer.from(svg))
  .resize(W, H)
  .flatten({ background: '#1B1140' }) // Play Store rejects an alpha channel
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log('wrote', path.relative(ROOT, OUT));
