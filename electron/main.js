const {
  app,
  BrowserWindow,
  globalShortcut,
  shell,
  nativeTheme,
  dialog,
  Notification,
  Tray,
  Menu,
  nativeImage,
  session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const jarvisIpc = require('./ipc-register');
const { startWebUiServer } = require('./web-ui-server');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;

/** @type {Awaited<ReturnType<typeof startWebUiServer>> | null} */
let webUiServer = null;
/** Push renderer IPC events to browser clients (SSE). */
let webUiPush = (_channel, _args) => {};

function emitJarvis(channel, ...payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, ...payload);
    } catch {
      /* */
    }
  }
  try {
    webUiPush(channel, payload);
  } catch {
    /* */
  }
}

/** One running instance: second launch focuses the existing window (hotkey / tray workflow). */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

if (process.platform === 'win32') {
  app.setAppUserModelId('com.jarvis.desktop');
}

/**
 * Chromium’s Web Speech path often needs a Google API key (Chrome ships one; Electron does not).
 * Optional: single-line file next to presets — %AppData%\\JARVIS\\GOOGLE_API_KEY.txt
 */
function loadOptionalGoogleSpeechKey() {
  const fromEnv = String(process.env.GOOGLE_API_KEY || '').trim();
  if (fromEnv) return;
  try {
    const keyPath = path.join(app.getPath('userData'), 'GOOGLE_API_KEY.txt');
    if (!fs.existsSync(keyPath)) return;
    const key = fs.readFileSync(keyPath, 'utf8').trim();
    if (!key) return;
    process.env.GOOGLE_API_KEY = key;
    console.log('[Jarvis] Using GOOGLE_API_KEY from userData for Chromium services (e.g. speech).');
  } catch (e) {
    console.warn('[Jarvis] Optional GOOGLE_API_KEY.txt:', e && e.message ? e.message : e);
  }
}

/** Chromium: keep the Web Speech API path enabled in the desktop shell (wake word). */
try {
  app.commandLine.appendSwitch('enable-features', 'WebSpeechRecognition');
} catch {
  /* ignore */
}
const os = require('os');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const crypto = require('crypto');
const si = require('systeminformation');
const sysWin = require('./system-windows');
const { scanWindowsApps } = require('./scan-windows-apps');
const jarvisFeatures = require('./jarvis-features');
const unifiedSearch = require('./unified-search');
const { resolveAppLaunch } = require('./app-launcher');
const dashboardExtras = require('./dashboard-extras');
const { createGeminiLiveHost } = require('./gemini-live-host.js');

/** @type {ReturnType<createGeminiLiveHost> | null} */
let geminiLiveHost = null;
const { createGoogleCalendarApi } = require('./google-calendar');

const isDev = !app.isPackaged;

/**
 * Loopback helper so the system browser (web version or Vite dev) can focus the desktop window.
 * Keep in sync with `JARVIS_FOCUS_PORT` in `src/jarvis-bridge.js` and `src/jarvis-http-jarvis.js`.
 */
const JARVIS_FOCUS_PORT = 47842;
const FOCUS_SECRET = crypto.randomBytes(16).toString('hex');
/** @type {import('http').Server | null} */
let focusServer = null;

function focusCorsOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return 'null';
  try {
    const u = new URL(origin);
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return origin;
  } catch {
    /* ignore */
  }
  return null;
}

function startJarvisFocusServer() {
  if (focusServer) return;
  focusServer = http.createServer((req, res) => {
    const cors = focusCorsOrigin(req);
    if (cors) res.setHeader('Access-Control-Allow-Origin', cors);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (reqUrl.pathname === '/focus') {
      if (reqUrl.searchParams.get('secret') !== FOCUS_SECRET) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  focusServer.on('error', (err) => {
    console.warn('[Jarvis] Focus server:', err.code || err.message);
  });
  focusServer.listen(JARVIS_FOCUS_PORT, '127.0.0.1', () => {
    console.log(
      `[Jarvis] Web → desktop focus: GET http://127.0.0.1:${JARVIS_FOCUS_PORT}/focus (desktop app must be running)`,
    );
  });
}

/** Start local web UI on demand if startup failed (ports busy, etc.). */
async function ensureWebUiServer() {
  if (webUiServer) return webUiServer;
  if (!app.isPackaged) return null;
  const distRoot = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
    console.warn('[Jarvis] Web UI: dist/index.html missing');
    return null;
  }
  try {
    webUiServer = await startWebUiServer({
      distRoot,
      invokeJarvis: (channel, event, args) => jarvisIpc.invoke(channel, event, args),
      getSender: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
    });
    webUiPush = (channel, payload) => {
      webUiServer.broadcast(channel, payload);
    };
    console.log('[Jarvis] Local web UI (retry):', webUiServer.getOpenUrl());
    return webUiServer;
  } catch (e) {
    console.warn('[Jarvis] Local web UI failed to start:', e && e.message ? e.message : e);
    return null;
  }
}

/** Dev: keep Chromium caches under Local (not OneDrive) to avoid cache_util_win "Access is denied". */
if (isDev) {
  try {
    const devUserData = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Jarvis-Electron-Dev');
    fs.mkdirSync(devUserData, { recursive: true });
    app.setPath('userData', devUserData);
  } catch (e) {
    console.warn('[Jarvis] Could not set dev userData:', e && e.message ? e.message : e);
  }
}

/** After userData path is final (dev uses LocalAppData\Jarvis-Electron-Dev). */
loadOptionalGoogleSpeechKey();

if (isDev) {
  try {
    require('electron-reloader')(module, {
      watchRenderer: false,
    });
  } catch {
    /* optional devDependency */
  }
}

/** Dev: repo `data/presets.json`. Packaged: writable `%AppData%/JARVIS/presets.json` (Windows). */
function dataFilePath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'presets.json');
  }
  return path.join(__dirname, '..', 'data', 'presets.json');
}

const DEFAULT_DATA = {
  version: 1,
  presets: [],
  pinnedLinks: [],
  activePresetId: null,
  settings: {
    startupWithWindows: false,
    defaultPresetOnLaunch: null,
    logActivity: true,
    accentColor: '#00D4FF',
    fontScale: 1,
    windowOpacity: 1,
    fullscreen: false,
    customSearchUrl: '',
    apiKey: '',
    aiProvider: 'anthropic',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2',
    mainHotkey: 'Control+Shift+Space',
    wakeWordEnabled: true,
    smartSuggestionsEnabled: true,
    usageTrackingEnabled: true,
    networkWidgetEnabled: true,
    micPermissionAsked: false,
    /** `mic` | `speech` when wake-word was stopped due to errors (cleared when user re-enables wake word). */
    voiceWakeUnavailable: null,
    dashboardScratch: '',
    weatherCity: 'London',
    lastPresetId: null,
    focusTimerEnd: null,
    userName: '',
    setupComplete: false,
    theme: 'arc-reactor',
    colorMode: 'dark',
    geminiApiKey: '',
    voiceMode: 'live',
    preferredLanguage: 'en',
    googleCalendarConnected: false,
    uiDensity: 'comfortable',
    panelOpacity: 0.04,
    accentGlow: 'subtle',
    cornerStyle: 'rounded',
    reduceMotion: false,
    bootAnimationEnabled: true,
    hologramEffects: true,
    sidebarCompact: false,
  },
  todos: [],
  activityLog: [],
  dashboardAppPins: [],
  aiChatHistory: [],
};

function mergeDefaults(data) {
  const d = { ...DEFAULT_DATA, ...data };
  d.settings = { ...DEFAULT_DATA.settings, ...(data.settings || {}) };
  d.presets = Array.isArray(data.presets) ? data.presets : [];
  d.pinnedLinks = Array.isArray(data.pinnedLinks) ? data.pinnedLinks : [];
  d.activityLog = Array.isArray(data.activityLog) ? data.activityLog : [];
  d.dashboardAppPins = Array.isArray(data.dashboardAppPins) ? data.dashboardAppPins : [];
  d.aiChatHistory = Array.isArray(data.aiChatHistory) ? data.aiChatHistory : [];
  d.todos = Array.isArray(data.todos) ? data.todos : [];
  return d;
}

const googleCalendar = createGoogleCalendarApi(() => app.getPath('userData'));

function bundledTemplatePath(fileName) {
  const candidates = [path.join(__dirname, '..', 'data', 'templates', fileName)];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'data', 'templates', fileName));
  }
  for (const src of candidates) {
    if (src && fs.existsSync(src)) return src;
  }
  return null;
}

/** Seed userData from shipped templates only — never copy developer presets.json / apps.json. */
function migratePersistentUserData() {
  const userDir = app.getPath('userData');
  try {
    fs.mkdirSync(userDir, { recursive: true });
  } catch {
    /* ignore */
  }

  const fileNames = ['presets.json', 'apps.json', 'usage.json', 'preset-activity.json', 'patterns.json'];
  for (const fileName of fileNames) {
    const dest = path.join(userDir, fileName);
    if (fs.existsSync(dest)) continue;

    if (fileName === 'presets.json') {
      try {
        const tpl = bundledTemplatePath('presets.json');
        if (tpl) {
          fs.copyFileSync(tpl, dest);
        } else {
          fs.writeFileSync(dest, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
        }
        console.log('[Jarvis] Initialized presets.json → userData (template)');
      } catch (e) {
        console.warn('[Jarvis] Could not initialize presets.json:', e && e.message ? e.message : e);
      }
      continue;
    }

    const tpl = bundledTemplatePath(fileName);
    if (tpl) {
      try {
        fs.copyFileSync(tpl, dest);
        console.log(`[Jarvis] Initialized ${fileName} → userData (template)`);
      } catch (e) {
        console.warn(`[Jarvis] Could not initialize ${fileName}:`, e && e.message ? e.message : e);
      }
    }
  }
}

function ensureDataFile() {
  const file = dataFilePath();
  if (!fs.existsSync(file)) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
  }
}

