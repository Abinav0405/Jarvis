const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function stableId(launchPath) {
  return crypto.createHash('sha256').update(String(launchPath).toLowerCase()).digest('hex').slice(0, 16);
}

function walkLnks(root, acc) {
  if (!root || !fs.existsSync(root)) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) walkLnks(full, acc);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.lnk')) acc.push(full);
  }
}

function shortcutRoots() {
  const home = os.homedir();
  const pub = process.env.PUBLIC || path.join(path.dirname(home), 'Public');
  const roots = [
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(pub, 'Desktop'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'Desktop'),
    path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
  ];
  return [...new Set(roots.filter(Boolean))];
}

async function registryExeApps() {
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
function ExeFromInstallLocation($dirRaw) {
  if (-not $dirRaw) { return $null }
  $dir = $dirRaw.Trim().Trim('"')
  if (-not (Test-Path -LiteralPath $dir)) { return $null }
  $exes = Get-ChildItem -LiteralPath $dir -Filter *.exe -File -ErrorAction SilentlyContinue |
    Where-Object { $_.BaseName -notmatch '(?i)^unins' -and $_.Name -notmatch '(?i)^(setup|uninstall|maintenance)\\.exe$' }
  if ($exes) { return $exes[0].FullName }
  return $null
}
$roots = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
$rows = @()
foreach ($root in $roots) {
  Get-ChildItem -Path $root -ErrorAction SilentlyContinue | ForEach-Object {
    $prop = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
    if (-not $prop -or -not $prop.DisplayName) { return }
    $exe = $null
    if ($prop.DisplayIcon -and ($prop.DisplayIcon -match '\\.exe')) {
      $cand = ($prop.DisplayIcon -split ',')[0].Trim().Trim('"')
      if ($cand -and (Test-Path -LiteralPath $cand)) { $exe = $cand }
    }
    if (-not $exe) { $exe = ExeFromInstallLocation $prop.InstallLocation }
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      $rows += [PSCustomObject]@{ Name = [string]$prop.DisplayName; Path = [string]$exe }
    }
  }
}
$rows | ConvertTo-Json -Compress -Depth 3
`.trim();
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { maxBuffer: 40 * 1024 * 1024, windowsHide: true, timeout: 45000 }
    );
    const t = (stdout || '').trim();
    if (!t) return [];
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

async function startMenuUwpApps() {
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
try {
  $rows = @(Get-StartApps -ErrorAction Stop | ForEach-Object {
    if ($_.Name -and $_.AppID) {
      [PSCustomObject]@{ Name = [string]$_.Name; AppId = [string]$_.AppID }
    }
  })
  if ($rows.Count -eq 0) { '[]' } else { $rows | ConvertTo-Json -Compress -Depth 4 }
} catch {
  '[]'
}
`.trim();
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { maxBuffer: 20 * 1024 * 1024, windowsHide: true, timeout: 30000 }
    );
    const t = (stdout || '').trim();
    if (!t || t === '[]') return [];
    const parsed = JSON.parse(t);
    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

function buildAppIndex() {
  const lnkList = [];
  for (const root of shortcutRoots()) walkLnks(root, lnkList);

  const byKey = new Map();

  for (const lnk of lnkList) {
    const key = lnk.toLowerCase();
    const name = path.basename(lnk, '.lnk');
    byKey.set(key, {
      id: stableId(lnk),
      name,
      launchPath: lnk,
    });
  }

  return { byKey, lnkCount: lnkList.length };
}

function mergeRowsIntoIndex(byKey, regList, uwpList) {
  for (const row of regList) {
    const p = row.Path || row.path;
    const n = row.Name || row.name;
    if (!p || !n) continue;
    const key = String(p).toLowerCase();
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: stableId(p),
      name: String(n).trim(),
      launchPath: p,
    });
  }

  for (const row of uwpList) {
    const id = row.AppId || row.appId;
    const n = row.Name || row.name;
    if (!id || !n) continue;
    const launchPath = `uwp:${id}`;
    const key = launchPath.toLowerCase();
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: stableId(launchPath),
      name: String(n).trim(),
      launchPath,
    });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Resolve .lnk → target exe (batch) so icons and dedupe use real paths. */
