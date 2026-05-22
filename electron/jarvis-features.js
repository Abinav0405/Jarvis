const fs = require('fs');
const path = require('path');
const { desktopCapturer, screen } = require('electron');
const { execFile } = require('child_process');
const { promisify } = require('util');
const si = require('systeminformation');

const execFileAsync = promisify(execFile);

function extraJsonPath(baseFile, name) {
  return path.join(path.dirname(baseFile), name);
}

async function capturePrimaryDisplay(mainWindow) {
  const win = mainWindow;
  let hid = false;
  try {
    if (win && !win.isDestroyed() && win.isVisible()) {
      win.hide();
      hid = true;
    }
    await new Promise((r) => setTimeout(r, 220));
    const { width, height } = screen.getPrimaryDisplay().size;
    const tw = Math.min(Math.max(640, width), 2560);
    const th = Math.min(Math.max(480, height), 1600);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: tw, height: th },
    });
    const src = sources.find((s) => String(s.id).startsWith('screen:0')) || sources[0];
    if (!src || !src.thumbnail) return { ok: false, error: 'No screen source' };
    const png = src.thumbnail.toPNG();
    return { ok: true, dataUrl: `data:image/png;base64,${png.toString('base64')}` };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    if (hid && win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  }
}

const CHAT_EXT = new Set(['.txt', '.md', '.js', '.jsx', '.ts', '.tsx', '.json', '.csv', '.pdf']);

function readImageDataUrl(absPath) {
  const p = path.resolve(String(absPath || ''));
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) return { ok: false, error: 'not found' };
  const ext = path.extname(p).toLowerCase();
  const mime =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.bmp'
          ? 'image/bmp'
          : ext === '.png'
            ? 'image/png'
            : null;
  if (!mime) return { ok: false, error: 'unsupported' };
  const buf = fs.readFileSync(p);
  return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
}

async function readChatFile(absPath) {
  const p = path.resolve(String(absPath || ''));
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
    return { ok: false, error: 'File not found' };
  }
  const ext = path.extname(p).toLowerCase();
  if (!CHAT_EXT.has(ext)) return { ok: false, error: 'Unsupported type' };
  const max = 50000;
  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const buf = fs.readFileSync(p);
      const res = await pdfParse(buf);
      let text = String(res.text || '').replace(/\s+\n/g, '\n').trim();
      let truncated = false;
      if (text.length > max) {
        text = text.slice(0, max);
        truncated = true;
      }
      return {
        ok: true,
        name: path.basename(p),
        size: buf.length,
        text,
        truncated,
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }
  const raw = fs.readFileSync(p, 'utf8');
  let text = raw;
  let truncated = false;
  if (text.length > max) {
    text = text.slice(0, max);
    truncated = true;
  }
  return { ok: true, name: path.basename(p), size: Buffer.byteLength(raw, 'utf8'), text, truncated };
}

function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(file, obj) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

function appendPresetLaunch(dataFilePath, presetName) {
  const file = extraJsonPath(dataFilePath, 'preset-activity.json');
  const cur = readJsonSafe(file, { version: 1, launches: [] });
  const launches = Array.isArray(cur.launches) ? cur.launches : [];
  const now = Date.now();
  const d = new Date(now);
  launches.push({
    preset: String(presetName || ''),
    timestamp: now,
    dayOfWeek: d.getDay(),
    hour: d.getHours(),
  });
  const trimmed = launches.slice(-8000);
  writeJsonSafe(file, { version: 1, launches: trimmed });
  analyzePatterns(dataFilePath);
}

function analyzePatterns(dataFilePath) {
  const actFile = extraJsonPath(dataFilePath, 'preset-activity.json');
  const outFile = extraJsonPath(dataFilePath, 'patterns.json');
  const { launches } = readJsonSafe(actFile, { launches: [] });
  if (!Array.isArray(launches) || !launches.length) {
    writeJsonSafe(outFile, { version: 1, patterns: [], sequences: [], updatedAt: Date.now() });
    return { patterns: [], sequences: [] };
  }
  const now = Date.now();
  const dayMs = 86400000;
  const thirty = now - 30 * dayMs;
  const recent = launches.filter((l) => l.timestamp >= thirty);
  const byKey = new Map();
  for (const l of recent) {
    const k = `${l.dayOfWeek}|${l.hour}|${String(l.preset || '').toLowerCase()}`;
    byKey.set(k, (byKey.get(k) || 0) + 1);
  }
  const patterns = [];
  for (const [k, count] of byKey) {
    if (count >= 3) {
      const [dow, hour, preset] = k.split('|');
      patterns.push({ type: 'time', dayOfWeek: Number(dow), hour: Number(hour), preset, count });
    }
  }
  writeJsonSafe(outFile, { version: 1, patterns, sequences: [], updatedAt: Date.now() });
  return { patterns, sequences: [] };
}