function readDataSync() {
  ensureDataFile();
  const raw = JSON.parse(fs.readFileSync(dataFilePath(), 'utf8'));
  return mergeDefaults(raw);
}

function writeDataSync(data) {
  ensureDataFile();
  fs.writeFileSync(dataFilePath(), JSON.stringify(mergeDefaults(data), null, 2), 'utf8');
}

/** Dev: `data/apps.json`. Packaged: `%AppData%/JARVIS/apps.json`. */
function appsFilePath() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'apps.json');
  }
  return path.join(__dirname, '..', 'data', 'apps.json');
}

const DEFAULT_APPS_STORE = {
  version: 1,
  lastScan: 0,
  apps: [],
  pinnedIds: [],
};

/** Paths picked in-session for chat attachments (one read each). */
const allowedChatPaths = new Set();
/** Exe paths from pickExe dialog — allowed for launch until app restart. */
const trackedExePaths = new Set();

function isPathUnderUserData(absPath) {
  const base = path.resolve(app.getPath('userData'));
  const resolved = path.resolve(String(absPath || ''));
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

function registerAllowedChatPath(absPath) {
  const p = path.resolve(String(absPath || ''));
  if (p) allowedChatPaths.add(p);
}

function isChatPathAllowed(absPath) {
  const p = path.resolve(String(absPath || ''));
  if (!p) return false;
  if (isPathUnderUserData(p)) return true;
  if (allowedChatPaths.has(p)) {
    allowedChatPaths.delete(p);
    return true;
  }
  return false;
}

function isUnderSafeLaunchRoot(absPath) {
  const resolved = path.resolve(absPath).toLowerCase();
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const roots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu'),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'OneDrive', 'Desktop'),
    path.join(winDir, 'System32'),
    path.join(winDir, 'SysWOW64'),
  ].filter(Boolean);
  for (const root of roots) {
    const r = path.resolve(root).toLowerCase();
    if (resolved === r || resolved.startsWith(`${r}${path.sep}`)) return true;
  }
  return false;
}

function isLaunchPathAllowed(launchPath) {
  const p = String(launchPath || '').trim();
  if (!p) return false;
  if (p.toLowerCase().startsWith('uwp:')) {
    const appId = p.slice(4).trim();
    return appId.length > 0 && !appId.includes('..');
  }
  let resolved;
  try {
    resolved = path.resolve(p);
  } catch {
    return false;
  }
  const lower = resolved.toLowerCase();
  if (trackedExePaths.has(lower)) return true;
  if ((readAppsStoreSync().apps || []).some((a) => path.resolve(String(a.launchPath || '')).toLowerCase() === lower)) {
    return true;
  }
  if (!fs.existsSync(resolved)) return false;
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.exe' && ext !== '.lnk') return false;
  return isUnderSafeLaunchRoot(resolved);
}

function ensureAppsFile() {
  const file = appsFilePath();
  if (!fs.existsSync(file)) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(DEFAULT_APPS_STORE, null, 2), 'utf8');
  }
}

function readAppsStoreSync() {
  ensureAppsFile();
  try {
    const raw = JSON.parse(fs.readFileSync(appsFilePath(), 'utf8'));
    return {
      ...DEFAULT_APPS_STORE,
      ...raw,
      apps: Array.isArray(raw.apps) ? raw.apps : [],
      pinnedIds: Array.isArray(raw.pinnedIds) ? raw.pinnedIds : [],
    };
  } catch {
    return { ...DEFAULT_APPS_STORE };
  }
}

function writeAppsStoreSync(store) {
  ensureAppsFile();
  const next = {
    ...DEFAULT_APPS_STORE,
    ...store,
    apps: Array.isArray(store.apps) ? store.apps : [],
    pinnedIds: Array.isArray(store.pinnedIds) ? store.pinnedIds : [],
  };
  fs.writeFileSync(appsFilePath(), JSON.stringify(next, null, 2), 'utf8');
}

function mergeScanStats(newApps, oldStore) {
  const { normPath } = require('./scan-windows-apps');
  const oldById = new Map((oldStore.apps || []).map((a) => [a.id, a]));
  const oldByPath = new Map();
  for (const a of oldStore.apps || []) {
    if (a.launchPath) oldByPath.set(normPath(a.launchPath), a);
  }
  return newApps.map((a) => {
    const prev = oldById.get(a.id) || oldByPath.get(normPath(a.launchPath));
    return {
      ...a,
      iconPng: a.iconPng || prev?.iconPng || '',
      launchCount: prev?.launchCount ?? a.launchCount ?? 0,
      lastLaunched: prev?.lastLaunched ?? a.lastLaunched ?? null,
    };
  });
}

/** Prefer explicit names, then any other .ico in /build (packaged inside app.asar). */
function listBuildIcoPaths() {
  const root = path.join(__dirname, '..', 'build');
  const out = [];
  const preferred = ['icon.ico', 'app-icon.ico', 'app-logo.ico', 'logo.ico'];
  for (const name of preferred) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) out.push(p);
  }
  if (!fs.existsSync(root)) return out;
  for (const f of fs.readdirSync(root)) {
    if (!f.toLowerCase().endsWith('.ico')) continue;
    const p = path.join(root, f);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** Center-crop to a square, then usable for BrowserWindow / tray (non-square ICOs). */
function loadSquaredAppIconNativeImage() {
  for (const p of listBuildIcoPaths()) {
    try {
      let img = nativeImage.createFromPath(p);
      if (img.isEmpty()) continue;
      const { width, height } = img.getSize();
      if (width > 0 && height > 0 && width !== height) {
        const s = Math.min(width, height);
        const x = Math.floor((width - s) / 2);
        const y = Math.floor((height - s) / 2);
        img = img.crop({ x, y, width: s, height: s });
      }
      return img;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** 1×1 PNG fallback so Windows always has a tray bitmap if branding files are missing. */
const TRAY_FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function resolveTrayNativeImage() {
  const squared = loadSquaredAppIconNativeImage();
  if (squared && !squared.isEmpty()) {
    try {
      return squared.resize({ width: 16, height: 16 });
    } catch {
      /* fall through */
    }
  }
  const dirs = [path.join(__dirname, '..', isDev ? 'public' : 'dist', 'branding')];
  const names = ['jarvis-icon.png', 'jarvis-app-square.jpg', 'jarvis-mark.jpg'];
  for (const dir of dirs) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
      } catch {
        /* ignore */
      }
    }
  }
  try {
    return nativeImage.createFromBuffer(TRAY_FALLBACK_PNG).resize({ width: 16, height: 16 });
  } catch {
    return null;
  }
}

function createJarvisTray() {
  if (tray) {
    try {
      tray.destroy();
    } catch {
      /* ignore */
    }
    tray = null;
  }
  const img = resolveTrayNativeImage();
  if (!img || img.isEmpty()) return;
  tray = new Tray(img);
  tray.setToolTip('JARVIS');
  tray.on('click', () => {
    toggleWindow();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / Hide', click: () => toggleWindow() },
      { type: 'separator' },
      { label: 'Quit JARVIS', click: () => app.quit() },
    ]),
  );
}

function destroyJarvisTray() {
  if (!tray) return;
  try {
    tray.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
}

function wireShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key;
    if (key === 'Escape') {
      event.preventDefault();
      win.hide();
      return;
    }
    if (input.control && !input.shift && !input.alt) {
      const k = key.toLowerCase();
      if (k === 'k') {
        event.preventDefault();
        emitJarvis('jarvis:navigate', 'search');
      } else if (k === 'j') {
        event.preventDefault();
        emitJarvis('jarvis:navigate', 'dashboard');
      } else if (k === 'p') {
        event.preventDefault();
        emitJarvis('jarvis:navigate', 'presets');
      }
    }
  });
}

