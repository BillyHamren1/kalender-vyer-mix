#!/usr/bin/env node

/**
 * generate-icons.js
 *
 * Reads APP_MODE (or VITE_APP_MODE) env var, picks the correct 1024×1024
 * source icon, and generates every size needed by iOS and Android.
 *
 * Usage:
 *   APP_MODE=time  node scripts/generate-icons.js
 *   APP_MODE=scanner node scripts/generate-icons.js
 */

import sharp from 'sharp';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ── Determine mode ─────────────────────────────────────────────────
const mode = process.env.APP_MODE || process.env.VITE_APP_MODE || 'time';
if (!['time', 'scanner'].includes(mode)) {
  console.error(`❌  Unknown APP_MODE "${mode}". Use "time" or "scanner".`);
  process.exit(1);
}

const SOURCE = path.join(ROOT, 'assets', 'app-icons', `eventflow-${mode}-icon.png`);
if (!existsSync(SOURCE)) {
  console.error(`❌  Source icon not found: ${SOURCE}`);
  process.exit(1);
}

console.log(`\n🎨  Generating icons for EventFlow ${mode === 'time' ? 'Time' : 'Scanner'}`);
console.log(`    Source: ${SOURCE}\n`);

// ── iOS sizes ──────────────────────────────────────────────────────
// Every required size for a modern universal iOS AppIcon set
const IOS_SIZES = [
  { size: 20,   scales: [2, 3] },   // Notification
  { size: 29,   scales: [2, 3] },   // Settings
  { size: 38,   scales: [2, 3] },   // Home Screen (iOS 16.4+)
  { size: 40,   scales: [2, 3] },   // Spotlight
  { size: 60,   scales: [2, 3] },   // iPhone Home
  { size: 64,   scales: [2, 3] },   // Home Screen (iOS 16.4+)
  { size: 68,   scales: [2] },      // Home Screen (iOS 16.4+)
  { size: 76,   scales: [2] },      // iPad Home
  { size: 83.5, scales: [2] },      // iPad Pro Home
  { size: 1024, scales: [1] },      // App Store
];

// ── Android sizes ──────────────────────────────────────────────────
const ANDROID_DENSITIES = [
  { folder: 'mipmap-mdpi',    size: 48  },
  { folder: 'mipmap-hdpi',    size: 72  },
  { folder: 'mipmap-xhdpi',   size: 96  },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

// Android adaptive icon foreground (with padding for safe zone)
const ANDROID_FOREGROUND_DENSITIES = [
  { folder: 'mipmap-mdpi',    size: 108 },
  { folder: 'mipmap-hdpi',    size: 162 },
  { folder: 'mipmap-xhdpi',   size: 216 },
  { folder: 'mipmap-xxhdpi',  size: 324 },
  { folder: 'mipmap-xxxhdpi', size: 432 },
];

async function resizeAndSave(srcPath, destPath, px) {
  await mkdir(path.dirname(destPath), { recursive: true });
  await sharp(srcPath)
    .resize(px, px, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png({ quality: 100 })
    .toFile(destPath);
}

// ── Generate iOS icons ─────────────────────────────────────────────
async function generateIOS() {
  const iosBase = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');
  await mkdir(iosBase, { recursive: true });

  const contentsImages = [];

  for (const { size, scales } of IOS_SIZES) {
    for (const scale of scales) {
      const px = Math.round(size * scale);
      const filename = `AppIcon-${size}x${size}@${scale}x.png`;
      const dest = path.join(iosBase, filename);

      await resizeAndSave(SOURCE, dest, px);
      console.log(`  ✅  iOS  ${filename}  (${px}×${px})`);

      contentsImages.push({
        filename,
        idiom: 'universal',
        platform: 'ios',
        size: `${size}x${size}`,
        scale: `${scale}x`,
      });
    }
  }

  // Contents.json for Xcode
  const contentsJson = {
    images: contentsImages,
    info: {
      author: 'generate-icons',
      version: 1,
    },
  };

  await writeFile(
    path.join(iosBase, 'Contents.json'),
    JSON.stringify(contentsJson, null, 2),
  );
  console.log(`  ✅  iOS  Contents.json written`);
}

// ── Generate Android icons ─────────────────────────────────────────
async function generateAndroid() {
  const androidRes = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

  // Standard launcher icons
  for (const { folder, size } of ANDROID_DENSITIES) {
    const dest = path.join(androidRes, folder, 'ic_launcher.png');
    await resizeAndSave(SOURCE, dest, size);
    console.log(`  ✅  Android  ${folder}/ic_launcher.png  (${size}×${size})`);

    // Round variant
    const destRound = path.join(androidRes, folder, 'ic_launcher_round.png');
    await mkdir(path.dirname(destRound), { recursive: true });
    // Create circular version
    const roundMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
    );
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .composite([{ input: roundMask, blend: 'dest-in' }])
      .png()
      .toFile(destRound);
    console.log(`  ✅  Android  ${folder}/ic_launcher_round.png  (${size}×${size})`);
  }

  // Foreground for adaptive icons
  for (const { folder, size } of ANDROID_FOREGROUND_DENSITIES) {
    const dest = path.join(androidRes, folder, 'ic_launcher_foreground.png');
    await resizeAndSave(SOURCE, dest, size);
    console.log(`  ✅  Android  ${folder}/ic_launcher_foreground.png  (${size}×${size})`);
  }
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  const iosDir = path.join(ROOT, 'ios');
  const androidDir = path.join(ROOT, 'android');

  if (existsSync(iosDir)) {
    console.log('📱 Generating iOS icons…');
    await generateIOS();
  } else {
    console.log('⏭️  ios/ directory not found — skipping iOS icons');
  }

  console.log('');

  if (existsSync(androidDir)) {
    console.log('🤖 Generating Android icons…');
    await generateAndroid();
  } else {
    console.log('⏭️  android/ directory not found — skipping Android icons');
  }

  console.log(`\n✨ Done! Icons generated for APP_MODE=${mode}\n`);
}

main().catch((err) => {
  console.error('❌  Icon generation failed:', err);
  process.exit(1);
});