function getSuggestionsNow(dataFilePath) {
  const file = extraJsonPath(dataFilePath, 'patterns.json');
  const actFile = extraJsonPath(dataFilePath, 'preset-activity.json');
  let needAnalyze = false;
  try {
    if (!fs.existsSync(file)) needAnalyze = true;
    else if (fs.existsSync(actFile)) {
      const actM = fs.statSync(actFile).mtimeMs;
      const patM = fs.statSync(file).mtimeMs;
      if (actM > patM) needAnalyze = true;
    }
  } catch {
    /* ignore */
  }
  if (needAnalyze) analyzePatterns(dataFilePath);
  const { patterns } = readJsonSafe(file, { patterns: [] });
  const d = new Date();
  const dow = d.getDay();
  const hour = d.getHours();
  const hit = (patterns || []).find(
    (p) =>
      p &&
      p.type === 'time' &&
      Number(p.dayOfWeek) === dow &&
      Math.abs(Number(p.hour) - hour) <= 1 &&
      p.preset
  );
  if (!hit) return null;
  return {
    presetName: hit.preset,
    message: `It's usually ${hit.preset} time around now, Boss.`,
  };
}

let lastNetSpeed = { mbpsDown: 0, mbpsUp: 0, ts: 0 };
const NET_SPEED_CACHE_MS = 3000;

/** Aggregate interface throughput (bytes/s → Mbps). Cached to coalesce rapid IPC. */
async function networkSpeedMbps() {
  const now = Date.now();
  if (now - lastNetSpeed.ts < NET_SPEED_CACHE_MS && lastNetSpeed.ts > 0) {
    return { ...lastNetSpeed, ts: now };
  }
  try {
    const arr = await si.networkStats();
    let rx = 0;
    let tx = 0;
    for (const n of arr || []) {
      rx += Number(n.rx_sec) || 0;
      tx += Number(n.tx_sec) || 0;
    }
    lastNetSpeed = { mbpsDown: (rx * 8) / 1e6, mbpsUp: (tx * 8) / 1e6, ts: Date.now() };
    return { ...lastNetSpeed };
  } catch {
    lastNetSpeed = { mbpsDown: 0, mbpsUp: 0, ts: Date.now() };
    return { ...lastNetSpeed };
  }
}

async function pingMs() {
  const t0 = Date.now();
  try {
    await fetch('https://1.1.1.1/cdn-cgi/trace', { method: 'GET' });
    return Date.now() - t0;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BROWSER_PROC = new Set(
  ['chrome', 'msedge', 'firefox', 'brave', 'opera', 'vivaldi', 'arc', 'whale', 'browser'].map((s) => s.toLowerCase())
);

function normProcName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\.exe$/i, '');
}

async function listProcessesWindows() {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
$perf = @{}
Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.IDProcess -gt 0 } |
  ForEach-Object { $perf[[int]$_.IDProcess] = [double]$_.PercentProcessorTime }
$rows = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Id -gt 0 } |
  ForEach-Object {
    [PSCustomObject]@{
      Name = $_.ProcessName
      Id = $_.Id
      CPU = [math]::Round([double]($perf[$_.Id]), 1)
      WorkingSet = [math]::Round($_.WorkingSet64 / 1MB, 0)
    }
  } |
  Sort-Object CPU -Descending |
  Select-Object -First 50
