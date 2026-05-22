import { createHttpJarvis, getJarvisWebSession } from '@/jarvis-http-jarvis.js';

/** Must match `JARVIS_FOCUS_PORT` in `electron/main.js`. */
const JARVIS_FOCUS_PORT = 47842;

/** Default store shape (kept in sync with `data/presets.json` + main merge). */
export const JARVIS_DEFAULT_DATA = {
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
    userName: '',
    setupComplete: false,
    theme: 'arc-reactor',
    colorMode: 'dark',
    geminiApiKey: '',
    voiceMode: 'live',
    googleCalendarConnected: false,
    micPermissionAsked: false,
    voiceWakeUnavailable: null,
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
  /** Saved AI threads: { id, title, updatedAt, messages } */
  aiChatHistory: [],
};

const idleStats = {
  cpu: 0,
  ramUsed: 0,
  ramTotal: 1,
  storageUsed: 0,
  storageTotal: 1,
  storageUsedPct: 0,
};

function mergeData(patch) {
  return {
    ...JARVIS_DEFAULT_DATA,
    ...patch,
    settings: { ...JARVIS_DEFAULT_DATA.settings, ...(patch.settings || {}) },
    presets: Array.isArray(patch.presets) ? patch.presets : JARVIS_DEFAULT_DATA.presets,
    pinnedLinks: Array.isArray(patch.pinnedLinks) ? patch.pinnedLinks : JARVIS_DEFAULT_DATA.pinnedLinks,
    activityLog: Array.isArray(patch.activityLog) ? patch.activityLog : JARVIS_DEFAULT_DATA.activityLog,
    dashboardAppPins: Array.isArray(patch.dashboardAppPins)
      ? patch.dashboardAppPins
      : JARVIS_DEFAULT_DATA.dashboardAppPins,
    aiChatHistory: Array.isArray(patch.aiChatHistory) ? patch.aiChatHistory : JARVIS_DEFAULT_DATA.aiChatHistory,
    todos: Array.isArray(patch.todos) ? patch.todos : JARVIS_DEFAULT_DATA.todos,
  };
}