function createWindow() {
  const squaredIco = loadSquaredAppIconNativeImage();
  const brandDir = path.join(__dirname, '..', isDev ? 'public' : 'dist', 'branding');
  const squareJpg = path.join(brandDir, 'jarvis-app-square.jpg');
  const squarePng = path.join(brandDir, 'jarvis-icon.png');
  const brandingIcon = fs.existsSync(squareJpg) ? squareJpg : fs.existsSync(squarePng) ? squarePng : undefined;
  const windowIcon = squaredIco || brandingIcon;

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: '#090909',
    title: 'JARVIS — Mr Arumugam Abinav',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  /** Auto-grant microphone + camera permissions so SpeechRecognition and getUserMedia work in Electron. */
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'mediaCaptureDevices'];
    if (allowed.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'mediaCaptureDevices'];
    return allowed.includes(permission);
  });

  wireShortcuts(mainWindow);

  mainWindow.on('show', () => {
    emitJarvis('jarvis:window-shown');
  });
  mainWindow.on('hide', () => {
    emitJarvis('jarvis:window-hidden');
  });

  /** Window was `show: false` and only globalShortcut could reveal it — show once so the app is usable if the hotkey fails. */
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const data = readDataSync();
      if (!data.settings?.fullscreen) mainWindow.center();
    } catch {
      mainWindow.center();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.once('did-finish-load', () => {
    try {
      applyFullscreenFromSettings();
      const data = readDataSync();
      const defId = data.settings && data.settings.defaultPresetOnLaunch;
      if (defId) {
        const preset = (data.presets || []).find((p) => p.id === defId);
        if (preset) {
          launchPresetInternal(preset, data).catch(() => {});
          const next = mergeDefaults(data);
          next.activePresetId = preset.id;
          if (next.settings.logActivity !== false) {
            next.activityLog = [...(next.activityLog || [])];
            next.activityLog.unshift({
              id: `boot-${crypto.randomUUID()}`,
              message: `Launched default preset "${preset.name}"`,
              timestamp: Date.now(),
            });
          }
          writeDataSync(next);
          emitJarvis('jarvis:data-changed');
        }
      }
      if (String(data.settings?.geminiApiKey || '').trim() && data.settings?.voiceMode !== 'legacy') {
        ensureGeminiLiveHost().start().catch((err) => console.warn('[Jarvis] live start', err));
      }
    } catch (e) {
      console.error(e);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function applyFullscreenFromSettings() {
  if (!mainWindow) return;
  try {
    const data = readDataSync();
    mainWindow.setFullScreen(!!data.settings?.fullscreen);
  } catch (e) {
    console.error(e);
  }
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    try {
      const data = readDataSync();
      if (!data.settings?.fullscreen) {
        mainWindow.center();
      }
    } catch {
      mainWindow.center();
    }
    mainWindow.show();
    mainWindow.focus();
    applyFullscreenFromSettings();
  }
}

/** If the saved shortcut is taken (common: Control+Space = Windows input switching), try these in order. */
const HOTKEY_FALLBACKS = ['Control+Shift+Space', 'Alt+Shift+J'];

/**
 * Registers show/hide global shortcut. Returns the accelerator that was actually registered, or null if none worked.
 */
function registerHotkeys(requestedAccelerator) {
  globalShortcut.unregisterAll();
  const want = requestedAccelerator ? String(requestedAccelerator).trim() : '';
  const chain = [...new Set([want, ...HOTKEY_FALLBACKS].filter(Boolean))];

  let registered = null;
  for (const acc of chain) {
    if (globalShortcut.register(acc, toggleWindow)) {
      registered = acc;
      break;
    }
  }

  if (!registered && want) {
    console.warn(
      '[Jarvis] No global toggle hotkey could be registered. Use the taskbar window and set another shortcut in Settings.',
    );
  } else if (registered && registered !== want) {
    console.warn(`[Jarvis] Hotkey "${want}" was not available; using "${registered}" to show/hide the window.`);
  }

  const scr = globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      emitJarvis('jarvis:screen-reader');
    }
  });
  if (!scr) {
    console.warn(
      'Failed to register screen reader shortcut (CommandOrControl+Shift+S — may already be used by another app).',
    );
  }

  return registered;
}

async function launchPresetInternal(preset, dataSnapshot) {
  const apps = Array.isArray(preset.apps) ? preset.apps : [];
  const tabs = Array.isArray(preset.tabs) ? preset.tabs : [];
  const exePaths = apps.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  await jarvisFeatures.beginPresetLaunch(preset?.id, sysWin, {
    exePaths,
    openedTabs: tabs.length > 0,
  });
  const sa = preset.systemActions || {};

  for (const exe of apps) {
    if (typeof exe !== 'string' || !exe.trim()) continue;
    const p = exe.trim();
    await shell.openPath(p);
    jarvisFeatures.trackLaunchedExe(p).catch(() => {});
  }
  if (tabs.length) {
    for (let url of tabs) {
      if (typeof url !== 'string' || !url.trim()) continue;
      url = url.trim();
      const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      await shell.openExternal(full);
    }
    jarvisFeatures.trackOpenedTabs().catch(() => {});
  }

  if (sa.setVolume && sa.setVolume.enabled) {
    try {
      await sysWin.setMasterVolumePercent(sa.setVolume.percent ?? 50);
    } catch (e) {
      console.error('Volume set failed', e);
    }
  }
  if (sa.doNotDisturb && sa.doNotDisturb.enabled) {
    try {
      await sysWin.enableDoNotDisturbLite();
      const snap = readDataSync();
      const merged = mergeDefaults(snap);
      merged.settings = { ...merged.settings, jarvisDnd: true };
      writeDataSync(merged);
      emitJarvis('jarvis:data-changed');
    } catch (e) {
      console.error('DND set failed', e);
    }
  }
  if (sa.changeWallpaper && sa.changeWallpaper.enabled && sa.changeWallpaper.imagePath) {
    try {
      await sysWin.setDesktopWallpaper(sa.changeWallpaper.imagePath);
    } catch (e) {
      console.error('Wallpaper set failed', e);
    }
  }

  if (preset?.id) {
    try {
      const snap = readDataSync();
      const next = mergeDefaults(snap);
      next.settings = { ...(next.settings || {}), lastPresetId: preset.id };
      writeDataSync(next);
    } catch {
      /* ignore */
    }
  }

  return true;
}

jarvisIpc.register('data:read', () => readDataSync());

/** Returns runtime info so the renderer can show mode toggle UI. */
function readAppVersion() {
  try {
    // eslint-disable-next-line global-require
    const pkg = require('../package.json');
    return String(pkg.version || '1.0.0');
  } catch {
    return '1.0.0';
  }
}

jarvisIpc.register('runtime:info', (_e, opts) => {
  const fromWeb = !!(opts && opts.fromWebClient);
  const webOk = isDev || !!webUiServer;
  return {
    version: readAppVersion(),
    isElectron: !fromWeb,
    isDev,
    devUrl: isDev ? 'http://127.0.0.1:5173' : null,
    devFocusPort: JARVIS_FOCUS_PORT,
    focusPort: JARVIS_FOCUS_PORT,
    focusSecret: FOCUS_SECRET,
    /** True when this build can open the web version (Vite in dev, local web UI when installed). */
    webVersionSupported: webOk,
    browserPreviewSupported: webOk,
    webUiActive: !!webUiServer,
    webUiUrl: webUiServer ? webUiServer.origin : null,
    speechKeyConfigured: Boolean(String(process.env.GOOGLE_API_KEY || '').trim()),
    userDataPath: app.getPath('userData'),
  };
});

jarvisIpc.register('runtime:version', () => ({ version: readAppVersion() }));

jarvisIpc.register('runtime:openInBrowser', async () => {
  if (isDev) {
    shell.openExternal('http://127.0.0.1:5173');
    return { ok: true };
  }
  const server = webUiServer || (await ensureWebUiServer());
  if (server) {
    shell.openExternal(server.getOpenUrl());
    return { ok: true };
  }
  return {
    ok: false,
    error:
      'Web version could not start. Close other apps using ports 47843–47846, then restart JARVIS and try again.',
  };
});

jarvisIpc.register('runtime:switchToDesktopApp', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return { ok: true };
  }
  return { ok: false, error: 'Window not ready.' };
});
jarvisIpc.register('data:write', (_e, data) => {
  writeDataSync(data);
  emitJarvis('jarvis:data-changed');
  return true;
});

function normalizeOllamaOrigin(base) {
  const u = new URL(String(base || '').trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Ollama URL must use http or https');
  }
  const h = u.hostname.toLowerCase();
  const okLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  const ok192 = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h);
  const ok10 = /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
  const ok172 = /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h);
  if (!okLocal && !ok192 && !ok10 && !ok172) {
    throw new Error('Ollama host must be localhost or a private LAN address');
  }
  return `${u.protocol}//${u.host}`;
}

function formatOllamaHttpError(status, bodyText) {
  let msg = String(bodyText || '').trim().slice(0, 500);
  try {
    const j = JSON.parse(bodyText);
    if (j && typeof j.error === 'string') msg = j.error;
  } catch {
    /* use raw */
  }
  if (!msg) msg = status ? `HTTP ${status}` : 'Network error';
  const low = msg.toLowerCase();
  if (low.includes('model') && low.includes('not found')) {
    return `${msg} — Pull a model in the Ollama app, or pick an installed name under Settings → AI, Boss.`;
  }
  return msg;
}