$total = (Get-Process -ErrorAction SilentlyContinue | Measure-Object).Count
@{ processes = @($rows); totalCount = $total } | ConvertTo-Json -Compress -Depth 4
`.trim();
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 6 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout.trim() || '{}');
    const raw = parsed.processes;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const processes = arr
      .filter((r) => r && (r.Id || r.id) > 0)
      .map((r) => ({
        name: r.Name || r.name,
        pid: r.Id || r.id,
        cpu: Number(r.CPU ?? r.cpu ?? 0),
        ram: Math.round(Number(r.WorkingSet ?? r.workingset ?? 0)),
      }));
    const totalCount = Number(parsed.totalCount) || processes.length;
    return { processes, totalCount };
  } catch {
    return null;
  }
}

/** Live CPU % and RAM (MB) — Windows uses perf counters; falls back to systeminformation. */
async function listProcessesTop() {
  if (process.platform === 'win32') {
    const win = await listProcessesWindows();
    if (win && win.processes.length) return win;
  }

  try {
    const data = await si.processes();
    const list = (data.list || [])
      .filter((p) => {
        if (!p || !p.pid || p.pid <= 0 || !p.name) return false;
        const n = String(p.name).toLowerCase();
        return n !== 'system idle process' && n !== 'idle';
      })
      .map((p) => ({
        name: p.name,
        pid: p.pid,
        cpu: Math.round((Number(p.cpu) || 0) * 10) / 10,
        ram: Math.round((Number(p.memRss) || 0) / 1024),
      }))
      .sort((a, b) => b.cpu - a.cpu || b.ram - a.ram)
      .slice(0, 50);
    const totalCount = Number(data.all) || Number(data.running) || list.length;
    return { processes: list, totalCount };
  } catch {
    if (process.platform === 'win32') {
      const win = await listProcessesWindows();
      if (win) return win;
    }
    return { processes: [], totalCount: 0 };
  }
}

const KILL_BLOCK = new Set(
  [
    'System',
    'System Idle Process',
    'Idle',
    'Registry',
    'smss',
    'csrss',
    'wininit',
    'services',
    'lsass',
    'svchost',
    'dwm',
    'winlogon',
    'explorer',
    'fontdrvhost',
    'sihost',
    'taskhostw',
    'MsMpEng',
    'NisSrv',
    'SecurityHealthService',
    'SearchIndexer',
    'spoolsv',
    'audiodg',
    'WmiPrvSE',
    'RuntimeBroker',
    'SystemSettings',
    'ShellExperienceHost',
    'StartMenuExperienceHost',
  ].map((s) => s.toLowerCase())
);

async function killProcess(pid) {
  const id = Number(pid);
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid pid');
  await execFileAsync('taskkill', ['/PID', String(id), '/T', '/F'], {
    windowsHide: true,
    timeout: 10000,
  });
  return { ok: true };
}

async function captureProcessPidSet() {
  const data = await si.processes();
  return new Set((data.list || []).map((p) => p.pid).filter((pid) => pid > 0));
}

async function findPidsByExePath(exePath) {
  const target = path.resolve(String(exePath || '')).toLowerCase();
  const base = path.basename(target).toLowerCase();
  if (!target) return [];
  try {
    const data = await si.processes();
    const pids = [];
    for (const p of data.list || []) {
      const pp = String(p.path || '').toLowerCase();
      if (pp === target || (pp && pp.endsWith(`\\${base}`))) {
        if (p.pid > 0) pids.push(p.pid);
      }
    }
    return [...new Set(pids)];
  } catch {
    return [];
  }
}

async function getProcessName(pid) {
  try {
    const data = await si.processes();
    const hit = (data.list || []).find((p) => p.pid === pid);
    return hit ? hit.name : '';
  } catch {
    return '';
  }
}

/** Tracks apps/tabs opened by the active preset so Close All can terminate them. */
let activePresetSession = null;

async function captureSystemSnapshot(sysWin) {
  const snap = { volume: null, wallpaper: null };
  try {
    snap.volume = await sysWin.getMasterVolumePercent();
  } catch {
    /* ignore */
  }
  try {
    snap.wallpaper = await sysWin.getDesktopWallpaper();
  } catch {
    /* ignore */
  }
  return snap;
}

async function beginPresetLaunch(presetId, sysWin, { exePaths = [], openedTabs = false } = {}) {
  await endPresetSession(sysWin);
  activePresetSession = {
    presetId: String(presetId || ''),
    pids: new Set(),
    exePaths: exePaths.map((p) => path.resolve(String(p || ''))).filter(Boolean),
    openedTabs: Boolean(openedTabs),
    beforePids: await captureProcessPidSet(),
    systemBefore: await captureSystemSnapshot(sysWin),
  };
}

async function trackLaunchedExe(exePath) {
  if (!activePresetSession) return;
  await sleep(2000);
  const pids = await findPidsByExePath(exePath);
  for (const pid of pids) {
    if (!activePresetSession.beforePids.has(pid)) activePresetSession.pids.add(pid);
  }
}

async function trackOpenedTabs() {
  if (!activePresetSession) return;
  await sleep(2500);
  const data = await si.processes();
  for (const p of data.list || []) {
    if (!p.pid || activePresetSession.beforePids.has(p.pid)) continue;
    if (BROWSER_PROC.has(normProcName(p.name))) activePresetSession.pids.add(p.pid);
  }
}

async function collectPresetPids(session) {
  const pids = new Set(session.pids);
  for (const exePath of session.exePaths || []) {
    const found = await findPidsByExePath(exePath);
    for (const pid of found) {
      if (!session.beforePids.has(pid)) pids.add(pid);
    }
  }
  if (session.openedTabs) {
    const data = await si.processes();
    for (const p of data.list || []) {
      if (!p.pid || session.beforePids.has(p.pid)) continue;
      if (BROWSER_PROC.has(normProcName(p.name))) pids.add(p.pid);
    }
  }
  return pids;
}

async function endPresetSession(sysWin) {
  if (!activePresetSession) return { killed: 0 };
  const session = activePresetSession;
  activePresetSession = null;

  const toKill = await collectPresetPids(session);
  let killed = 0;
  for (const pid of toKill) {
    const name = await getProcessName(pid);
    if (KILL_BLOCK.has(normProcName(name))) continue;
    try {
      await killProcess(pid);
      killed += 1;
    } catch {
      /* access denied or already exited */
    }
  }

  try {
    await sysWin.restoreDoNotDisturbLite();
  } catch {
    /* ignore */
  }
  if (session.systemBefore) {
    if (session.systemBefore.volume != null) {
      try {
        await sysWin.setMasterVolumePercent(session.systemBefore.volume);
      } catch {
        /* ignore */
      }
    }
    if (session.systemBefore.wallpaper) {
      try {
        await sysWin.setDesktopWallpaper(session.systemBefore.wallpaper);
      } catch {
        /* ignore */
      }
    }
  }
  return { killed };
}

function usagePath(dataFilePath) {
  return extraJsonPath(dataFilePath, 'usage.json');
}

function readUsage(dataFilePath) {
  return readJsonSafe(usagePath(dataFilePath), { version: 1, days: {} });
}

function bumpUsageSeconds(dataFilePath, appName, seconds) {
  if (!appName || seconds <= 0) return;
  const file = usagePath(dataFilePath);
  const cur = readUsage(dataFilePath);
  const day = new Date().toISOString().slice(0, 10);
  const days = cur.days && typeof cur.days === 'object' ? { ...cur.days } : {};
  const apps = { ...(days[day] || {}) };
  const k = String(appName).trim() || 'Unknown';
  apps[k] = (Number(apps[k]) || 0) + seconds;
  days[day] = apps;
  writeJsonSafe(file, { version: 1, days, updatedAt: Date.now() });
}

const FG_PS = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JarvisFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
try {
  $h = [JarvisFg]::GetForegroundWindow()
  if ($h -eq [IntPtr]::Zero) { "" }
  else {
    [uint32]$processId = 0
    [void][JarvisFg]::GetWindowThreadProcessId($h, [ref]$processId)
    if ($processId -gt 0) {
      $p = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($p) { $p.ProcessName } else { "" }
    } else { "" }
  }
} catch { "" }
`.trim();

