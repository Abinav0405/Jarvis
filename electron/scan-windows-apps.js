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

function normPath(p) {
  return String(p || '')
    .toLowerCase()
    .replace(/\//g, '\\');
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

function listStartMenuLnks() {
  const acc = [];
  for (const root of shortcutRoots()) walkLnks(root, acc);
  return acc;
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

/** Resolve .lnk → target exe + icon path (temp JSON file — reliable on Windows paths). */
async function resolveShortcutsBatch(lnkPaths) {
  const map = new Map();
  if (!lnkPaths.length) return map;

  const tmp = path.join(os.tmpdir(), `jarvis-lnks-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(lnkPaths), 'utf8');
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = Get-Content -LiteralPath '${tmp.replace(/'/g, "''")}' -Raw | ConvertFrom-Json
$sh = New-Object -ComObject WScript.Shell
$out = @{}
foreach ($p in $paths) {
  try {
    $sc = $sh.CreateShortcut($p)
    if ($sc.TargetPath) {
      $icon = $sc.IconLocation
      if (-not $icon) { $icon = $sc.TargetPath }
      $out[$p] = @{ target = [string]$sc.TargetPath; icon = [string]$icon }
    }
  } catch {}
}
$out | ConvertTo-Json -Compress -Depth 4
`.trim();
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { maxBuffer: 12 * 1024 * 1024, windowsHide: true, timeout: 90000 }
    );
    const t = (stdout || '').trim();
    if (t) {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') {
        for (const [lnk, info] of Object.entries(parsed)) {
          if (!lnk || !info) continue;
          const target = info.target || info.Target;
          if (!target) continue;
          map.set(String(lnk), {
            target: String(target),
            iconPath: String(info.icon || info.Icon || target),
          });
        }
      }
    }
  } catch {
    /* batch failed */
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* */
    }
  }
  return map;
}

function parseIconPath(iconLoc) {
  const raw = String(iconLoc || '').trim().replace(/^"+|"+$/g, '');
  if (!raw) return null;
  const comma = raw.lastIndexOf(',');
  if (comma > 2) {
    const tail = raw.slice(comma + 1).trim();
    const head = raw.slice(0, comma).trim().replace(/^"+|"+$/g, '');
    if (/^\d+$/.test(tail) && head) return head;
  }
  return raw;
}

function upsertApp(apps, key, entry) {
  const k = normPath(key);
  if (!k) return;
  const existing = apps.get(k);
  if (!existing) {
    apps.set(k, entry);
    return;
  }
  if ((entry.name || '').length > (existing.name || '').length) {
    apps.set(k, { ...existing, name: entry.name, iconHint: entry.iconHint || existing.iconHint });
  }
}

function buildAppCatalog(regList, uwpList, lnkPaths, resolveMap) {
  const apps = new Map();

  for (const row of regList) {
    const p = row.Path || row.path;
    const n = row.Name || row.name;
    if (!p || !n || !fs.existsSync(p)) continue;
    upsertApp(apps, p, {
      id: stableId(p),
      name: String(n).trim(),
      launchPath: p,
      iconHint: p,
    });
  }

  for (const row of uwpList) {
    const id = row.AppId || row.appId;
    const n = row.Name || row.name;
    if (!id || !n) continue;
    const launchPath = `uwp:${id}`;
    upsertApp(apps, launchPath, {
      id: stableId(launchPath),
      name: String(n).trim(),
      launchPath,
      iconHint: launchPath,
    });
  }

  for (const lnk of lnkPaths) {
    const info = resolveMap.get(lnk);
    if (!info?.target || !fs.existsSync(info.target)) continue;
    const target = info.target;
    const key = normPath(target);
    if (apps.has(key)) continue;
    const name = path.basename(lnk, '.lnk');
    upsertApp(apps, target, {
      id: stableId(target),
      name,
      launchPath: target,
      iconHint: parseIconPath(info.iconPath) || target,
    });
  }

  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

async function loadIconFromPath(electronApp, filePath) {
  const p = parseIconPath(filePath);
  if (!p || !fs.existsSync(p)) return '';
  try {
    if (/\.ico$/i.test(p)) {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(p);
      if (img && !img.isEmpty()) return img.resize({ width: 64, height: 64 }).toDataURL();
    }
    const img = await electronApp.getFileIcon(p, { size: 'large' });
    if (!img.isEmpty()) return img.toDataURL();
  } catch {
    /* */
  }
  return '';
}

async function fetchIcon(electronApp, entry) {
  const hints = [];
  if (entry.iconHint) hints.push(entry.iconHint);
  if (entry.launchPath.startsWith('uwp:')) {
    const appId = entry.launchPath.slice(4);
    hints.push(`shell:AppsFolder\\${appId}`);
  } else {
    hints.push(entry.launchPath);
  }

  for (const hint of hints) {
    if (hint.startsWith('uwp:') || hint.startsWith('shell:')) {
      try {
        const shellPath = hint.startsWith('shell:') ? hint : `shell:AppsFolder\\${hint.slice(4)}`;
        const img = await electronApp.getFileIcon(shellPath, { size: 'large' });
        if (!img.isEmpty()) return img.toDataURL();
      } catch {
        /* */
      }
      continue;
    }
    const data = await loadIconFromPath(electronApp, hint);
    if (data) return data;
  }
  return '';
}

/**
 * @param {{ getFileIcon: (p: string, o?: object) => Promise<import('electron').NativeImage> }} electronApp
 * @param {{ onChunk?: (apps: object[]) => void, iconConcurrency?: number, includeRegistry?: boolean, iconById?: Map<string, string>, iconByPath?: Map<string, string> }} opts
 */
async function scanWindowsApps(electronApp, opts = {}) {
  const onChunk = opts.onChunk;
  const iconById = opts.iconById || new Map();
  const iconByPath = opts.iconByPath || new Map();
  const concurrency = Math.max(4, Math.min(16, opts.iconConcurrency ?? 12));
  const includeRegistry = opts.includeRegistry !== false;

  const regPromise = includeRegistry ? registryExeApps() : Promise.resolve([]);
  const uwpPromise = startMenuUwpApps();
  const lnkPaths = listStartMenuLnks();
  const [regList, uwpList, resolveMap] = await Promise.all([
    regPromise,
    uwpPromise,
    resolveShortcutsBatch(lnkPaths),
  ]);

  const list = buildAppCatalog(regList, uwpList, lnkPaths, resolveMap);

  const out = list.map((entry) => ({
    id: entry.id,
    name: entry.name,
    launchPath: entry.launchPath,
    iconPng: iconById.get(entry.id) || iconByPath.get(normPath(entry.launchPath)) || '',
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
      const entry = { ...list[i], iconHint: list[i].iconHint };
      if (out[i].iconPng) {
        done += 1;
        continue;
      }
      const iconPng = await fetchIcon(electronApp, entry);
      if (iconPng) out[i] = { ...out[i], iconPng };
      done += 1;
      if (onChunk && done % 18 === 0) onChunk(out.slice());
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => iconWorker()));

  if (onChunk) onChunk(out.slice());

  return out;
}

module.exports = { scanWindowsApps, stableId, shortcutRoots, normPath };