function createBrowserJarvis() {
  let store = mergeData(structuredClone(JARVIS_DEFAULT_DATA));
  const listeners = new Set();

  const notify = () => {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  };

  return {
    readData: async () => structuredClone(store),
    writeData: async (data) => {
      store = mergeData(structuredClone(data));
      notify();
      return true;
    },
    getSystemStats: async () => ({ ...idleStats }),
    getSystemStatsText: async () =>
      'Offline mode — start the JARVIS desktop app on this PC for live stats, Boss.',
    getAboutComputer: async () => ({
      preview: true,
      hostname: 'DESKTOP-PREVIEW',
      os: {
        platform: 'win32',
        distro: 'Windows 11',
        release: '10.0.26200',
        build: 'Preview',
        arch: 'x64',
        uptime: '—',
      },
      system: { manufacturer: 'Demo', model: 'JARVIS (offline)', sku: null },
      baseboard: { manufacturer: '—', model: '—', version: null },
      cpu: { brand: 'Preview CPU (8 cores)', cores: 8, physicalCores: 4, speed: '3.20 GHz' },
      gpus: [{ model: 'Preview GPU', vram: '8.0 GB', driver: null }],
      ram: { total: '16.0 GB', type: 'DDR5', slots: '2 module(s)' },
      npu: { detected: false, name: null, detail: 'Offline mode — start the desktop app for live hardware info.' },
      storage: [
        { mount: 'C:', fs: 'NTFS', type: 'SSD', size: '512.0 GB', used: '210.0 GB', usePct: 41 },
      ],
    }),
    setWindowOpacity: async () => {},
    setFullScreen: async () => {},
    hideWindow: async () => {},
    setMainHotkey: async () => true,
    openExternal: async (url) => {
      if (typeof url === 'string' && url) window.open(url, '_blank', 'noopener,noreferrer');
    },
    pickExe: async () => null,
    pickImage: async () => null,
    launchPreset: async () => ({ ok: true }),
    restorePresetSystem: async () => true,
    setStartup: async () => true,
    executeAction: async () => ({ ok: false, error: 'Run inside Electron for system actions, Boss.' }),
    ollamaChat: async () => ({
      text: 'Offline mode — Ollama needs the JARVIS desktop app running on this PC, Boss.',
      promptEval: 0,
      evalCount: 0,
    }),
    listOllamaModels: async () => ({ models: [] }),
    ollamaProbe: async () => ({
      ok: false,
      exePath: null,
      models: [],
      hint: 'Offline mode — start the desktop app for Ollama, Boss.',
    }),
    getAppsStore: async () => ({
      version: 1,
      lastScan: 0,
      apps: [
        {
          id: 'demo-1',
          name: 'Demo App (browser)',
          launchPath: 'C:\\Windows\\notepad.exe',
          iconPng: '',
          launchCount: 0,
          lastLaunched: null,
        },
      ],
      pinnedIds: [],
    }),
    scanApps: async () => ({
      version: 1,
      lastScan: Date.now(),
      apps: [
        {
          id: 'demo-1',
          name: 'Demo App (browser)',
          launchPath: 'C:\\Windows\\notepad.exe',
          iconPng: '',
          launchCount: 0,
          lastLaunched: null,
        },
      ],
      pinnedIds: [],
    }),
    launchAppPath: async () => ({ ok: true }),
    setAppPins: async (ids) => ({ version: 1, apps: [], pinnedIds: ids || [] }),
    toggleAppPin: async () => ({ ok: true, store: { version: 1, apps: [], pinnedIds: [] } }),
    addAppToPreset: async () => ({ ok: true }),
    pinAppToDashboard: async () => ({ ok: true }),
    unpinDashboardApp: async () => ({ ok: true }),
    showItemInFolder: async () => true,
    onAppsProgress: () => () => {},
    onNavigate: () => () => {},
    onWindowShown: () => () => {},
    onWindowHidden: () => () => {},
    onDataChanged: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    unifiedSearch: async (query) => {
      const q = String(query || '').toLowerCase();
      const hits = [
        { id: 'demo:calc', type: 'start', label: 'Calculator', sub: 'Windows app (demo)' },
        { id: 'demo:web', type: 'web', label: `Search the web for “${query}”`, sub: 'Google', url: `https://google.com/search?q=${encodeURIComponent(query)}` },
      ].filter((h) => !q || h.label.toLowerCase().includes(q));
      return hits.slice(0, 4);
    },
    openSearchResult: async () => ({ ok: true }),
    getDashboardExtras: async () => ({
      version: '1.0.0',
      battery: { percent: 87, charging: false },
      dnd: false,
    }),
    fetchWeather: async () => ({ ok: true, city: 'London', tempC: 14, description: 'Partly cloudy' }),
    searchWeatherCities: async (query) => ({
      ok: true,
      results: query
        ? [{ city: String(query), label: `${query} (demo)`, latitude: 51.5, longitude: -0.12 }]
        : [],
    }),
    detectWeatherLocation: async () => ({
      ok: true,
      city: 'London',
      label: 'London, England, United Kingdom',
      source: 'ip',
    }),
    toggleDnd: async () => ({ enabled: true }),
    setSystemVolume: async () => ({ ok: true }),
    getSuggestion: async () => null,
    getUsage: async () => ({ version: 1, days: {} }),
    listProcesses: async () => ({
      processes: [
        { name: 'DemoProcess', pid: 1000, cpu: 12.4, ram: 128 },
        { name: 'BrowserStub', pid: 1001, cpu: 3.1, ram: 64 },
      ],
      totalCount: 142,
    }),
    killProcess: async () => ({ ok: true }),
    downloadOllamaInstaller: async () => ({ ok: false, error: 'Start the desktop app for Ollama setup.' }),
    getRuntimeInfo: async () => ({
      isElectron: false,
      isDev: true,
      devUrl: 'http://127.0.0.1:5173',
      devFocusPort: JARVIS_FOCUS_PORT,
      focusPort: JARVIS_FOCUS_PORT,
      webVersionSupported: true,
      browserPreviewSupported: true,
      speechKeyConfigured: false,
      userDataPath: '',
    }),
    openInBrowser: async () => ({ ok: false, error: 'You are already in the web version.' }),
    switchToDesktopApp: async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${JARVIS_FOCUS_PORT}/focus`, {
          method: 'GET',
          signal: AbortSignal.timeout(2500),
        });
        if (r.ok) return { ok: true };
        return { ok: false, error: 'Desktop app did not respond as expected.' };
      } catch {
        return {
          ok: false,
          error:
            'Could not reach the desktop app. Start JARVIS on this PC, keep it running, then try again.',
        };
      }
    },
    calendarSaveCredentials: async () => ({ ok: false, connected: false }),
    calendarRemoveCredentials: async () => ({ ok: true }),
    calendarTestConnection: async () => ({
      ok: false,
      error: 'Connect Google Calendar in the desktop app.',
    }),
    calendarFetchEvents: async () => ({
      ok: false,
      connected: false,
      events: [],
      error: 'Connect in desktop app',
    }),
    calendarGetStatus: async () => ({ connected: false, calendarId: '', hasOAuth: false, hasApiKey: false }),
    speechGetStatus: async () => ({ configured: false }),
    speechSaveKey: async () => ({ ok: false, error: 'Add the Google speech API key in the desktop app.' }),
    speechOpenUserDataFolder: async () => ({ ok: false, error: 'Open the desktop app to view the data folder.' }),
    resetUserData: async () => ({ ok: false, error: 'Reset data in the desktop app (Settings → About).' }),
  };
}

let browserSingleton = null;
let httpJarvisSingleton = null;

/**
 * Preload API in Electron, HTTP bridge when opened from the local web UI URL, or an offline stub.
 */
export function getJarvis() {
  if (typeof window !== 'undefined' && window.jarvis) {
    return window.jarvis;
  }
  const web = getJarvisWebSession();
  if (web) {
    if (!httpJarvisSingleton) httpJarvisSingleton = createHttpJarvis(web);
    return httpJarvisSingleton;
  }
  if (typeof window !== 'undefined' && !window.__jarvisBrowserModeWarned) {
    window.__jarvisBrowserModeWarned = true;
    console.warn(
      '[JARVIS] No live desktop API — start the JARVIS desktop app on this PC, or open the web version from the sidebar while it is running.'
    );
  }
  if (!browserSingleton) browserSingleton = createBrowserJarvis();
  return browserSingleton;
}

/** True only in the Electron window (preload), not the system-browser shell. */
export function isElectron() {
  return typeof window !== 'undefined' && !!window.jarvis;
}

/** True when connected to the real JARVIS backend (Electron preload or local web UI with the app running). */
export function isJarvisBackendLive() {
  return isElectron() || !!getJarvisWebSession();
}

