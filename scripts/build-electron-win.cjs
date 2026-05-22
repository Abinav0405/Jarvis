/**
 * Run electron-builder with output outside OneDrive, then copy installers to ./release/
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getBuildOutputDir, runPrebuild } = require('./prebuild-win.cjs');

const root = process.cwd();
const outputDir = getBuildOutputDir();
const projectRelease = path.join(root, 'release');

runPrebuild();

console.log(`\n[build] Packaging to: ${outputDir}\n`);

const builder = spawnSync(
  `npx electron-builder --win --config.directories.output="${outputDir.replace(/"/g, '\\"')}"`,
  { stdio: 'inherit', cwd: root, shell: true, env: { ...process.env, JARVIS_BUILD_OUTPUT: outputDir } },
);

if (builder.status !== 0) {
  process.exit(builder.status ?? 1);
}

fs.mkdirSync(projectRelease, { recursive: true });

const copyNames = [
  'JARVIS Setup 1.0.0.exe',
  'JARVIS 1.0.0.exe',
  'JARVIS Setup 1.0.0.exe.blockmap',
  'builder-effective-config.yaml',
  'SETUP-NEW-PC.txt',
];

for (const name of copyNames) {
  const src = path.join(outputDir, name);
  const dest = path.join(projectRelease, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[build] Copied → release\\${name}`);
  }
}

const setupSrc = path.join(root, 'SETUP-NEW-PC.txt');
const setupDest = path.join(projectRelease, 'SETUP-NEW-PC.txt');
if (fs.existsSync(setupSrc)) {
  fs.copyFileSync(setupSrc, setupDest);
}

console.log(`\n[build] Done. Installers in:\n  ${outputDir}\n  ${projectRelease}\n`);