async function getForegroundProcessName() {
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', FG_PS], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 256 * 1024,
    });
    return String(stdout || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop();
  } catch {
    return '';
  }
}

async function flushDnsWindows() {
  try {
    const { stdout, stderr } = await execFileAsync('cmd.exe', ['/c', 'ipconfig /flushdns'], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 512 * 1024,
    });
    return { ok: true, out: String(stdout || stderr || '').trim() };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

async function listNetTcpSnapshot() {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue |
  Select-Object -First 48 @{N='Pid';E={$_.OwningProcess}}, RemoteAddress, RemotePort, State |
  ConvertTo-Json -Compress -Depth 3
`.trim();
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true,
      timeout: 14000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout.trim() || '[]');
    const arr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return arr.map((r) => ({
      pid: r.Pid ?? r.pid,
      remote: r.RemoteAddress != null ? `${r.RemoteAddress}:${r.RemotePort}` : '',
      state: r.State || r.state || '',
    }));
  } catch {
    return [];
  }
}

module.exports = {
  capturePrimaryDisplay,
  readImageDataUrl,
  readChatFile,
  appendPresetLaunch,
  analyzePatterns,
  getSuggestionsNow,
  networkSpeedMbps,
  pingMs,
  listProcessesTop,
  killProcess,
  KILL_BLOCK,
  beginPresetLaunch,
  trackLaunchedExe,
  trackOpenedTabs,
  endPresetSession,
  extraJsonPath,
  readUsage,
  bumpUsageSeconds,
  usagePath,
  getForegroundProcessName,
  flushDnsWindows,
  listNetTcpSnapshot,
};
