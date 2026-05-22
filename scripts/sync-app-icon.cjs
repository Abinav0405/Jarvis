/**
 * Square-crops the first .ico in /build and writes public/branding/jarvis-app-square.jpg (512×512)
 * for the UI + favicon. Run: npm run icon:sync
 * Requires: place any *.ico under build/ (e.g. build/icon.ico or build/my-logo.ico).
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function findIco() {
  const d = path.join(root, 'build');
  if (!fs.existsSync(d)) return null;
  const names = fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith('.ico'));
  names.sort();
  return names[0] ? path.join(d, names[0]) : null;
}

function cropSquare(img) {
  const { width, height } = img.getSize();
  if (width <= 0 || height <= 0) return null;
  if (width === height) return img;
  const s = Math.min(width, height);
  const x = Math.floor((width - s) / 2);
  const y = Math.floor((height - s) / 2);
  return img.crop({ x, y, width: s, height: s });
}

app.whenReady().then(() => {
  const src = findIco();
  if (!src) {
    console.error('[icon:sync] No .ico file found in build/. Add one (e.g. build/icon.ico).');
    app.exit(1);
    return;
  }
  const raw = nativeImage.createFromPath(src);
  if (raw.isEmpty()) {
    console.error('[icon:sync] Could not read:', src);
    app.exit(1);
    return;
  }
  const squared = cropSquare(raw);
  if (!squared) {
    console.error('[icon:sync] Invalid image size.');
    app.exit(1);
    return;
  }
  const out512 = squared.resize({ width: 512, height: 512 });
  const outDir = path.join(root, 'public', 'branding');
  fs.mkdirSync(outDir, { recursive: true });
  const outJpg = path.join(outDir, 'jarvis-app-square.jpg');
  fs.writeFileSync(outJpg, out512.toJPEG(92));
  console.log('[icon:sync] Square-cropped from', path.relative(root, src), '→', path.relative(root, outJpg));
  app.exit(0);
});