async function resolveShortcutsBatch(lnkPaths) {
  const map = new Map();
  if (!lnkPaths.length) return map;
  const chunkSize = 180;
  for (let i = 0; i < lnkPaths.length; i += chunkSize) {
    const chunk = lnkPaths.slice(i, i + chunkSize);
    const json = JSON.stringify(chunk);
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = '${json.replace(/'/g, "''")}' | ConvertFrom-Json
$sh = New-Object -ComObject WScript.Shell
$out = @{}
foreach ($p in $paths) {
  try {
    $sc = $sh.CreateShortcut($p)
    if ($sc.TargetPath) { $out[$p] = $sc.TargetPath }
  } catch {}
}
$out | ConvertTo-Json -Compress
`.trim();
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { maxBuffer: 8 * 1024 * 1024, windowsHide: true, timeout: 60000 }
      );
      const t = (stdout || '').trim();
      if (!t) continue;
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') {
        for (const [lnk, target] of Object.entries(parsed)) {
          if (lnk && target) map.set(String(lnk), String(target));
        }
      }
    } catch {
      /* skip chunk */
    }
  }
  return map;
}

function dedupeApps(list, resolveMap) {
  const byKey = new Map();
  for (const app of list) {
    let target = app.launchPath;
    if (target.toLowerCase().endsWith('.lnk')) {
      target = resolveMap.get(target) || target;
    }
    const key = `${String(app.name).toLowerCase().trim()}|${String(target).toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, app);
      continue;
    }
    const preferNew =
      existing.launchPath.toLowerCase().endsWith('.lnk') && !app.launchPath.toLowerCase().endsWith('.lnk');
    if (preferNew) byKey.set(key, app);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function iconSourcePath(entry, resolveMap) {
  const lp = entry.launchPath;
  if (lp.startsWith('uwp:')) return lp;
  if (lp.toLowerCase().endsWith('.lnk')) {
    const resolved = resolveMap.get(lp);
    if (resolved && fs.existsSync(resolved)) return resolved;
  }
  return lp;
}

async function fetchIcon(electronApp, entry, resolveMap) {
  try {
    if (entry.launchPath.startsWith('uwp:')) {
      const appId = entry.launchPath.slice(4);
      const shellPath = `shell:AppsFolder\\${appId}`;
      const img = await electronApp.getFileIcon(shellPath, { size: 'large' });
      if (!img.isEmpty()) return img.toDataURL();
      return '';
    }
    const src = iconSourcePath(entry, resolveMap);
    const img = await electronApp.getFileIcon(src, { size: 'large' });
    if (!img.isEmpty()) return img.toDataURL();
    if (src !== entry.launchPath) {
      const fallback = await electronApp.getFileIcon(entry.launchPath, { size: 'large' });
      if (!fallback.isEmpty()) return fallback.toDataURL();
    }
  } catch {
    /* */
  }
  return '';
}

/**
 * @param {{ getFileIcon: (p: string, o?: object) => Promise<import('electron').NativeImage> }} electronApp
 * @param {{ onChunk?: (apps: object[]) => void, iconConcurrency?: number, includeRegistry?: boolean, iconById?: Map<string, string> }} opts
 */
async function scanWindowsApps(electronApp, opts = {}) {
  const onChunk = opts.onChunk;
  const iconById = opts.iconById || new Map();
  const concurrency = Math.max(4, Math.min(16, opts.iconConcurrency ?? 12));
  const includeRegistry = opts.includeRegistry !== false;

  const { byKey } = buildAppIndex();

  const regPromise = includeRegistry ? registryExeApps() : Promise.resolve([]);
  const uwpPromise = startMenuUwpApps();
  const [regList, uwpList] = await Promise.all([regPromise, uwpPromise]);

  let list = mergeRowsIntoIndex(byKey, regList, uwpList);
  const lnks = list.filter((e) => e.launchPath.toLowerCase().endsWith('.lnk')).map((e) => e.launchPath);
  const resolveMap = await resolveShortcutsBatch(lnks);
  list = dedupeApps(list, resolveMap);

  const out = list.map((entry) => ({
    ...entry,
    iconPng: iconById.get(entry.id) || '',
    launchCount: 0,
    lastLaunched: null,
  }));

  if (onChunk) onChunk(out.slice());

  let nextIdx = 0;
  let done = 0;

  async function iconWorker() {
    while (nextIdx < out.length) {
      const i = nextIdx;
      nextIdx += 1;
      const entry = out[i];
      if (entry.iconPng) {
        done += 1;
        continue;
      }
      const iconPng = await fetchIcon(electronApp, entry, resolveMap);
      if (iconPng) out[i] = { ...out[i], iconPng };
      done += 1;
      if (onChunk && done % 18 === 0) onChunk(out.slice());
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => iconWorker()));

  if (onChunk) onChunk(out.slice());

  return out;
}

module.exports = { scanWindowsApps, stableId, shortcutRoots };
