#!/usr/bin/env node
/**
 * Regenerate every raster app icon from assets/brand/app-icon.svg.
 *
 * Single source of truth: assets/brand/app-icon.svg (512x512, full-bleed).
 * This replaces the old generate-android-icons.py / generate-android-splash.py
 * pair, which required Pillow and upscaled everything from a 512px raster.
 * Rendering from the SVG means every size is drawn at its native resolution,
 * and the only dependency is sharp (already present via @capacitor/assets).
 *
 * Usage:  npm run gen:icons
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'assets', 'brand', 'app-icon.svg');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Splash background stays the legacy brand navy — see PRODUCTION_SETUP.md.
const SPLASH_BG = '#1e3a5f';

const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Adaptive foreground canvas is 108dp where legacy is 48dp.
const FG = Object.fromEntries(Object.entries(LEGACY).map(([k, v]) => [k, Math.round(v * 2.25)]));

const SPLASH_PORT = {
  mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280],
  xxhdpi: [960, 1600], xxxhdpi: [1280, 1920],
};

const written = [];
const emit = (p) => { written.push(path.relative(ROOT, p)); };
const ensure = (p) => fs.mkdirSync(path.dirname(p), { recursive: true });

const full = fs.readFileSync(SRC, 'utf8');

/** The plate belongs to the icon, not to the artwork — strip it for transparent uses. */
const artOnly = (() => {
  const s = full.replace('<rect width="512" height="512" fill="url(#bg)"/>', '');
  if (s === full) throw new Error('could not strip background rect from app-icon.svg');
  return s;
})();

// Android's adaptive icon composites the foreground over @color/ic_launcher_background
// and only guarantees the inner 72dp of the 108dp canvas is visible. The artwork's true
// radius includes the ground shadow, which is wider than the objects. 0.648 is the largest
// value that technically fits, but it leaves the art touching the mask edge — 0.60 keeps a
// visible margin, since many launchers mask tighter than the full 72dp circle.
// assertForegroundFits() below re-checks this every run.
const ADAPTIVE_SCALE = 0.60;
const foreground = (() => {
  const s = artOnly.replace('scale(0.855)', `scale(${ADAPTIVE_SCALE})`);
  if (s === artOnly) throw new Error('could not rescale artwork for adaptive foreground');
  return s;
})();

/** Fail loudly if the adaptive foreground would be clipped by the 72dp safe circle. */
async function assertForegroundFits(png, canvas) {
  const { data, info } = await sharp(png).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  let r = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * c + 3] > 8) r = Math.max(r, Math.hypot(x - w / 2, y - h / 2));
  }
  const safe = canvas * 36 / 108;
  if (r > safe) {
    throw new Error(
      `adaptive foreground overflows the 72dp safe circle: radius ${r.toFixed(1)}px > ${safe.toFixed(1)}px ` +
      `on a ${canvas}px canvas. Lower ADAPTIVE_SCALE (currently ${ADAPTIVE_SCALE}).`);
  }
}

const render = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 });
/** Store icons (App Store / Play Store) must not carry an alpha channel. */
const opaque = (pipe) => pipe.flatten({ background: SPLASH_BG }).png({ compressionLevel: 9 });

const circleMask = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

