/**
 * Before electron-builder on Windows: stop JARVIS and clear build output dirs.
 * Default output is outside OneDrive to avoid EBUSY locks on JARVIS.exe.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function getBuildOutputDir() {
  if (process.env.JARVIS_BUILD_OUTPUT) {
    return path.resolve(process.env.JARVIS_BUILD_OUTPUT);
  }
  return path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Jarvis-BuildOutput');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function stopJarvisProcesses() {
  for (const image of ['JARVIS.exe', 'JARVIS Setup 1.0.0.exe']) {
    try {
      execSync(`taskkill /F /IM "${image}" /T`, { stdio: 'ignore', shell: true });
    } catch {
      /* not running */
    }
  }
}

function removeDir(dir, label) {
  if (!fs.existsSync(dir)) return true;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      return true;
    } catch {
      if (attempt < 6) sleep(1000);
    }
  }
  return false;
}

function runPrebuild() {
  if (process.platform !== 'win32') {
    return { outputDir: path.join(process.cwd(), 'release') };
  }

  const root = process.cwd();
  const outputDir = getBuildOutputDir();
  const legacyRelease = path.join(root, 'release');
  const legacyUnpacked = path.join(legacyRelease, 'win-unpacked');

  console.log('[prebuild] Stopping JARVIS / Electron processes (if any)...');
  stopJarvisProcesses();
  sleep(600);

  console.log(`[prebuild] Clearing build output: ${outputDir}`);
  if (!removeDir(outputDir, 'build output')) {
    failLocked(path.join(outputDir, 'win-unpacked', 'JARVIS.exe'), outputDir);
  }

  console.log('[prebuild] Clearing legacy release\\win-unpacked (OneDrive folder)...');
  if (fs.existsSync(legacyUnpacked) && !removeDir(legacyUnpacked, 'legacy unpacked')) {
    failLocked(path.join(legacyUnpacked, 'JARVIS.exe'), legacyUnpacked);
  }

  console.log('[prebuild] Ready for electron-builder.');
  return { outputDir };
}

function failLocked(exePath, dir) {
  console.error(
    '\n[prebuild] Could not delete build folder — JARVIS.exe is still locked.\n' +
      '  • Close JARVIS and any installer\n' +
      '  • Close Task Manager entries for JARVIS.exe\n' +
      '  • Pause OneDrive sync for this project folder\n' +
      '  • Exclude the build folder from antivirus real-time scan\n' +
      '  • Then run: npm run build\n',
  );
  if (fs.existsSync(exePath)) console.error(`  Locked: ${exePath}\n`);
  else console.error(`  Folder: ${dir}\n`);
  process.exit(1);
}

if (require.main === module) {
  runPrebuild();
}

module.exports = { getBuildOutputDir, runPrebuild };
