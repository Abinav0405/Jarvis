/** Must match `DEFAULT_PORTS` in `electron/web-ui-server.js`. */

const JARVIS_WEB_UI_PORTS = new Set(['47843', '47844', '47845', '47846']);

/** Must match `JARVIS_FOCUS_PORT` in `electron/main.js`. */

const JARVIS_FOCUS_PORT = 47842;



let cachedFocusSecret = null;



function captureWebSessionFromUrl() {

  try {

    const u = new URL(window.location.href);

    const legacy = u.searchParams.get('jarvisSession');

    if (legacy) {

      sessionStorage.setItem('jarvisWebSession', legacy);

      u.searchParams.delete('jarvisSession');

      const next = `${u.pathname}${u.search}${u.hash}`;

      window.history.replaceState({}, '', next);

    }

  } catch {

    /* */

  }

}



export function getJarvisWebSession() {

  if (typeof window === 'undefined') return null;

  captureWebSessionFromUrl();

  const u = new URL(window.location.href);

  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return null;

  const port = u.port || '';

  if (!JARVIS_WEB_UI_PORTS.has(port)) return null;

  const token = sessionStorage.getItem('jarvisWebSession');

  if (!token) return null;

  return { origin: u.origin, token };

}



/**

 * Full `window.jarvis` API over HTTP — desktop JARVIS must stay running on this PC.

 */