/** Wrap a PNG in a single-image .ico container (what the previous favicon was). */
function pngToIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // type: icon
  header.writeUInt16LE(1, 4);          // image count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);              // width  256 encoded as 0
  entry.writeUInt8(0, 1);              // height 256 encoded as 0
  entry.writeUInt8(0, 2);              // palette size
  entry.writeUInt8(0, 3);              // reserved
  entry.writeUInt16LE(1, 4);           // colour planes
  entry.writeUInt16LE(32, 6);          // bits per pixel
  entry.writeUInt32LE(png.length, 8);  // image byte length
  entry.writeUInt32LE(22, 12);         // offset of image data
  return Buffer.concat([header, entry, png]);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`ERROR: source not found: ${SRC}`);
    process.exit(1);
  }
  console.log(`Source: ${path.relative(ROOT, SRC)}`);

  // ---- web / store / desktop -------------------------------------------------
  const icon512 = await opaque(render(full, 512)).toBuffer();
  for (const p of [
    path.join(ROOT, 'public', 'icon.png'),
    path.join(ROOT, 'icon.png'),
    path.join(ROOT, 'public', 'icons', 'icon-512-playstore.png'),
    path.join(ROOT, 'landing', 'assets', 'app-icon.png'),
    // The landing site's <nav> brand mark (.brand img, 26x26 via CSS) — this
    // got missed when the icon was redesigned in 0d138aa, so commodity-hub.eu
    // was still showing the old generic trending-up-arrow placeholder.
    path.join(ROOT, 'landing', 'assets', 'logo.png'),
  ]) { ensure(p); fs.writeFileSync(p, icon512); emit(p); }

  const icon1024 = await opaque(render(full, 1024)).toBuffer();
  for (const p of [
    path.join(ROOT, 'src', 'assets', 'play-app-icon-512.png'),
    path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
  ]) { ensure(p); fs.writeFileSync(p, icon1024); emit(p); }

  // These must live under public/ — they are fetched at runtime as /icons/icon-N.webp
  // by the service-worker precache and notification icons. A sibling `icons/` directory
  // at the repo root is NOT served by Vite and silently 404s in production.
  for (const size of [48, 72, 96, 128, 144, 192, 256, 512]) {
    const p = path.join(ROOT, 'public', 'icons', `icon-${size}.webp`);
    ensure(p);
    fs.writeFileSync(p, await sharp(Buffer.from(full)).resize(size, size).webp({ quality: 92 }).toBuffer());
    emit(p);
  }

  const favicon = path.join(ROOT, 'public', 'favicon.ico');
  fs.writeFileSync(favicon, pngToIco(await render(full, 256).toBuffer()));
  emit(favicon);

  // ---- android launcher icons ------------------------------------------------
  for (const [density, size] of Object.entries(LEGACY)) {
    const dir = path.join(RES, `mipmap-${density}`);

    const sq = path.join(dir, 'ic_launcher.png');
    ensure(sq); fs.writeFileSync(sq, await render(full, size).toBuffer()); emit(sq);

    const rd = path.join(dir, 'ic_launcher_round.png');
    fs.writeFileSync(rd, await sharp(await render(full, size).toBuffer())
      .composite([{ input: circleMask(size), blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer());
    emit(rd);

    const fg = path.join(dir, 'ic_launcher_foreground.png');
    const fgPng = await render(foreground, FG[density]).toBuffer();
    await assertForegroundFits(fgPng, FG[density]);
    fs.writeFileSync(fg, fgPng); emit(fg);
  }

  // ---- android splash --------------------------------------------------------
  // Transparent artwork over the navy plate: the icon's own indigo plate would
  // otherwise show up as a visible square floating on the splash background.
  const splash = async (w, h) => {
    const box = Math.round(Math.min(w, h) * 0.40);
    const logo = await render(artOnly, box).toBuffer();
    return sharp({ create: { width: w, height: h, channels: 4, background: SPLASH_BG } })
      .composite([{ input: logo, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer();
  };
  for (const [density, [w, h]] of Object.entries(SPLASH_PORT)) {
    const p = path.join(RES, `drawable-port-${density}`, 'splash.png');
    ensure(p); fs.writeFileSync(p, await splash(w, h)); emit(p);
    const l = path.join(RES, `drawable-land-${density}`, 'splash.png');
    ensure(l); fs.writeFileSync(l, await splash(h, w)); emit(l);
  }
  const dflt = path.join(RES, 'drawable', 'splash.png');
  ensure(dflt); fs.writeFileSync(dflt, await splash(480, 320)); emit(dflt);

  console.log(written.map((w) => `  wrote ${w}`).join('\n'));
  console.log(`Done. Wrote ${written.length} files.`);
  console.log('Desktop icons: run `npx tauri icon assets/brand/app-icon.svg` separately.');
}

main().catch((e) => { console.error(e); process.exit(1); });