function findOllamaExe() {
  const local = process.env.LOCALAPPDATA;
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    local && path.join(local, 'Programs', 'Ollama', 'ollama.exe'),
    local && path.join(local, 'Programs', 'Ollama', 'Ollama.exe'),
    path.join(pf, 'Ollama', 'ollama.exe'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function tryStartOllamaServe() {
  const exe = findOllamaExe();
  if (!exe) return false;
  try {
    const proc = spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
    proc.unref();
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Avoid hitting /api/tags on every chat — tiny /api/version + short TTL cache. */
const OLLAMA_PING_TTL_MS = 45_000;
let ollamaPingCache = { key: '', until: 0 };

function ollamaOriginKey(origin) {
  return String(origin || '').toLowerCase();
}

function invalidateOllamaPingCache() {
  ollamaPingCache = { key: '', until: 0 };
}

async function ollamaPing(origin) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${origin}/api/version`, { method: 'GET', signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(tid);
  }
}

async function ollamaReachable(origin) {
  const key = ollamaOriginKey(origin);
  if (key && Date.now() < ollamaPingCache.until && ollamaPingCache.key === key) {
    return true;
  }
  const ok = await ollamaPing(origin);
  if (ok) {
    ollamaPingCache = { key, until: Date.now() + OLLAMA_PING_TTL_MS };
  }
  return ok;
}

async function ollamaListModelNames(origin) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${origin}/api/tags`, { method: 'GET', signal: ctrl.signal });
    const bodyText = await res.text();
    if (!res.ok) throw new Error(formatOllamaHttpError(res.status, bodyText));
    const json = JSON.parse(bodyText);
    return (json.models || [])
      .map((m) => (typeof m.name === 'string' ? m.name : ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } finally {
    clearTimeout(tid);
  }
}

/** Start tray/server if needed, then wait for HTTP API (Windows typical install paths). */
async function ensureOllamaUp(origin) {
  if (await ollamaReachable(origin)) return true;
  invalidateOllamaPingCache();
  tryStartOllamaServe();
  await sleep(2200);
  if (await ollamaReachable(origin)) return true;
  await sleep(1500);
  const up = await ollamaReachable(origin);
  if (!up) invalidateOllamaPingCache();
  return up;
}

async function ollamaChatOnce(origin, model, messages) {
  const url = `${origin}/api/chat`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: '15m',
        options: { num_ctx: 4096 },
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) return { ok: false, status: res.status, bodyText };
    const json = JSON.parse(bodyText);
    return {
      ok: true,
      text: json.message?.content ?? '',
      promptEval: json.prompt_eval_count,
      evalCount: json.eval_count,
    };
  } catch (e) {
    return { ok: false, status: 0, bodyText: String(e?.message || e || 'fetch failed') };
  } finally {
    clearTimeout(tid);
  }
}

jarvisIpc.register('ollama:probe', async (_e, payload) => {
  const origin = normalizeOllamaOrigin(payload.baseUrl);
  const exePath = findOllamaExe();
  const up = await ensureOllamaUp(origin);
  let models = [];
  if (up) {
    try {
      models = await ollamaListModelNames(origin);
    } catch {
      models = [];
    }
  }
  return {
    ok: up,
    exePath,
    models,
    hint: up
      ? ''
      : exePath
        ? 'Ollama is installed but the API did not answer. Open Ollama from the Start menu and wait for the tray icon, Boss.'
        : 'Ollama.exe was not found. Install from https://ollama.com/download then start the app, Boss.',
  };
});

jarvisIpc.register('ollama:listModels', async (_e, payload) => {
  const origin = normalizeOllamaOrigin(payload.baseUrl);
  const up = await ensureOllamaUp(origin);
  if (!up) {
    throw new Error(
      findOllamaExe()
        ? 'Ollama is installed but not responding. Start the Ollama app (system tray), Boss.'
        : 'Ollama was not found. Install from https://ollama.com/download , Boss.'
    );
  }
  const models = await ollamaListModelNames(origin);
  return { models };
});

jarvisIpc.register('ollama:chat', async (_e, payload) => {
  const origin = normalizeOllamaOrigin(payload.baseUrl);
  const wantModel = String(payload.model || '').trim();
  if (!wantModel) throw new Error('Missing Ollama model name');
  const messages = Array.isArray(payload.messages) ? payload.messages : [];

  const up = await ensureOllamaUp(origin);
  if (!up) {
    const exe = findOllamaExe();
    throw new Error(
      exe
        ? 'Ollama is installed but the API is not reachable. Open Ollama from the Start menu, wait for the tray icon, then try again, Boss.'
        : 'Cannot reach Ollama and ollama.exe was not found. Install from https://ollama.com/download , Boss.'
    );
  }

  let model = wantModel;
  let out = await ollamaChatOnce(origin, model, messages);
  if (!out.ok) {
    const err = formatOllamaHttpError(out.status, out.bodyText);
    const low = err.toLowerCase();
    if (low.includes('model') && low.includes('not found')) {
      let names = [];
      try {
        names = await ollamaListModelNames(origin);
      } catch {
        names = [];
      }
      if (names.length === 0) {
        throw new Error(`${err} — No models are installed. Open Ollama and pull a model, Boss.`);
      }
      const wantLow = wantModel.toLowerCase();
      const base = wantLow.split(':')[0];
      const match =
        names.find((n) => n.toLowerCase() === wantLow) ||
        names.find((n) => n.toLowerCase().startsWith(`${base}:`)) ||
        names.find((n) => n.toLowerCase().startsWith(base)) ||
        names[0];
      model = match;
      out = await ollamaChatOnce(origin, model, messages);
      if (out.ok && match.toLowerCase() !== wantLow) {
        const data = readDataSync();
        data.settings = data.settings || {};
        data.settings.ollamaModel = match;
        writeDataSync(data);
        emitJarvis('jarvis:data-changed');
      }
    }
  }
  if (!out.ok) {
    throw new Error(formatOllamaHttpError(out.status, out.bodyText));
  }
  return {
    text: out.text,
    promptEval: out.promptEval,
    evalCount: out.evalCount,
  };
});

jarvisIpc.register('apps:get', () => readAppsStoreSync());

jarvisIpc.register('apps:scan', async (_e, opts = {}) => {
  const old = readAppsStoreSync();
  const includeRegistry = opts?.full === true;
  const { normPath } = require('./scan-windows-apps');
  const iconById = new Map(
    (old.apps || []).filter((a) => a.iconPng).map((a) => [a.id, a.iconPng])
  );
  const iconByPath = new Map(
    (old.apps || []).filter((a) => a.iconPng && a.launchPath).map((a) => [normPath(a.launchPath), a.iconPng])
  );
  let lastBroadcast = 0;
  const scanned = await scanWindowsApps(app, {
    includeRegistry,
    iconConcurrency: 12,
    iconById,
    iconByPath,
    onChunk: (partialApps) => {
      const merged = mergeScanStats(partialApps, old);
      const now = Date.now();
      if (now - lastBroadcast > 500) {
        lastBroadcast = now;
        emitJarvis('apps:progress', {
          apps: merged,
          pinnedIds: old.pinnedIds || [],
          lastScan: old.lastScan || 0,
          partial: true,
        });
      }
    },
  });
  const merged = mergeScanStats(scanned, old);
  const validIds = new Set(merged.map((a) => a.id));
  const pinnedIds = (old.pinnedIds || []).filter((id) => validIds.has(id));
  const next = { version: 1, lastScan: Date.now(), apps: merged, pinnedIds };
  writeAppsStoreSync(next);
  emitJarvis('apps:progress', {
    apps: merged,
    pinnedIds,
    lastScan: next.lastScan,
    partial: false,
  });
  return next;
});

jarvisIpc.register('apps:launch', async (_e, launchPath) => {
  const p = String(launchPath || '').trim();
  if (!p) return { ok: false, error: 'missing path' };
  if (!isLaunchPathAllowed(p)) {
    return { ok: false, error: 'Launch path not allowed. Add the app via Apps or use the file picker.' };
  }
  if (p.toLowerCase().startsWith('uwp:')) {
    const appId = p.slice(4);
    if (appId) {
      const proc = spawn('explorer.exe', [`shell:AppsFolder\\${appId}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      proc.unref();
    }
  } else {
    await shell.openPath(p);
  }
  const store = readAppsStoreSync();
  const now = Date.now();
  const apps = (store.apps || []).map((a) => {
    if (String(a.launchPath).toLowerCase() === p.toLowerCase()) {
      return {
        ...a,
        launchCount: (a.launchCount || 0) + 1,
        lastLaunched: now,
      };
    }
    return a;
  });
  writeAppsStoreSync({ ...store, apps });

  const data = readDataSync();
  if (data.settings?.logActivity !== false) {
    const appEntry = apps.find((a) => String(a.launchPath).toLowerCase() === p.toLowerCase());
    const label = appEntry?.name || path.basename(p);
    const next = mergeDefaults(data);
    next.activityLog = [...(next.activityLog || [])];
    next.activityLog.unshift({
      id: crypto.randomUUID(),
      message: `Launched app "${label}"`,
      timestamp: now,
    });
    writeDataSync(next);
    emitJarvis('jarvis:data-changed');
  }
  return { ok: true };
});

jarvisIpc.register('apps:setPins', (_e, orderedIds) => {
  const ids = Array.isArray(orderedIds) ? orderedIds.filter((x) => typeof x === 'string') : [];
  const store = readAppsStoreSync();
  const valid = new Set((store.apps || []).map((a) => a.id));
  const nextPins = ids.filter((id) => valid.has(id)).slice(0, 12);
  writeAppsStoreSync({ ...store, pinnedIds: nextPins });
  return readAppsStoreSync();
});

jarvisIpc.register('apps:togglePin', (_e, appId) => {
  const store = readAppsStoreSync();
  const pins = [...(store.pinnedIds || [])];
  const i = pins.indexOf(appId);
  if (i >= 0) pins.splice(i, 1);
  else {
    if (pins.length >= 12) return { ok: false, error: 'full' };
    if (!(store.apps || []).some((a) => a.id === appId)) return { ok: false, error: 'missing' };
    pins.push(appId);
  }
  writeAppsStoreSync({ ...store, pinnedIds: pins });
  return { ok: true, store: readAppsStoreSync() };
});

jarvisIpc.register('apps:addToPreset', (_e, { presetId, launchPath }) => {
  const pid = String(presetId || '');
  const lp = String(launchPath || '').trim();
  if (!pid || !lp) return { ok: false };
  const data = readDataSync();
  const presets = [...(data.presets || [])];
  const idx = presets.findIndex((x) => x.id === pid);
  if (idx < 0) return { ok: false, error: 'preset' };
  const preset = { ...presets[idx] };
  const list = [...(preset.apps || [])];
  if (!list.some((a) => String(a).toLowerCase() === lp.toLowerCase())) list.push(lp);
  preset.apps = list;
  presets[idx] = preset;
  writeDataSync({ ...data, presets });
  emitJarvis('jarvis:data-changed');
  return { ok: true };
});

jarvisIpc.register('apps:pinDashboard', (_e, entry) => {
  if (!entry || !entry.path) return { ok: false };
  const data = readDataSync();
  const pins = [...(data.dashboardAppPins || [])];
  if (pins.length >= 12) return { ok: false, error: 'full' };
  const id = String(entry.id || entry.path);
  if (pins.some((x) => x.id === id)) return { ok: true };
  pins.push({
    id,
    name: String(entry.name || path.basename(entry.path)),
    path: String(entry.path),
    iconPng: entry.iconPng || '',
  });
  writeDataSync({ ...data, dashboardAppPins: pins });
  emitJarvis('jarvis:data-changed');
  return { ok: true };
});

jarvisIpc.register('apps:unpinDashboard', (_e, appId) => {
  const data = readDataSync();
  const pins = (data.dashboardAppPins || []).filter((x) => x.id !== appId);
  writeDataSync({ ...data, dashboardAppPins: pins });
  emitJarvis('jarvis:data-changed');
  return { ok: true };
});

jarvisIpc.register('system:stats', async () => collectStats());

jarvisIpc.register('system:aboutComputer', async () => collectAboutComputer());

const isWin = process.platform === 'win32';

/** Avoid overlapping stats work (multiple IPCs / panels). */
let statsCache = { at: 0, value: null };
const STATS_CACHE_MS = 5000;

function pickMainDisk(fsList) {
  if (!Array.isArray(fsList) || !fsList.length) return { used: 0, size: 1, use: 0 };
  const isCDrive = (d) => {
    const cap = String(d.mount || d.fs || '').trim().toUpperCase();
    return cap === 'C:' || cap === 'C:\\' || cap.startsWith('C:');
  };
  const c = fsList.find(isCDrive);
  if (c && c.size > 0) return c;
  const bigFixed = [...fsList]
    .filter((d) => (d.size || 0) > 40 * 1024 ** 3 && /ntfs|refs/i.test(String(d.type || '')))
    .sort((a, b) => (b.size || 0) - (a.size || 0));
  if (bigFixed[0]) return bigFixed[0];
  return fsList.reduce((best, d) => ((d.size || 0) > (best.size || 0) ? d : best), fsList[0]);
}

function cpuFromSiCurrentLoad(cpu) {
  if (cpu.cpus && cpu.cpus.length) {
    const sum = cpu.cpus.reduce((s, c) => s + (Number(c.load) || 0), 0);
    const avg = sum / cpu.cpus.length;
    if (Number.isFinite(avg)) return Math.min(100, Math.max(0, avg));
  }
  const v = Number(cpu.currentLoad);
  if (Number.isFinite(v)) return Math.min(100, Math.max(0, v));
  return 0;
}

/** One PowerShell per refresh (was two separate processes). */
async function windowsCpuRamCombo() {
  try {
    const cmd = [
      '$cpu = [math]::Round([double]((Get-CimInstance -ClassName Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average),1)',
      '$os = Get-CimInstance -ClassName Win32_OperatingSystem',
      '$total = [int64]$os.TotalVisibleMemorySize * 1024',
      '$avail = $null',
      '$m = Get-CimInstance -ClassName Win32_PerfFormattedData_PerfOS_Memory -ErrorAction SilentlyContinue',
      'if ($m) { $avail = [int64]$m.AvailableBytes }',
      'if (-not $avail -or $avail -lt 1) { $avail = [int64]$os.FreePhysicalMemory * 1024 }',
      '$used = $total - $avail',
      'Write-Output (($cpu.ToString()) + [string][char]9 + $total.ToString() + [char]9 + $used.ToString())',
    ].join('; ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 256 * 1024,
    });
    const line = String(stdout || '')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop();
    if (!line) return null;
    const [cpuS, totalS, usedS] = line.split('\t');
    const cpuPct = parseFloat(cpuS);
    const ramTotal = parseInt(totalS, 10);
    const ramUsed = parseInt(usedS, 10);
    if (!Number.isFinite(cpuPct) || !Number.isFinite(ramTotal) || ramTotal <= 0 || !Number.isFinite(ramUsed) || ramUsed < 0)
      return null;
    return {
      cpuPct: Math.min(100, Math.max(0, cpuPct)),
      ramTotal,
      ramUsed: Math.min(ramUsed, Math.round(ramTotal * 1.001)),
    };
  } catch {
    return null;
  }
}

async function collectStatsUncached() {
  const fsSize = await si.fsSize();
  const mainDisk = pickMainDisk(fsSize || []);
  const storageUsedPct = mainDisk.size ? (mainDisk.used / mainDisk.size) * 100 : 0;

  if (isWin) {
    const w = await windowsCpuRamCombo();
    if (w) {
      return {
        cpu: Math.round(w.cpuPct * 10) / 10,
        ramUsed: w.ramUsed,
        ramTotal: w.ramTotal,
        storageUsed: mainDisk.used,
        storageTotal: mainDisk.size,
        storageUsedPct: Math.min(100, Math.round(storageUsedPct * 10) / 10),
      };
    }
  }

  const [cpu, mem] = await Promise.all([si.currentLoad(), si.mem()]);
  let cpuPct = cpuFromSiCurrentLoad(cpu);
  let ramUsed = mem.used;
  let ramTotal = mem.total;
  return {
    cpu: Math.round(cpuPct * 10) / 10,
    ramUsed,
    ramTotal,
    storageUsed: mainDisk.used,
    storageTotal: mainDisk.size,
    storageUsedPct: Math.min(100, Math.round(storageUsedPct * 10) / 10),
  };
}

async function collectStats() {
  const now = Date.now();
  if (statsCache.value && now - statsCache.at < STATS_CACHE_MS) {
    return { ...statsCache.value };
  }
  const value = await collectStatsUncached();
  statsCache = { at: Date.now(), value };
  return { ...value };
}

jarvisIpc.register('system:statsText', async () => {
  const stats = await collectStats();
  const gb = (n) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  return (
    `CPU load is around ${stats.cpu}%. ` +
    `Memory in use: ${gb(stats.ramUsed)} of ${gb(stats.ramTotal)}. ` +
    `Primary volume storage is about ${stats.storageUsedPct}% used.`
  );
});

function fmtBytesLabel(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const gb = n / 1024 ** 3;
  if (gb >= 100) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(n / 1024 ** 2).toFixed(0)} MB`;
}

function fmtUptime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtCpuSpeed(cpu) {
  const ghz = Number(cpu?.speed);
  if (Number.isFinite(ghz) && ghz > 0) return `${ghz.toFixed(2)} GHz`;
  const mhz = Number(cpu?.speedMax || cpu?.speedMin);
  if (Number.isFinite(mhz) && mhz > 0) {
    if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
    return `${Math.round(mhz)} MHz`;
  }
  return null;
}

/** Best-effort NPU on Windows (PnP name match); no stable cross-vendor API. */
async function detectNpuWindows() {
  try {
    const cmd = [
      "$names = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |",
      "Where-Object { $_.Name -match 'NPU|Neural Processing Unit|Neural Engine|AI Boost|Ryzen AI|Intel.*AI Boost|Copilot\\+ PC|Qualcomm.*NPU|Hexagon|AMD IPU|Microsoft.*AI' } |",
      'Select-Object -ExpandProperty Name -Unique',
      'if ($names) { ($names | Select-Object -First 3) -join " | " }',
    ].join(' ');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      windowsHide: true,
      timeout: 6000,
      maxBuffer: 256 * 1024,
    });
    const name = String(stdout || '').trim();
    if (name) return { detected: true, name, detail: null };
    return { detected: false, name: null, detail: 'Not detected' };
  } catch {
    return { detected: false, name: null, detail: 'Not detected' };
  }
}

async function collectAboutComputer() {
  const [cpu, mem, memLayout, graphics, fsSize, osInfo, system, baseboard, time, npu] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.memLayout().catch(() => []),
    si.graphics().catch(() => ({ controllers: [] })),
    si.fsSize().catch(() => []),
    si.osInfo(),
    si.system().catch(() => ({})),
    si.baseboard().catch(() => ({})),
    si.time(),
    isWin ? detectNpuWindows() : Promise.resolve({ detected: false, name: null, detail: 'NPU detection is Windows-only.' }),
  ]);

  const memTypes = [
    ...new Set(
      (Array.isArray(memLayout) ? memLayout : [])
        .map((s) => String(s.type || '').trim())
        .filter((t) => t && t !== 'Unknown')
    ),
  ];
  const slotSummary =
    Array.isArray(memLayout) && memLayout.length
      ? `${memLayout.filter((s) => (s.size || 0) > 0).length} module(s)`
      : null;

  const controllers = Array.isArray(graphics?.controllers) ? graphics.controllers : [];
  const gpus = controllers
    .map((c) => {
      const model = String(c.model || c.name || '').trim() || 'Unknown GPU';
      let vram = null;
      const v = Number(c.vram);
      if (Number.isFinite(v) && v > 0) {
        vram = fmtBytesLabel(v * 1024 ** 2);
      } else if (c.vramDynamic) {
        vram = 'Shared';
      }
      const driver = String(c.driverVersion || '').trim() || null;
      return { model, vram, driver };
    })
    .filter((g, i, arr) => arr.findIndex((x) => x.model === g.model) === i);

  const volumes = (Array.isArray(fsSize) ? fsSize : [])
    .filter((d) => (d.size || 0) > 0)
    .sort((a, b) => {
      const ma = String(a.mount || '').toUpperCase();
      const mb = String(b.mount || '').toUpperCase();
      if (ma.startsWith('C:')) return -1;
      if (mb.startsWith('C:')) return 1;
      return (b.size || 0) - (a.size || 0);
    })
    .map((d) => ({
      mount: String(d.mount || d.fs || '—'),
      fs: String(d.fs || '—'),
      type: String(d.type || '—'),
      size: fmtBytesLabel(d.size),
      used: fmtBytesLabel(d.used),
      usePct: d.size ? Math.min(100, Math.round(((d.used || 0) / d.size) * 1000) / 10) : 0,
    }));

  const distro = String(osInfo.distro || osInfo.platform || process.platform).trim();
  const release = String(osInfo.release || osInfo.kernel || '').trim();
  const build = String(osInfo.build || osInfo.codename || '').trim();
  const arch = String(osInfo.arch || os.arch()).trim();

  return {
    preview: false,
    hostname: String(osInfo.hostname || os.hostname()).trim() || '—',
    os: {
      platform: String(osInfo.platform || process.platform),
      distro,
      release,
      build,
      arch,
      uptime: fmtUptime(osInfo.uptime ?? time?.uptime),
    },
    system: {
      manufacturer: String(system.manufacturer || '—').trim() || '—',
      model: String(system.model || '—').trim() || '—',
      sku: String(system.sku || '').trim() || null,
    },
    baseboard: {
      manufacturer: String(baseboard.manufacturer || '—').trim() || '—',
      model: String(baseboard.model || '—').trim() || '—',
      version: String(baseboard.version || '').trim() || null,
    },
    cpu: {
      brand: String(cpu.brand || cpu.manufacturer || 'Unknown CPU').trim(),
      cores: Number(cpu.cores) || 0,
      physicalCores: Number(cpu.physicalCores) || 0,
      speed: fmtCpuSpeed(cpu),
    },
    gpus: gpus.length ? gpus : [{ model: 'No GPU detected', vram: null, driver: null }],
    ram: {
      total: fmtBytesLabel(mem.total),
      type: memTypes.length ? memTypes.join(', ') : null,
      slots: slotSummary,
    },
    npu,
    storage: volumes.length ? volumes : [{ mount: '—', fs: '—', type: '—', size: '—', used: '—', usePct: 0 }],
  };
}

jarvisIpc.register('window:setOpacity', (_e, opacity) => {
  if (mainWindow && typeof opacity === 'number') {
    mainWindow.setOpacity(Math.min(1, Math.max(0.6, opacity)));
  }
});

jarvisIpc.register('window:setFullscreen', (_e, enabled) => {
  if (mainWindow) {
    mainWindow.setFullScreen(!!enabled);
    if (!enabled) {
      mainWindow.setBounds({ width: 900, height: 620 });
      if (mainWindow.isVisible()) mainWindow.center();
    }
  }
});

jarvisIpc.register('window:hide', () => {
  if (mainWindow) mainWindow.hide();
});

jarvisIpc.register('hotkey:set', (_e, accelerator) => {
  const requested = (accelerator && String(accelerator).trim()) || 'Control+Shift+Space';
  const registered = registerHotkeys(requested);
  const effective = registered != null ? registered : requested;
  const data = readDataSync();
  data.settings = data.settings || {};
  data.settings.mainHotkey = effective;
  writeDataSync(data);
  emitJarvis('jarvis:data-changed');
  return true;
});

jarvisIpc.register('screen:capturePrimary', async () => jarvisFeatures.capturePrimaryDisplay(mainWindow));

jarvisIpc.register('files:readForChat', async (_e, absPath) => {
  if (!isChatPathAllowed(absPath)) {
    return { ok: false, error: 'Path not allowed. Pick a file using the attachment button.' };
  }
  return jarvisFeatures.readChatFile(absPath);
});

jarvisIpc.register('files:imageDataUrl', async (_e, absPath) => jarvisFeatures.readImageDataUrl(absPath));

jarvisIpc.register('suggestions:current', async () => jarvisFeatures.getSuggestionsNow(dataFilePath()));

jarvisIpc.register('network:speed', async () => jarvisFeatures.networkSpeedMbps());

jarvisIpc.register('network:ping', async () => ({ ms: await jarvisFeatures.pingMs() }));

jarvisIpc.register('processes:list', async () => jarvisFeatures.listProcessesTop());

jarvisIpc.register('search:unified', async (_e, query) => {
  const apps = readAppsStoreSync();
  const data = readDataSync();
  return unifiedSearch.unifiedSearch(query, { appsStore: apps, jarvisData: data, limit: 4 });
});

jarvisIpc.register('dashboard:extras', async () => {
  const [battery, dnd] = await Promise.all([
    dashboardExtras.getBatteryStatus(),
    dashboardExtras.getDndEnabled(),
  ]);
  return { version: app.getVersion(), battery, dnd };
});

jarvisIpc.register('weather:fetch', async (_e, city) => dashboardExtras.fetchWeather(city));
jarvisIpc.register('weather:searchCities', async (_e, query) => dashboardExtras.searchCities(query));
jarvisIpc.register('weather:detectLocation', async () => dashboardExtras.detectLocation());

jarvisIpc.register('system:toggleDnd', async () => {
  const on = sysWin.isDndJarvisActive();
  if (on) await sysWin.restoreDoNotDisturbLite();
  else await sysWin.enableDoNotDisturbLite();
  const data = readDataSync();
  const next = mergeDefaults(data);
  next.settings = { ...next.settings, jarvisDnd: !on };
  writeDataSync(next);
  emitJarvis('jarvis:data-changed');
  return { enabled: !on };
});

jarvisIpc.register('system:getVolume', async () => {
  try {
    const percent = await sysWin.getMasterVolumePercent();
    return { ok: true, percent: percent ?? 50 };
  } catch (e) {
    return { ok: false, percent: null, error: String(e?.message || e) };
  }
});

jarvisIpc.register('system:setVolume', async (_e, percent) => {
  try {
    const { parseVolumePercent } = require('./volume-parse');
    const p = parseVolumePercent(percent);
    if (p == null) {
      return { ok: false, error: 'Invalid volume. Use a number from 0 to 100.' };
    }
    await sysWin.setMasterVolumePercent(p);
    emitJarvis('jarvis:data-changed');
    return { ok: true, percent: p };
  } catch (e) {
    console.error('[Jarvis] setVolume failed', e);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

jarvisIpc.register('search:open', async (_e, item) => {
  if (!item || !item.type) return { ok: false, error: 'invalid' };
  try {
    if (item.type === 'app') {
      const p = String(item.launchPath || '').trim();
      if (!p) return { ok: false, error: 'missing path' };
      if (!isLaunchPathAllowed(p)) {
        return { ok: false, error: 'Launch path not allowed' };
      }
      await shell.openPath(p);
      return { ok: true };
    }
    if (item.type === 'preset' && item.preset) {
      await jarvisFeatures.endPresetSession(sysWin);
      await launchPresetInternal(item.preset, readDataSync());
      const data = readDataSync();
      const next = mergeDefaults(data);
      next.activePresetId = item.preset.id;
      writeDataSync(next);
      emitJarvis('jarvis:data-changed');
      return { ok: true };
    }
    if (item.type === 'start' && item.appId) {
      await execFileAsync('explorer.exe', [`shell:AppsFolder\\${item.appId}`], { windowsHide: true });
      return { ok: true };
    }
    if ((item.type === 'link' || item.type === 'web') && item.url) {
      const u = /^https?:\/\//i.test(item.url) ? item.url : `https://${item.url}`;
      await shell.openExternal(u);
      return { ok: true };
    }
    return { ok: false, error: 'unknown type' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

jarvisIpc.register('processes:kill', async (_e, pid, name) => {
  const n = String(name || '').toLowerCase().replace(/\.exe$/i, '');
  if (jarvisFeatures.KILL_BLOCK.has(n)) return { ok: false, error: 'blocked' };
  try {
    await jarvisFeatures.killProcess(pid);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

jarvisIpc.register('usage:get', async () => jarvisFeatures.readUsage(dataFilePath()));

jarvisIpc.register('usage:clear', async () => {
  try {
    fs.writeFileSync(jarvisFeatures.usagePath(dataFilePath()), JSON.stringify({ version: 1, days: {} }, null, 2));
    return true;
  } catch {
    return false;
  }
});

jarvisIpc.register('patterns:clear', async () => {
  try {
    fs.writeFileSync(
      jarvisFeatures.extraJsonPath(dataFilePath(), 'patterns.json'),
      JSON.stringify({ version: 1, patterns: [], sequences: [] }, null, 2)
    );
    fs.writeFileSync(
      jarvisFeatures.extraJsonPath(dataFilePath(), 'preset-activity.json'),
      JSON.stringify({ version: 1, launches: [] }, null, 2)
    );
    return true;
  } catch {
    return false;
  }
});

jarvisIpc.register('network:flushDns', async () => jarvisFeatures.flushDnsWindows());

jarvisIpc.register('network:tcp', async () => jarvisFeatures.listNetTcpSnapshot());

jarvisIpc.register('notify:suggestion', async (_e, { title, body } = {}) => {
  const t = String(title || 'JARVIS').slice(0, 120);
  const b = String(body || '').slice(0, 240);
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const visible = mainWindow.isVisible();
  const focused = mainWindow.isFocused();
  if (visible && focused) return false;
  if (!Notification.isSupported()) return false;
  try {
    const n = new Notification({ title: t, body: b });
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        emitJarvis('jarvis:focus-suggestion');
      }
    });
    n.show();
    return true;
  } catch {
    return false;
  }
});

jarvisIpc.register('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && (url.startsWith('http') || url.startsWith('mailto:'))) {
    shell.openExternal(url);
  }
});

/** Download + launch Ollama installer for first-launch setup wizard. */
jarvisIpc.register('ollama:downloadInstaller', async () => {
  const exePath = findOllamaExe();
  if (exePath) return { ok: true, alreadyInstalled: true, exePath };
  const url = 'https://ollama.com/download/OllamaSetup.exe';
  const dest = path.join(app.getPath('temp'), 'OllamaSetup.exe');
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 120000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    const proc = spawn(dest, [], { detached: true, stdio: 'ignore', windowsHide: false });
    proc.unref();
    return { ok: true, alreadyInstalled: false };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

jarvisIpc.register('shell:showItemInFolder', (_e, fullPath) => {
  const p = String(fullPath || '').trim();
  if (!p) return false;
  try {
    shell.showItemInFolder(p);
    return true;
  } catch {
    return false;
  }
});

jarvisIpc.register('dialog:pickExe', async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Executable', extensions: ['exe'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const picked = r.filePaths[0];
  trackedExePaths.add(path.resolve(picked).toLowerCase());
  return picked;
});

jarvisIpc.register('dialog:pickImage', async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return r.filePaths[0];
});

jarvisIpc.register('dialog:pickChatFile', async () => {
  if (!mainWindow) return null;
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'Chat files',
        extensions: ['pdf', 'txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'json', 'csv'],
      },
    ],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const picked = r.filePaths[0];
  registerAllowedChatPath(picked);
  return picked;
});

jarvisIpc.register('preset:launch', async (_e, preset) => {
  const data = readDataSync();
  await launchPresetInternal(preset, data);
  if (preset?.id) {
    const next = mergeDefaults(data);
    next.activePresetId = preset.id;
    writeDataSync(next);
    emitJarvis('jarvis:data-changed');
  }
  if (data.settings?.smartSuggestionsEnabled !== false && preset?.name) {
    try {
      jarvisFeatures.appendPresetLaunch(dataFilePath(), preset.name);
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
});

jarvisIpc.register('calendar:saveCredentials', (_e, creds) => {
  const saved = googleCalendar.writeCredentials(creds || {});
  const connected = googleCalendar.hasCredentials(saved);
  try {
    const data = readDataSync();
    const next = mergeDefaults(data);
    next.settings = { ...next.settings, googleCalendarConnected: connected };
    writeDataSync(next);
    emitJarvis('jarvis:data-changed');
  } catch {
    /* ignore */
  }
  return { ok: true, connected };
});

jarvisIpc.register('calendar:removeCredentials', () => {
  googleCalendar.removeCredentials();
  try {
    const data = readDataSync();
    const next = mergeDefaults(data);
    next.settings = { ...next.settings, googleCalendarConnected: false };
    writeDataSync(next);
    emitJarvis('jarvis:data-changed');
  } catch {
    /* ignore */
  }
  return { ok: true };
});

jarvisIpc.register('calendar:testConnection', async (_e, creds) => {
  if (creds && typeof creds === 'object') {
    return googleCalendar.testConnection(creds);
  }
  return googleCalendar.testConnection();
});

jarvisIpc.register('calendar:fetchEvents', async (_e, opts) => {
  return googleCalendar.fetchEvents(opts || {});
});

jarvisIpc.register('calendar:getStatus', () => googleCalendar.getStatus());

jarvisIpc.register('speech:getStatus', () => ({
  configured: Boolean(String(process.env.GOOGLE_API_KEY || '').trim()),
}));

jarvisIpc.register('speech:saveKey', (_e, key) => {
  const trimmed = String(key || '').trim();
  if (!trimmed) return { ok: false, error: 'Key is empty.' };
  try {
    const userDir = app.getPath('userData');
    fs.mkdirSync(userDir, { recursive: true });
    const keyPath = path.join(userDir, 'GOOGLE_API_KEY.txt');
    fs.writeFileSync(keyPath, `${trimmed}\n`, 'utf8');
    process.env.GOOGLE_API_KEY = trimmed;
    console.log('[Jarvis] GOOGLE_API_KEY saved to userData (restart recommended for wake word).');
    return { ok: true, needRestart: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

jarvisIpc.register('speech:openUserDataFolder', async () => {
  try {
    const userDir = app.getPath('userData');
    fs.mkdirSync(userDir, { recursive: true });
    await shell.openPath(userDir);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

async function executeLiveTool(name, args) {
  const data = readDataSync();
  const a = args || {};

  if (name === 'open_app') {
    const raw = String(a.app_name || '').trim();
    if (!raw) return 'No app name provided.';
    const store = readAppsStoreSync();
    let hit = await resolveAppLaunch(raw, store);
    if (!hit && !(store.apps || []).length) {
      try {
        await jarvisIpc.invoke('apps:scan', null, [{ full: true }]);
      } catch {
        /* scan optional */
      }
      hit = await resolveAppLaunch(raw, readAppsStoreSync());
    }
    if (!hit?.launchPath) {
      return `Could not find "${raw}" on this PC. Open the Apps page and run Rescan, or say the exact name from Start Menu.`;
    }
    const r = await jarvisIpc.invoke('apps:launch', null, [hit.launchPath]);
    return r?.ok ? `Opened ${hit.name}.` : String(r?.error || 'Launch failed');
  }

  if (name === 'web_search') {
    const query = encodeURIComponent(String(a.query || '').trim());
    if (!query) return 'Empty query.';
    await shell.openExternal(`https://www.google.com/search?q=${query}`);
    return `Searching the web for ${a.query}.`;
  }

  if (name === 'weather_report') {
    const city = String(a.city || data.settings?.weatherCity || 'London').trim();
    const w = await dashboardExtras.fetchWeather(city);
    if (!w?.ok) return String(w?.error || 'Weather unavailable');
    return `${w.city}: ${w.tempC}°C, ${w.description}.`;
  }

  if (name === 'open_panel') {
    const panel = String(a.panel || 'dashboard').toLowerCase();
    emitJarvis('jarvis:navigate', panel);
    return `Opened ${panel} panel.`;
  }

  if (name === 'launch_preset') {
    const presetName = String(a.preset_name || '').trim().toLowerCase();
    const preset = (data.presets || []).find((p) => String(p.name || '').toLowerCase() === presetName);
    if (!preset) return `Preset "${a.preset_name}" not found.`;
    await jarvisFeatures.endPresetSession(sysWin);
    await launchPresetInternal(preset, data);
    const next = mergeDefaults(readDataSync());
    next.activePresetId = preset.id;
    writeDataSync(next);
    emitJarvis('jarvis:data-changed');
    return `Launched preset ${preset.name}.`;
  }

  if (name === 'set_volume') {
    const { parseVolumeFromToolArgs } = require('./volume-parse');
    const pct = parseVolumeFromToolArgs(a);
    if (pct == null) {
      return 'Could not understand the volume level. Ask the user for a number from 0 to 100 (for example 30 for thirty percent).';
    }
    const r = await jarvisIpc.invoke('system:setVolume', null, [pct]);
    return r?.ok ? `Volume set to ${r.percent ?? pct}%.` : String(r?.error || 'Volume change failed');
  }

  if (name === 'get_volume') {
    const v = await sysWin.getMasterVolumePercent();
    return v != null ? `Current volume is ${v}%.` : 'Could not read current volume.';
  }

  return `Unknown tool: ${name}`;
}

function ensureGeminiLiveHost() {
  if (!geminiLiveHost) {
    geminiLiveHost = createGeminiLiveHost({
      getMainWindow: () => mainWindow,
      getUserDataPath: () => app.getPath('userData'),
      readDataSync,
      writeDataSync,
      emitJarvis,
      executeLiveTool,
    });
  }
  return geminiLiveHost;
}

jarvisIpc.register('live:start', async () => {
  const host = ensureGeminiLiveHost();
  return host.start();
});

jarvisIpc.register('live:stop', async () => {
  if (!geminiLiveHost) return { ok: true };
  return geminiLiveHost.stop();
});

jarvisIpc.register('live:status', async () => ensureGeminiLiveHost().status());

jarvisIpc.register('live:setMuted', (_e, muted) => ensureGeminiLiveHost().setMuted(muted));

jarvisIpc.register('live:sendText', (_e, text) => ensureGeminiLiveHost().sendText(text));

jarvisIpc.register('live:pushAudio', (_e, payload) => {
  let buf;
  if (payload instanceof Uint8Array) buf = Buffer.from(payload);
  else if (Array.isArray(payload)) buf = Buffer.from(payload);
  else if (payload?.buffer) buf = Buffer.from(payload.buffer);
  else buf = Buffer.from(payload || []);
  ensureGeminiLiveHost().pushAudio(buf);
  return { ok: true };
});

jarvisIpc.register('live:playbackStarted', () => {
  ensureGeminiLiveHost().playbackStarted();
  return { ok: true };
});

jarvisIpc.register('live:playbackEnded', () => {
  ensureGeminiLiveHost().playbackEnded();
  return { ok: true };
});

jarvisIpc.register('gemini:saveApiKey', (_e, key) => ensureGeminiLiveHost().saveApiKey(key));

jarvisIpc.register('gemini:testApiKey', async (_e, key) => ensureGeminiLiveHost().testApiKey(key));

/** Wipe local JARVIS data and show setup wizard again (restart recommended). */
jarvisIpc.register('app:resetUserData', () => {
  const userDir = app.getPath('userData');
  const toRemove = [
    'GOOGLE_API_KEY.txt',
    'google-calendar.json',
    'presets.json',
    'apps.json',
    'usage.json',
    'preset-activity.json',
    'patterns.json',
  ];
  for (const fileName of toRemove) {
    try {
      const p = path.join(userDir, fileName);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {
      console.warn('[Jarvis] reset could not remove', fileName, e && e.message ? e.message : e);
    }
  }
  try {
    googleCalendar.removeCredentials();
  } catch {
    /* ignore */
  }
  delete process.env.GOOGLE_API_KEY;
  try {
    writeDataSync({ ...DEFAULT_DATA, settings: { ...DEFAULT_DATA.settings, setupComplete: false } });
    emitJarvis('jarvis:data-changed');
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
  return { ok: true, needRestart: true, userDataPath: userDir };
});

jarvisIpc.register('preset:restoreSystem', async () => {
  try {
    const { killed } = await jarvisFeatures.endPresetSession(sysWin);
    const snap = readDataSync();
    const merged = mergeDefaults(snap);
    if (merged.settings?.jarvisDnd) {
      merged.settings = { ...merged.settings, jarvisDnd: false };
      writeDataSync(merged);
      emitJarvis('jarvis:data-changed');
    }
    return { ok: true, killed };
  } catch (e) {
    console.error(e);
    return { ok: false, killed: 0 };
  }
});

jarvisIpc.register('startup:set', (_e, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath,
      args: isDev ? [path.join(__dirname, '..')] : [],
    });
  } catch (e) {
    console.error(e);
  }
  return true;
});

jarvisIpc.register('actions:execute', async (_e, action) => {
  const data = readDataSync();
  const type = action && action.type;
  if (type === 'close_preset') {
    await jarvisFeatures.endPresetSession(sysWin);
    const next = mergeDefaults(data);
    next.activePresetId = null;
    if (next.settings.logActivity !== false) {
      next.activityLog = [...(next.activityLog || [])];
      next.activityLog.unshift({
        id: crypto.randomUUID(),
        message: `Closed preset${action.name ? ` "${action.name}"` : ''}`,
        timestamp: Date.now(),
      });
    }
    writeDataSync(next);
    emitJarvis('jarvis:data-changed');
    return { ok: true };
  }
  if (type === 'open_preset') {
    const name = (action.name || '').trim().toLowerCase();
    const preset = (data.presets || []).find((p) => (p.name || '').trim().toLowerCase() === name);
    if (!preset) return { ok: false, error: 'Preset not found' };
    await jarvisFeatures.endPresetSession(sysWin);
    await launchPresetInternal(preset, data);
    const next = mergeDefaults(data);
    next.activePresetId = preset.id;
    if (next.settings.logActivity !== false) {
      next.activityLog = [...(next.activityLog || [])];
      next.activityLog.unshift({
        id: crypto.randomUUID(),
        message: `Opened preset "${preset.name}" (AI)`,
        timestamp: Date.now(),
      });
    }
    if (next.settings.smartSuggestionsEnabled !== false) {
      try {
        jarvisFeatures.appendPresetLaunch(dataFilePath(), preset.name);
      } catch {
        /* ignore */
      }
    }
    writeDataSync(next);
    emitJarvis('jarvis:data-changed');
    return { ok: true };
  }
  if (type === 'search_web') {
    const q = encodeURIComponent(action.query || '');
    const engine = (action.engine || 'google').toLowerCase();
    let url = `https://google.com/search?q=${q}`;
    if (engine === 'youtube') url = `https://youtube.com/search?q=${q}`;
    else if (engine === 'github') url = `https://github.com/search?q=${q}`;
    else if (engine === 'reddit') url = `https://reddit.com/search?q=${q}`;
    await shell.openExternal(url);
    return { ok: true };
  }
  if (type === 'get_system_stats') {
    const stats = await collectStats();
    const gb = (n) => `${(n / 1024 ** 3).toFixed(1)} GB`;
    const text =
      `CPU load is around ${stats.cpu}%. ` +
      `Memory in use: ${gb(stats.ramUsed)} of ${gb(stats.ramTotal)}. ` +
      `Primary volume storage is about ${stats.storageUsedPct}% used.`;
    return { ok: true, statsText: text };
  }
  return { ok: false, error: 'Unknown action' };
});

app.whenReady().then(async () => {
  try {
  nativeTheme.themeSource = 'dark';

  /** Enable speech recognition in Electron by allowing the Google speech service origin. */
  const defaultSes = session.defaultSession;
  defaultSes.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'mediaCaptureDevices'];
    callback(allowed.includes(permission));
  });
  defaultSes.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'mediaCaptureDevices'];
    return allowed.includes(permission);
  });

  migratePersistentUserData();
  ensureDataFile();
  ensureAppsFile();

  const bootData = readDataSync();
  if (bootData.settings?.jarvisDnd) {
    try {
      await sysWin.enableDoNotDisturbLite();
    } catch (e) {
      console.error('[Jarvis] restore DND on boot failed', e);
    }
  }

  /* Desktop-only build: skip local web UI server for faster startup. */

  createWindow();
  startJarvisFocusServer();
  const data = readDataSync();
  const requested = (data.settings && data.settings.mainHotkey) || 'Control+Shift+Space';
  const registered = registerHotkeys(requested);
  if (registered != null && registered !== requested) {
    data.settings = data.settings || {};
    data.settings.mainHotkey = registered;
    writeDataSync(data);
    emitJarvis('jarvis:data-changed');
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(data.settings && data.settings.startupWithWindows),
      path: process.execPath,
      args: isDev ? [path.join(__dirname, '..')] : [],
    });
  } catch (_) {
    /* ignore */
  }

  createJarvisTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  } catch (e) {
    console.error('[Jarvis] Startup failed:', e);
    dialog.showErrorBox('JARVIS startup error', String(e?.message || e));
  }

  /** Foreground app usage — poll every 20s (PowerShell); attribute elapsed time to previous foreground process. */
  const usagePoll = { lastAt: Date.now(), foregroundName: null };
  setInterval(async () => {
    try {
      const data = readDataSync();
      if (data.settings?.usageTrackingEnabled === false) return;
      const now = Date.now();
      const dt = Math.min(3600, Math.max(0, (now - usagePoll.lastAt) / 1000));
      usagePoll.lastAt = now;
      const name = (await jarvisFeatures.getForegroundProcessName()) || '';
      const label = name.trim() || 'Unknown';
      if (usagePoll.foregroundName && dt > 0.2) {
        jarvisFeatures.bumpUsageSeconds(dataFilePath(), usagePoll.foregroundName, dt);
      }
      usagePoll.foregroundName = label;
    } catch {
      /* ignore */
    }
  }, 20000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyJarvisTray();
  if (webUiServer) {
    try {
      void webUiServer.close();
    } catch {
      /* */
    }
    webUiServer = null;
    webUiPush = () => {};
  }
  if (focusServer) {
    try {
      focusServer.close();
    } catch {
      /* ignore */
    }
    focusServer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