export function createHttpJarvis({ origin, token }) {

  const base = origin.replace(/\/$/, '');

  const headers = () => ({

    'Content-Type': 'application/json',

    Authorization: `Bearer ${token}`,

  });



  async function rpc(channel, args = []) {

    const r = await fetch(`${base}/__jarvis/v1/invoke`, {

      method: 'POST',

      headers: headers(),

      body: JSON.stringify({ channel, args }),

    });

    const j = await r.json().catch(() => ({}));

    if (!j.ok) throw new Error(j.error || 'Request failed');

    return j.result;

  }



  const dataListeners = new Set();

  const navListeners = new Set();

  const appsProgressListeners = new Set();

  const windowShownListeners = new Set();

  const windowHiddenListeners = new Set();

  const screenReaderListeners = new Set();

  const focusSuggestionListeners = new Set();



  let es = null;

  function ensureSse() {

    if (es || typeof EventSource === 'undefined') return;

    try {

      es = new EventSource(`${base}/__jarvis/v1/events?token=${encodeURIComponent(token)}`);

      es.addEventListener('push', (ev) => {

        try {

          const { channel, args } = JSON.parse(ev.data);

          if (channel === 'jarvis:data-changed') dataListeners.forEach((fn) => fn());

          else if (channel === 'jarvis:navigate') navListeners.forEach((fn) => fn(args[0]));

          else if (channel === 'apps:progress') appsProgressListeners.forEach((fn) => fn(args[0]));

          else if (channel === 'jarvis:window-shown') windowShownListeners.forEach((fn) => fn());

          else if (channel === 'jarvis:window-hidden') windowHiddenListeners.forEach((fn) => fn());

          else if (channel === 'jarvis:screen-reader') screenReaderListeners.forEach((fn) => fn());

          else if (channel === 'jarvis:focus-suggestion') focusSuggestionListeners.forEach((fn) => fn());

        } catch {

          /* */

        }

      });

    } catch {

      /* */

    }

  }



  async function getFocusSecret() {

    if (cachedFocusSecret) return cachedFocusSecret;

    try {

      const info = await rpc('runtime:info', [{ fromWebClient: true }]);

      if (info?.focusSecret) {

        cachedFocusSecret = info.focusSecret;

        return cachedFocusSecret;

      }

    } catch {

      /* */

    }

    return null;

  }



  return {

    readData: () => rpc('data:read'),

    writeData: (data) => rpc('data:write', [data]),

    getSystemStats: () => rpc('system:stats'),

    getSystemStatsText: () => rpc('system:statsText'),

    getAboutComputer: () => rpc('system:aboutComputer'),

    setWindowOpacity: (opacity) => rpc('window:setOpacity', [opacity]),

    setFullScreen: (enabled) => rpc('window:setFullscreen', [enabled]),

    hideWindow: () => rpc('window:hide'),

    setMainHotkey: (accelerator) => rpc('hotkey:set', [accelerator]),

    openExternal: (url) => rpc('shell:openExternal', [url]),

    pickExe: () => rpc('dialog:pickExe'),

    pickImage: () => rpc('dialog:pickImage'),

    launchPreset: (preset) => rpc('preset:launch', [preset]),

    restorePresetSystem: () => rpc('preset:restoreSystem'),

    setStartup: (enabled) => rpc('startup:set', [enabled]),

    executeAction: (action) => rpc('actions:execute', [action]),

    ollamaChat: (payload) => rpc('ollama:chat', [payload]),

    listOllamaModels: (baseUrl) => rpc('ollama:listModels', [{ baseUrl }]),

    ollamaProbe: (baseUrl) => rpc('ollama:probe', [{ baseUrl }]),

    getAppsStore: () => rpc('apps:get'),

    scanApps: (opts) => rpc('apps:scan', opts),

    launchAppPath: (launchPath) => rpc('apps:launch', [launchPath]),

    setAppPins: (orderedIds) => rpc('apps:setPins', [orderedIds]),

    toggleAppPin: (appId) => rpc('apps:togglePin', [appId]),

    addAppToPreset: (presetId, launchPath) => rpc('apps:addToPreset', [{ presetId, launchPath }]),

    pinAppToDashboard: (entry) => rpc('apps:pinDashboard', [entry]),

    unpinDashboardApp: (appId) => rpc('apps:unpinDashboard', [appId]),

    showItemInFolder: (fullPath) => rpc('shell:showItemInFolder', [fullPath]),

    onAppsProgress: (cb) => {

      ensureSse();

      appsProgressListeners.add(cb);

      return () => appsProgressListeners.delete(cb);

    },

    onNavigate: (cb) => {

      ensureSse();

      navListeners.add(cb);

      return () => navListeners.delete(cb);

    },

    onWindowShown: (cb) => {

      ensureSse();

      windowShownListeners.add(cb);

      return () => windowShownListeners.delete(cb);

    },

    onWindowHidden: (cb) => {

      ensureSse();

      windowHiddenListeners.add(cb);

      return () => windowHiddenListeners.delete(cb);

    },

    onDataChanged: (cb) => {

      ensureSse();

      dataListeners.add(cb);

      return () => dataListeners.delete(cb);

    },

    capturePrimaryDisplay: () => rpc('screen:capturePrimary'),

    readChatFile: (absPath) => rpc('files:readForChat', [absPath]),

    readImageDataUrl: (absPath) => rpc('files:imageDataUrl', [absPath]),

    pickChatFile: () => rpc('dialog:pickChatFile'),

    onScreenReader: (cb) => {

      ensureSse();

      screenReaderListeners.add(cb);

      return () => screenReaderListeners.delete(cb);

    },

    getSuggestion: () => rpc('suggestions:current'),

    networkSpeed: () => rpc('network:speed'),

    networkPing: () => rpc('network:ping'),

    getUsage: () => rpc('usage:get'),

    clearUsage: () => rpc('usage:clear'),

    clearPatterns: () => rpc('patterns:clear'),

    unifiedSearch: (query) => rpc('search:unified', [query]),

    openSearchResult: (item) => rpc('search:open', [item]),

    getDashboardExtras: () => rpc('dashboard:extras'),

    fetchWeather: (city) => rpc('weather:fetch', [city]),

    searchWeatherCities: (query) => rpc('weather:searchCities', [query]),

    detectWeatherLocation: () => rpc('weather:detectLocation'),

    toggleDnd: () => rpc('system:toggleDnd'),

    getSystemVolume: () => rpc('system:getVolume'),
    setSystemVolume: (percent) => rpc('system:setVolume', [percent]),

    listProcesses: () => rpc('processes:list'),

    killProcess: (pid, name) => rpc('processes:kill', [pid, name]),

    networkFlushDns: () => rpc('network:flushDns'),

    networkTcp: () => rpc('network:tcp'),

    notifySuggestion: (title, body) => rpc('notify:suggestion', [{ title, body }]),

    onFocusSuggestion: (cb) => {

      ensureSse();

      focusSuggestionListeners.add(cb);

      return () => focusSuggestionListeners.delete(cb);

    },

    downloadOllamaInstaller: () => rpc('ollama:downloadInstaller'),

    getRuntimeInfo: () => rpc('runtime:info', [{ fromWebClient: true }]),

    openInBrowser: async () => ({

      ok: false,

      error: 'You are already in the web version. Open another tab from the desktop app if needed.',

    }),

    switchToDesktopApp: async () => {

      try {

        const secret = await getFocusSecret();

        const qs = secret ? `?secret=${encodeURIComponent(secret)}` : '';

        const r = await fetch(`http://127.0.0.1:${JARVIS_FOCUS_PORT}/focus${qs}`, {

          method: 'GET',

          signal: AbortSignal.timeout(4000),

        });

        if (r.ok) return { ok: true };

        return { ok: false, error: 'Desktop window did not respond. Is JARVIS running?' };

      } catch {

        return {

          ok: false,

          error:

            'Could not reach the JARVIS desktop app. Start JARVIS on this PC, keep it running, then try again.',

        };

      }

    },

    calendarSaveCredentials: (creds) => rpc('calendar:saveCredentials', [creds]),

    calendarRemoveCredentials: () => rpc('calendar:removeCredentials'),

    calendarTestConnection: (creds) => rpc('calendar:testConnection', [creds]),

    calendarFetchEvents: (opts) => rpc('calendar:fetchEvents', [opts]),

    calendarGetStatus: () => rpc('calendar:getStatus'),

    speechGetStatus: () => rpc('speech:getStatus'),

    speechSaveKey: (key) => rpc('speech:saveKey', [key]),

    speechOpenUserDataFolder: () => rpc('speech:openUserDataFolder'),

    resetUserData: () => rpc('app:resetUserData'),

  };

}

